const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const httpStatus = require('http-status');

// the model is the one thing we never call for real in a test
jest.mock('../../src/config/langchain', () => ({
  chatModel: jest.fn(),
  genai: jest.fn(),
  assertConfigured: jest.fn(),
}));

const app = require('../../src/app');
const config = require('../../src/config/config');
const prisma = require('../../src/config/prisma');
const { chatModel } = require('../../src/config/langchain');
const setupTestDB = require('../utils/setupTestDB');
const { docKeyFor, deviceBody } = require('../fixtures/lexi.fixture');

setupTestDB();

const docKey = docKeyFor('Ego Is the Enemy.pdf', 4823192);

/** Make the next structured-output call resolve to `value`. */
const modelReturns = (value) => {
  chatModel.mockReturnValue({ withStructuredOutput: () => ({ invoke: async () => value }) });
};

const newDevice = async () => {
  const deviceId = uuidv4();
  const res = await request(app).post('/v1/auth/device').send(deviceBody(deviceId));
  return { deviceId, token: res.body.tokens.access.token, userId: res.body.user.id };
};

describe('POST /v1/ai/translate', () => {
  test('should return the word card with the quota block', async () => {
    const device = await newDevice();
    modelReturns({
      word: 'optional',
      pos: 'adjective',
      tr: 'አማራጭ',
      translit: 'amarach',
      s1: 'It means night no longer forced people to stop — staying active became a choice.',
      s2: "The phrase marks the book's turning point: light gave people control over their time.",
    });

    const res = await request(app)
      .post('/v1/ai/translate')
      .set('Authorization', `Bearer ${device.token}`)
      .send({ docKey, text: 'optional', context: 'the sentence it came from', page: 47, targetLang: 'am' })
      .expect(httpStatus.OK);

    expect(res.body).toMatchObject({ word: 'optional', tr: 'አማራጭ', lang: 'am', langName: 'Amharic' });
    // Amharic has no voice, so the key is omitted and the client hides "Hear it"
    expect(res.body).not.toHaveProperty('audioUrl');
    expect(res.body.quota).toEqual({
      used: 1,
      limit: config.ai.quota.anonymous,
      resetsAt: null,
      tier: 'anonymous',
    });
  });

  test('should clamp s1 and s2 to what the card can show', async () => {
    const device = await newDevice();
    modelReturns({ word: 'optional', pos: 'adjective', tr: 'አማራጭ', s1: 'x'.repeat(400), s2: 'y'.repeat(400) });

    const res = await request(app)
      .post('/v1/ai/translate')
      .set('Authorization', `Bearer ${device.token}`)
      .send({ docKey, text: 'optional', targetLang: 'am' })
      .expect(httpStatus.OK);

    expect(res.body.s1.length).toBeLessThanOrEqual(140);
    expect(res.body.s2.length).toBeLessThanOrEqual(140);
  });

  test('should return 402 with the sign-in wall flags once the anonymous allowance is gone', async () => {
    const device = await newDevice();
    await prisma.user.update({ where: { id: device.userId }, data: { aiUsed: config.ai.quota.anonymous } });
    modelReturns({ word: 'optional', pos: 'adjective', tr: 'አማራጭ', s1: 'a', s2: 'b' });

    const res = await request(app)
      .post('/v1/ai/translate')
      .set('Authorization', `Bearer ${device.token}`)
      .send({ docKey, text: 'optional', targetLang: 'am' })
      .expect(httpStatus.PAYMENT_REQUIRED);

    expect(res.body).toMatchObject({
      code: 402,
      reason: 'AI_QUOTA_EXHAUSTED',
      requiresAuth: true,
      quota: { used: config.ai.quota.anonymous, limit: config.ai.quota.anonymous, resetsAt: null, tier: 'anonymous' },
    });
  });

  test('should not charge a credit when generation fails', async () => {
    const device = await newDevice();
    chatModel.mockReturnValue({
      withStructuredOutput: () => ({
        invoke: async () => {
          throw new Error('provider is down');
        },
      }),
    });

    await request(app)
      .post('/v1/ai/translate')
      .set('Authorization', `Bearer ${device.token}`)
      .send({ docKey, text: 'optional', targetLang: 'am' })
      .expect(httpStatus.INTERNAL_SERVER_ERROR);

    const user = await prisma.user.findUnique({ where: { id: device.userId } });
    expect(user.aiUsed).toBe(0);
  });

  test('should reject a target language the client cannot render', async () => {
    const device = await newDevice();
    await request(app)
      .post('/v1/ai/translate')
      .set('Authorization', `Bearer ${device.token}`)
      .send({ docKey, text: 'optional', targetLang: 'fr' })
      .expect(httpStatus.BAD_REQUEST);
  });
});

