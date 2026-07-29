const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const httpStatus = require('http-status');
const app = require('../../src/app');
const prisma = require('../../src/config/prisma');
const setupTestDB = require('../utils/setupTestDB');
const { docKeyFor, deviceBody, documentBody, annotationBody, vocabBody } = require('../fixtures/lexi.fixture');

setupTestDB();

const docKey = docKeyFor('Ego Is the Enemy.pdf', 4823192);

/** A device with an anonymous session, ready to sync. */
const newDevice = async () => {
  const deviceId = uuidv4();
  const res = await request(app).post('/v1/auth/device').send(deviceBody(deviceId));
  return { deviceId, token: res.body.tokens.access.token, userId: res.body.user.id };
};

const push = (device, changes, cursor = null) =>
  request(app)
    .post('/v1/sync')
    .set('Authorization', `Bearer ${device.token}`)
    .send({ cursor, deviceId: device.deviceId, changes });

describe('POST /v1/sync', () => {
  test('should accept a push from an anonymous user and not echo it back to the same device', async () => {
    const device = await newDevice();

    const res = await push(device, {
      documents: [documentBody(docKey)],
      annotations: [annotationBody(docKey)],
      vocab: [vocabBody(docKey)],
    }).expect(httpStatus.OK);

    expect(res.body.cursor).toEqual(expect.any(String));
    expect(res.body.serverTime).toEqual(expect.any(Number));
    // rule 3: a device does not echo its own push back into itself
    expect(res.body.changes).toEqual({ documents: [], annotations: [], vocab: [] });

    const stored = await prisma.document.findUnique({ where: { userId_docKey: { userId: device.userId, docKey } } });
    expect(stored).toMatchObject({ name: 'Ego Is the Enemy.pdf', page: 47, bookmarks: [12, 47, 88] });
  });

  test('should store annotation text verbatim, including characters a sanitizer would escape', async () => {
    const device = await newDevice();
    const text = 'the "ego" & the <self> — verbatim';

    await push(device, { annotations: [annotationBody(docKey, { text })] }).expect(httpStatus.OK);

    const stored = await prisma.annotation.findFirst({ where: { userId: device.userId } });
    expect(stored.text).toBe(text);
  });

  test('should hand a second device everything the first pushed', async () => {
    const first = await newDevice();
    await push(first, { documents: [documentBody(docKey)], annotations: [annotationBody(docKey)] });

    // a second device on the same user: same deviceId row, different id
    const second = { ...first, deviceId: uuidv4() };
    await prisma.device.create({ data: { deviceId: second.deviceId, userId: first.userId } });

    const res = await push(second, {}).expect(httpStatus.OK);

    expect(res.body.changes.documents).toHaveLength(1);
    expect(res.body.changes.documents[0]).toMatchObject({ docKey, page: 47, deletedAt: null });
    expect(res.body.changes.annotations[0]).toMatchObject({ id: 'm9x2k1-3', note: '', deletedAt: null });
    // timestamps go out as epoch ms, never ISO strings
    expect(typeof res.body.changes.documents[0].updatedAt).toBe('number');
  });

  test('should apply the newer updatedAt and hand back the server row when the push is stale', async () => {
    const device = await newDevice();
    await push(device, { documents: [documentBody(docKey, { page: 47, updatedAt: 2000 })] });

    const stale = await push(device, { documents: [documentBody(docKey, { page: 9, updatedAt: 1000 })] }).expect(
      httpStatus.OK
    );

    // the server won, so the client is told what the server holds
    expect(stale.body.changes.documents[0]).toMatchObject({ page: 47, updatedAt: 2000 });

    const winner = await push(device, { documents: [documentBody(docKey, { page: 88, updatedAt: 3000 })] });
    expect(winner.body.changes.documents).toEqual([]);
    const stored = await prisma.document.findUnique({ where: { userId_docKey: { userId: device.userId, docKey } } });
    expect(stored.page).toBe(88);
  });

  test('should return a tombstone to the other device rather than dropping the row', async () => {
    const first = await newDevice();
    await push(first, { annotations: [annotationBody(docKey)] });

    const deletedAt = Date.now();
    await push(first, { annotations: [annotationBody(docKey, { updatedAt: deletedAt, deletedAt })] });

    const second = { ...first, deviceId: uuidv4() };
    await prisma.device.create({ data: { deviceId: second.deviceId, userId: first.userId } });
    const res = await push(second, {});

    expect(res.body.changes.annotations).toHaveLength(1);
    expect(res.body.changes.annotations[0].deletedAt).toBe(deletedAt);
    // the row is retained, not deleted
    expect(await prisma.annotation.count({ where: { userId: first.userId } })).toBe(1);
  });

  test('should only return changes since the cursor', async () => {
    const first = await newDevice();
    const second = { ...first, deviceId: uuidv4() };
    await prisma.device.create({ data: { deviceId: second.deviceId, userId: first.userId } });

    await push(first, { documents: [documentBody(docKey)] });
    const caughtUp = await push(second, {});
    expect(caughtUp.body.changes.documents).toHaveLength(1);

    const nothingNew = await push(second, {}, caughtUp.body.cursor);
    expect(nothingNew.body.changes.documents).toEqual([]);

    await push(first, { vocab: [vocabBody(docKey)] });
    const later = await push(second, {}, caughtUp.body.cursor);
    expect(later.body.changes.documents).toEqual([]);
    expect(later.body.changes.vocab).toHaveLength(1);
  });

  test('should treat an unreadable cursor as a first sync instead of failing', async () => {
    const first = await newDevice();
    await push(first, { documents: [documentBody(docKey)] });

    const second = { ...first, deviceId: uuidv4() };
    await prisma.device.create({ data: { deviceId: second.deviceId, userId: first.userId } });

    const res = await push(second, {}, 'not-a-cursor').expect(httpStatus.OK);
    expect(res.body.changes.documents).toHaveLength(1);
  });

  test('should return 409 ID_CONFLICT when a client id is reused for a different annotation', async () => {
    const device = await newDevice();
    await push(device, { annotations: [annotationBody(docKey, { createdAt: 1000, updatedAt: 1000 })] });

    const res = await push(device, {
      annotations: [annotationBody(docKey, { createdAt: 2000, updatedAt: 3000, text: 'a different passage' })],
    }).expect(httpStatus.CONFLICT);

    expect(res.body).toMatchObject({ code: 409, reason: 'ID_CONFLICT', ids: ['m9x2k1-3'] });
    // nothing was written: the client re-issues the id and pushes the batch again
    const stored = await prisma.annotation.findFirst({ where: { userId: device.userId } });
    expect(stored.text).toBe('Ryan Holiday');
  });

  test('should reject a body over the payload cap with PAYLOAD_TOO_LARGE', async () => {
    const device = await newDevice();
    const fat = annotationBody(docKey, { text: 'x'.repeat(2 * 1024 * 1024 + 1024) });

    const res = await push(device, { annotations: [fat] }).expect(httpStatus.REQUEST_ENTITY_TOO_LARGE);
    expect(res.body.reason).toBe('PAYLOAD_TOO_LARGE');
  });

  test('should reject a colour outside the four the client renders', async () => {
    const device = await newDevice();
    await push(device, { annotations: [annotationBody(docKey, { color: 'purple' })] }).expect(httpStatus.BAD_REQUEST);
  });

  test('should return 401 without a token', async () => {
    await request(app).post('/v1/sync').send({ deviceId: uuidv4(), changes: {} }).expect(httpStatus.UNAUTHORIZED);
  });
});

