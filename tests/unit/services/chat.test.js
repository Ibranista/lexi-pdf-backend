const prisma = require('../../../src/config/prisma');
const aiService = require('../../../src/services/ai.service');
const setupTestDB = require('../../utils/setupTestDB');

setupTestDB();

const reader = (email) => prisma.user.create({ data: { isAnonymous: false, aiTier: 'free', email } });

/** A session with one exchange in it, as a chat turn would leave behind. */
const thread = async (userId, sessionId) => {
  await prisma.chatSession.create({ data: { id: sessionId, userId, docKey: 'a'.repeat(64), title: 'Notes' } });
  await prisma.chatMessage.createMany({
    data: [
      { userId, sessionId, role: 'user', content: 'What is this about?' },
      { userId, sessionId, role: 'assistant', content: 'Mostly gradient descent.', kind: 'normal' },
    ],
  });
};

describe('clearing a conversation', () => {
  test('should delete the thread and the session it hung off', async () => {
    const user = await reader('one@example.com');
    await thread(user.id, 'session-1');

    const deleted = await aiService.clearChat(user.id, 'session-1');

    expect(deleted).toBe(2);
    expect(await aiService.chatHistory(user.id, 'session-1')).toEqual([]);
    expect(await prisma.chatSession.count({ where: { userId: user.id } })).toBe(0);
  });

  test('should leave another reader with the same session id untouched', async () => {
    const mine = await reader('mine@example.com');
    const theirs = await reader('theirs@example.com');
    await thread(mine.id, 'shared-id');
    await thread(theirs.id, 'shared-id');

    await aiService.clearChat(mine.id, 'shared-id');

    expect(await aiService.chatHistory(mine.id, 'shared-id')).toEqual([]);
    expect(await aiService.chatHistory(theirs.id, 'shared-id')).toHaveLength(2);
  });

  test('should be a no-op for a thread that never reached the server', async () => {
    const user = await reader('empty@example.com');
    await expect(aiService.clearChat(user.id, 'never-existed')).resolves.toBe(0);
  });

  test("should leave the reader's other documents alone", async () => {
    const user = await reader('two@example.com');
    await thread(user.id, 'session-a');
    await thread(user.id, 'session-b');

    await aiService.clearChat(user.id, 'session-a');

    expect(await aiService.chatHistory(user.id, 'session-b')).toHaveLength(2);
  });
});
