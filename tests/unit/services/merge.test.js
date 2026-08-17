const prisma = require('../../../src/config/prisma');
const syncService = require('../../../src/services/sync.service');
const setupTestDB = require('../../utils/setupTestDB');

setupTestDB();

/**
 * Signing into an account that already exists leaves the anonymous row behind
 * holding everything this phone read before. `/sync/merge` is what carries it
 * across — and what used to carry only *some* of it: the closing `user.delete`
 * cascaded the conversation, the reader's style memory and the document index
 * away, so signing in was met by a companion who had never spoken to you.
 */

const DOC = 'a'.repeat(64);
const OTHER_DOC = 'b'.repeat(64);

const account = (email) => prisma.user.create({ data: { isAnonymous: false, aiTier: 'free', email } });

/** An anonymous reader with a device, a thread, a style memory and an index. */
const anonymousReader = async (deviceId) => {
  const user = await prisma.user.create({
    data: { isAnonymous: true, aiTier: 'anonymous', devices: { create: { deviceId } } },
  });
  await prisma.chatSession.create({ data: { id: DOC, userId: user.id, docKey: DOC, title: 'Notes' } });
  await prisma.chatMessage.createMany({
    data: [
      { userId: user.id, sessionId: DOC, role: 'user', content: 'What is this about?' },
      { userId: user.id, sessionId: DOC, role: 'assistant', content: 'Mostly gradient descent.', kind: 'normal' },
    ],
  });
  await prisma.userMemory.create({ data: { userId: user.id, style: 'Likes short answers.' } });
  await prisma.documentIndex.create({ data: { userId: user.id, docKey: DOC, title: 'Notes', pagesIndexed: 40 } });
  return user;
};

describe('folding a device into an account', () => {
  test('should carry the conversation across', async () => {
    const user = await account('one@example.com');
    const source = await anonymousReader('device-1');

    const { merged } = await syncService.merge(user, 'device-1');

    expect(merged.messages).toBe(2);
    expect(merged.sessions).toBe(1);
    const messages = await prisma.chatMessage.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
    expect(messages.map((m) => m.content)).toEqual(['What is this about?', 'Mostly gradient descent.']);
    expect(await prisma.user.findUnique({ where: { id: source.id } })).toBeNull();
  });

  test('should merge two threads about the same book rather than colliding', async () => {
    const user = await account('two@example.com');
    // The account has already talked about this document on another phone —
    // the session id is the document key, so both rows hold one for it.
    await prisma.chatSession.create({ data: { id: DOC, userId: user.id, docKey: DOC, title: 'Notes' } });
    await prisma.chatMessage.create({
      data: { userId: user.id, sessionId: DOC, role: 'user', content: 'Asked on the laptop' },
    });
    await anonymousReader('device-2');

    const { merged } = await syncService.merge(user, 'device-2');

    expect(merged.messages).toBe(2);
    // No second session for the same document, and nothing dropped.
    expect(await prisma.chatSession.count({ where: { userId: user.id, id: DOC } })).toBe(1);
    expect(await prisma.chatMessage.count({ where: { userId: user.id, sessionId: DOC } })).toBe(3);
  });

  test('should keep the account style memory over the device one', async () => {
    const user = await account('three@example.com');
    await prisma.userMemory.create({ data: { userId: user.id, style: 'Learned across every device.' } });
    await anonymousReader('device-3');

    await syncService.merge(user, 'device-3');

    const memory = await prisma.userMemory.findUnique({ where: { userId: user.id } });
    expect(memory.style).toBe('Learned across every device.');
  });

  test('should adopt the device style memory when the account has none', async () => {
    const user = await account('four@example.com');
    await anonymousReader('device-4');

    await syncService.merge(user, 'device-4');

    const memory = await prisma.userMemory.findUnique({ where: { userId: user.id } });
    expect(memory.style).toBe('Likes short answers.');
  });

  test('should keep whichever index got further through the book', async () => {
    const user = await account('five@example.com');
    await prisma.documentIndex.create({ data: { userId: user.id, docKey: DOC, pagesIndexed: 10 } });
    await prisma.documentIndex.create({ data: { userId: user.id, docKey: OTHER_DOC, pagesIndexed: 99 } });
    await anonymousReader('device-5');

    await syncService.merge(user, 'device-5');

    const rows = await prisma.documentIndex.findMany({ where: { userId: user.id } });
    const byDoc = Object.fromEntries(rows.map((row) => [row.docKey, row.pagesIndexed]));
    expect(byDoc[DOC]).toBe(40);
    expect(byDoc[OTHER_DOC]).toBe(99);
  });

  test('should leave the device attached to the account, not delete it with the anonymous row', async () => {
    // The Device row is how this phone is recognised after a reinstall. Losing
    // it makes the device look brand new next time it asks for a session, and a
    // brand new device gets a fresh anonymous allowance — the free tier handed
    // out again to someone who has already spent it.
    const user = await account('six@example.com');
    await anonymousReader('device-6');

    await syncService.merge(user, 'device-6');

    const device = await prisma.device.findUnique({ where: { deviceId: 'device-6' } });
    expect(device).not.toBeNull();
    expect(device.userId).toBe(user.id);
  });

  test('should be a no-op the second time, because the client retries it', async () => {
    const user = await account('seven@example.com');
    await anonymousReader('device-7');

    await syncService.merge(user, 'device-7');
    const { merged } = await syncService.merge(user, 'device-7');

    expect(merged).toEqual({ documents: 0, annotations: 0, vocab: 0, sessions: 0, messages: 0 });
    expect(await prisma.chatMessage.count({ where: { userId: user.id } })).toBe(2);
  });
});