describe('POST /v1/sync/merge', () => {
  test('should fold the anonymous data into the account and delete the anonymous user', async () => {
    const anon = await newDevice();
    await push(anon, {
      documents: [documentBody(docKey)],
      annotations: [annotationBody(docKey)],
      vocab: [vocabBody(docKey)],
    });

    // the account the user turns out to already have
    const account = await newDevice();
    await request(app)
      .post('/v1/auth/link/email')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ email: 'reader@example.com', password: 'password1', name: 'Reader' });

    const res = await request(app)
      .post('/v1/sync/merge')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ fromDeviceId: anon.deviceId })
      .expect(httpStatus.OK);

    expect(res.body).toEqual({ merged: { documents: 1, annotations: 1, vocab: 1 } });
    expect(await prisma.user.findUnique({ where: { id: anon.userId } })).toBeNull();
    expect(await prisma.annotation.count({ where: { userId: account.userId } })).toBe(1);
  });

  test('should keep the newer row on collision', async () => {
    const anon = await newDevice();
    await push(anon, { documents: [documentBody(docKey, { page: 12, updatedAt: 5000 })] });

    const account = await newDevice();
    await request(app)
      .post('/v1/auth/link/email')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ email: 'reader@example.com', password: 'password1', name: 'Reader' });
    await push(account, { documents: [documentBody(docKey, { page: 99, updatedAt: 1000 })] });

    await request(app)
      .post('/v1/sync/merge')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ fromDeviceId: anon.deviceId })
      .expect(httpStatus.OK);

    const stored = await prisma.document.findUnique({ where: { userId_docKey: { userId: account.userId, docKey } } });
    expect(stored.page).toBe(12);
  });

  test('should carry the anonymous onboarding answer into an account that never onboarded', async () => {
    const anon = await newDevice();
    await request(app)
      .patch('/v1/auth/onboarding')
      .set('Authorization', `Bearer ${anon.token}`)
      .send({ hasCompletedOnboarding: true, interests: ['philosophy'] });

    const account = await newDevice();
    await request(app)
      .post('/v1/auth/link/email')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ email: 'reader@example.com', password: 'password1', name: 'Reader' });

    await request(app)
      .post('/v1/sync/merge')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ fromDeviceId: anon.deviceId })
      .expect(httpStatus.OK);

    const stored = await prisma.user.findUnique({ where: { id: account.userId } });
    expect(stored.hasCompletedOnboarding).toBe(true);
    expect(stored.interests).toEqual(['philosophy']);
  });

  test('should never un-onboard an account that absorbs a device that never onboarded', async () => {
    const anon = await newDevice();

    const account = await newDevice();
    await request(app)
      .post('/v1/auth/link/email')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ email: 'reader@example.com', password: 'password1', name: 'Reader' });
    await request(app)
      .patch('/v1/auth/onboarding')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ hasCompletedOnboarding: true, interests: ['history'] });

    await request(app)
      .post('/v1/sync/merge')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ fromDeviceId: anon.deviceId })
      .expect(httpStatus.OK);

    const stored = await prisma.user.findUnique({ where: { id: account.userId } });
    expect(stored.hasCompletedOnboarding).toBe(true);
    expect(stored.interests).toEqual(['history']);
  });

  test('should be idempotent: an unknown or already-merged device is zero counts, not an error', async () => {
    const account = await newDevice();

    const res = await request(app)
      .post('/v1/sync/merge')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ fromDeviceId: uuidv4() })
      .expect(httpStatus.OK);

    expect(res.body).toEqual({ merged: { documents: 0, annotations: 0, vocab: 0 } });
  });
});

describe('Tombstone retention', () => {
  test('should purge tombstones older than the retention window', async () => {
    const device = await newDevice();
    const longAgo = Date.now() - 91 * 24 * 60 * 60 * 1000;

    await push(device, { annotations: [annotationBody(docKey, { updatedAt: longAgo, deletedAt: longAgo })] });

    expect(await prisma.annotation.count({ where: { userId: device.userId } })).toBe(0);
  });
});