describe('POST /v1/ai/chat', () => {
  const ask = (device, message) =>
    request(app).post('/v1/ai/chat').set('Authorization', `Bearer ${device.token}`).send({
      docKey,
      sessionId: '9c1e-session',
      title: 'Ego Is the Enemy',
      author: 'Ryan Holiday',
      page: 47,
      excerpt: 'the text of the current page',
      message,
    });

  test('should answer a question about the book', async () => {
    const device = await newDevice();
    modelReturns({
      onTopic: true,
      kind: 'normal',
      reply: 'Sherman is the counter-example the book keeps reaching for.',
      redirect: 'Back to the book?',
    });

    const res = await ask(device, 'Why does he keep coming back to Sherman?').expect(httpStatus.OK);

    expect(res.body).toMatchObject({ kind: 'normal', sessionId: '9c1e-session' });
    expect(res.body.reply).toContain('Sherman');
    expect(res.body.quota.used).toBe(1);
  });

  test('should never let an off-topic answer reach the client, even when the model writes one', async () => {
    const device = await newDevice();
    modelReturns({
      onTopic: false,
      // the model contradicts itself: it answered anyway and called it normal
      kind: 'normal',
      reply: 'The capital of France is Paris, and here is everything else about it.',
      redirect: "Happy to chat, but let's park that — you were doing well in Chapter 3.",
    });

    const res = await ask(device, 'What is the capital of France?').expect(httpStatus.OK);

    expect(res.body.kind).toBe('drift');
    expect(res.body.reply).toBe("Happy to chat, but let's park that — you were doing well in Chapter 3.");
    expect(res.body.reply).not.toContain('Paris');
  });

  test('should keep the session so the next turn has history', async () => {
    const device = await newDevice();
    modelReturns({ onTopic: true, kind: 'normal', reply: 'Because ego is the enemy.', redirect: '' });

    await ask(device, 'Why?');
    await ask(device, 'And then?');

    const messages = await prisma.chatMessage.findMany({ where: { userId: device.userId } });
    expect(messages).toHaveLength(4); // two user turns, two replies
  });
});

describe('GET /v1/ai/tts', () => {
  test('should return 200 with no audioUrl and no charge for a language with no voice', async () => {
    const device = await newDevice();

    const res = await request(app)
      .get('/v1/ai/tts')
      .query({ text: 'አማራጭ', lang: 'am' })
      .set('Authorization', `Bearer ${device.token}`)
      .expect(httpStatus.OK);

    expect(res.body).not.toHaveProperty('audioUrl');
    expect(res.body.quota.used).toBe(0);
  });
});

describe('POST /v1/ai/context', () => {
  test('should accept a chunk, report cumulative progress, and cost nothing', async () => {
    const device = await newDevice();
    const pages = Array.from({ length: 20 }, (unused, index) => ({ page: index + 1, text: 'page text' }));

    const first = await request(app)
      .post('/v1/ai/context')
      .set('Authorization', `Bearer ${device.token}`)
      .send({ docKey, title: 'Ego Is the Enemy', author: 'Ryan Holiday', pageCount: 40, pages })
      .expect(httpStatus.ACCEPTED);

    expect(first.body).toEqual({ docKey, indexed: 20, ready: false });

    const second = await request(app)
      .post('/v1/ai/context')
      .set('Authorization', `Bearer ${device.token}`)
      .send({ docKey, pageCount: 40, pages })
      .expect(httpStatus.ACCEPTED);

    expect(second.body).toEqual({ docKey, indexed: 40, ready: true });

    const user = await prisma.user.findUnique({ where: { id: device.userId } });
    expect(user.aiUsed).toBe(0);
  });
});
