const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const httpStatus = require('http-status');
const app = require('../../src/app');
const config = require('../../src/config/config');
const prisma = require('../../src/config/prisma');
const setupTestDB = require('../utils/setupTestDB');
const { deviceBody } = require('../fixtures/lexi.fixture');

setupTestDB();

describe('Anonymous-first identity', () => {
  describe('POST /v1/auth/device', () => {
    test('should return an anonymous AuthResponse with empty email and name', async () => {
      const res = await request(app).post('/v1/auth/device').send(deviceBody(uuidv4())).expect(httpStatus.OK);

      expect(res.body.user).toEqual({
        id: expect.anything(),
        email: '',
        name: '',
        role: 'USER',
        isEmailVerified: false,
        isAnonymous: true,
        hasCompletedOnboarding: false,
        interests: [],
        onboardedAt: null,
      });
      expect(res.body.tokens).toEqual({
        access: { token: expect.anything(), expires: expect.anything() },
        refresh: { token: expect.anything(), expires: expect.anything() },
      });
    });

    test('should be idempotent: the same deviceId returns the same user with fresh tokens', async () => {
      const body = deviceBody(uuidv4());

      const first = await request(app).post('/v1/auth/device').send(body).expect(httpStatus.OK);
      const second = await request(app).post('/v1/auth/device').send(body).expect(httpStatus.OK);

      expect(second.body.user.id).toBe(first.body.user.id);
      expect(second.body.tokens.access.token).toEqual(expect.any(String));
      expect(await prisma.user.count()).toBe(1);
    });

    test('should reject a deviceId that is not a uuid', async () => {
      await request(app)
        .post('/v1/auth/device')
        .send({ ...deviceBody('not-a-uuid') })
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should hand a signed-out device a fresh empty anonymous user, not the account it linked', async () => {
      const body = deviceBody(uuidv4());
      const anon = await request(app).post('/v1/auth/device').send(body);

      await request(app)
        .post('/v1/auth/link/email')
        .set('Authorization', `Bearer ${anon.body.tokens.access.token}`)
        .send({ email: 'reader@example.com', password: 'password1', name: 'Reader' })
        .expect(httpStatus.OK);

      // §1.4: after logout the client re-registers the device
      const afterLogout = await request(app).post('/v1/auth/device').send(body).expect(httpStatus.OK);

      expect(afterLogout.body.user.id).not.toBe(anon.body.user.id);
      expect(afterLogout.body.user.isAnonymous).toBe(true);
      expect(afterLogout.body.user.email).toBe('');
    });
  });

  describe('POST /v1/auth/link/email', () => {
    let anonymous;

    beforeEach(async () => {
      const res = await request(app).post('/v1/auth/device').send(deviceBody(uuidv4()));
      anonymous = res.body;
    });

    test('should upgrade the anonymous row in place and issue new tokens', async () => {
      const res = await request(app)
        .post('/v1/auth/link/email')
        .set('Authorization', `Bearer ${anonymous.tokens.access.token}`)
        .send({ email: 'reader@example.com', password: 'password1', name: 'Reader' })
        .expect(httpStatus.OK);

      // the same row: nothing had to move
      expect(res.body.user.id).toBe(anonymous.user.id);
      expect(res.body.user).toMatchObject({ email: 'reader@example.com', name: 'Reader', isAnonymous: false });

      // the pre-upgrade refresh tokens are revoked, leaving only the new one
      expect(await prisma.token.count({ where: { userId: anonymous.user.id, type: 'refresh' } })).toBe(1);

      const stored = await prisma.user.findUnique({ where: { id: anonymous.user.id } });
      expect(stored.aiTier).toBe('free');
      expect(stored.aiResetsAt).not.toBeNull();
    });

    test('should return 409 ACCOUNT_EXISTS when the email is already registered', async () => {
      const other = await request(app).post('/v1/auth/device').send(deviceBody(uuidv4()));
      await request(app)
        .post('/v1/auth/link/email')
        .set('Authorization', `Bearer ${other.body.tokens.access.token}`)
        .send({ email: 'taken@example.com', password: 'password1', name: 'Taken' });

      const res = await request(app)
        .post('/v1/auth/link/email')
        .set('Authorization', `Bearer ${anonymous.tokens.access.token}`)
        .send({ email: 'taken@example.com', password: 'password1', name: 'Reader' })
        .expect(httpStatus.CONFLICT);

      expect(res.body).toMatchObject({ code: 409, reason: 'ACCOUNT_EXISTS' });
    });

    test('should return 409 ALREADY_LINKED when the caller is already a full account', async () => {
      await request(app)
        .post('/v1/auth/link/email')
        .set('Authorization', `Bearer ${anonymous.tokens.access.token}`)
        .send({ email: 'reader@example.com', password: 'password1', name: 'Reader' });

      const res = await request(app)
        .post('/v1/auth/link/email')
        .set('Authorization', `Bearer ${anonymous.tokens.access.token}`)
        .send({ email: 'second@example.com', password: 'password1', name: 'Reader' })
        .expect(httpStatus.CONFLICT);

      expect(res.body.reason).toBe('ALREADY_LINKED');
    });

    test('should return 401 without a token', async () => {
      await request(app)
        .post('/v1/auth/link/email')
        .send({ email: 'reader@example.com', password: 'password1', name: 'Reader' })
        .expect(httpStatus.UNAUTHORIZED);
    });
  });

  describe('PATCH /v1/auth/onboarding', () => {
    let anonymous;
    let auth;

    beforeEach(async () => {
      const res = await request(app).post('/v1/auth/device').send(deviceBody(uuidv4()));
      anonymous = res.body;
      auth = `Bearer ${anonymous.tokens.access.token}`;
    });

    test('should record onboarding against the anonymous row and echo it back', async () => {
      const res = await request(app)
        .patch('/v1/auth/onboarding')
        .set('Authorization', auth)
        .send({ hasCompletedOnboarding: true, interests: ['textbooks', 'philosophy'] })
        .expect(httpStatus.OK);

      expect(res.body.user).toMatchObject({
        id: anonymous.user.id,
        hasCompletedOnboarding: true,
        interests: ['textbooks', 'philosophy'],
      });
      expect(res.body.user.onboardedAt).toEqual(expect.any(Number));
    });

    test('should be readable back from GET /v1/auth/me', async () => {
      await request(app).patch('/v1/auth/onboarding').set('Authorization', auth).send({ hasCompletedOnboarding: true });

      const res = await request(app).get('/v1/auth/me').set('Authorization', auth).expect(httpStatus.OK);
      expect(res.body.user).toMatchObject({ id: anonymous.user.id, hasCompletedOnboarding: true, isAnonymous: true });
    });

    test('should keep the answer when the anonymous row is upgraded in place', async () => {
      await request(app)
        .patch('/v1/auth/onboarding')
        .set('Authorization', auth)
        .send({ hasCompletedOnboarding: true, interests: ['fiction'] });

      const linked = await request(app)
        .post('/v1/auth/link/email')
        .set('Authorization', auth)
        .send({ email: 'reader@example.com', password: 'password1', name: 'Reader' })
        .expect(httpStatus.OK);

      expect(linked.body.user).toMatchObject({ hasCompletedOnboarding: true, interests: ['fiction'] });
    });

    test('should not re-ask a device that signed out', async () => {
      const body = deviceBody(uuidv4());
      const anon = await request(app).post('/v1/auth/device').send(body);
      const token = `Bearer ${anon.body.tokens.access.token}`;

      await request(app).patch('/v1/auth/onboarding').set('Authorization', token).send({ hasCompletedOnboarding: true });
      await request(app)
        .post('/v1/auth/link/email')
        .set('Authorization', token)
        .send({ email: 'signedout@example.com', password: 'password1', name: 'Reader' });

      // the fresh anonymous row this device gets after logout is empty of
      // everything except the answer to "have you seen onboarding here?"
      const afterLogout = await request(app).post('/v1/auth/device').send(body).expect(httpStatus.OK);
      expect(afterLogout.body.user.id).not.toBe(anon.body.user.id);
      expect(afterLogout.body.user.hasCompletedOnboarding).toBe(true);
    });

    test('should reject an unknown interest id', async () => {
      await request(app)
        .patch('/v1/auth/onboarding')
        .set('Authorization', auth)
        .send({ interests: ['astrology'] })
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 401 without a token', async () => {
      await request(app).patch('/v1/auth/onboarding').send({ hasCompletedOnboarding: true }).expect(httpStatus.UNAUTHORIZED);
      await request(app).get('/v1/auth/me').expect(httpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /v1/auth/link/google', () => {
    test('should refuse a bogus id token with a reason the client can branch on', async () => {
      const anon = await request(app).post('/v1/auth/device').send(deviceBody(uuidv4()));

      const res = await request(app)
        .post('/v1/auth/link/google')
        .set('Authorization', `Bearer ${anon.body.tokens.access.token}`)
        .send({ idToken: 'a.b.c' });

      // 503 until a GOOGLE_CLIENT_ID is configured, 401 once one is
      const expected = config.google.clientIds.length
        ? { status: httpStatus.UNAUTHORIZED, reason: 'INVALID_ID_TOKEN' }
        : { status: httpStatus.SERVICE_UNAVAILABLE, reason: 'GOOGLE_NOT_CONFIGURED' };

      expect(res.status).toBe(expected.status);
      expect(res.body.reason).toBe(expected.reason);
    });
  });
});
