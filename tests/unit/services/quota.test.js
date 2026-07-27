const httpStatus = require('http-status');
const config = require('../../../src/config/config');
const prisma = require('../../../src/config/prisma');
const quotaService = require('../../../src/services/quota.service');
const setupTestDB = require('../../utils/setupTestDB');

setupTestDB();

const anonymousUser = () => prisma.user.create({ data: { isAnonymous: true, aiTier: 'anonymous' } });

const freeUser = (overrides = {}) =>
  prisma.user.create({
    data: { isAnonymous: false, aiTier: 'free', email: 'reader@example.com', ...overrides },
  });

describe('AI quota', () => {
  describe('state', () => {
    test('should report an anonymous allowance as non-renewing', async () => {
      const user = await anonymousUser();
      expect(quotaService.state(user)).toEqual({
        used: 0,
        limit: config.ai.quota.anonymous,
        resetsAt: null,
        tier: 'anonymous',
      });
    });

    test('should report resetsAt as epoch milliseconds', async () => {
      const resetsAt = new Date('2026-08-26T12:00:00.000Z');
      const user = await freeUser({ aiResetsAt: resetsAt });
      expect(quotaService.state(user).resetsAt).toBe(resetsAt.getTime());
    });
  });

  describe('reserve', () => {
    test('should take one unit', async () => {
      const user = await anonymousUser();
      const reserved = await quotaService.reserve(user);

      expect(reserved.aiUsed).toBe(1);
      expect((await prisma.user.findUnique({ where: { id: user.id } })).aiUsed).toBe(1);
    });

    test('should throw 402 with the sign-in wall flags when an anonymous user is out', async () => {
      const user = await prisma.user.create({
        data: { isAnonymous: true, aiTier: 'anonymous', aiUsed: config.ai.quota.anonymous },
      });

      await expect(quotaService.reserve(user)).rejects.toMatchObject({
        statusCode: httpStatus.PAYMENT_REQUIRED,
        details: { reason: 'AI_QUOTA_EXHAUSTED', requiresAuth: true },
      });
    });

    test('should throw 402 with the paywall flags when a signed-in free user is out', async () => {
      const user = await freeUser({ aiUsed: config.ai.quota.free });

      await expect(quotaService.reserve(user)).rejects.toMatchObject({
        statusCode: httpStatus.PAYMENT_REQUIRED,
        details: { requiresAuth: false, quota: { tier: 'free' } },
      });
    });

    test('should not let two concurrent calls overrun the last credit', async () => {
      const user = await prisma.user.create({
        data: { isAnonymous: true, aiTier: 'anonymous', aiUsed: config.ai.quota.anonymous - 1 },
      });

      const results = await Promise.allSettled([quotaService.reserve(user), quotaService.reserve(user)]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((await prisma.user.findUnique({ where: { id: user.id } })).aiUsed).toBe(config.ai.quota.anonymous);
    });
  });

  describe('rollover', () => {
    test('should reset a renewing allowance once its period has passed', async () => {
      const user = await freeUser({ aiUsed: 30, aiResetsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) });

      const reserved = await quotaService.reserve(user);

      expect(reserved.aiUsed).toBe(1);
      const stored = await prisma.user.findUnique({ where: { id: user.id } });
      expect(stored.aiResetsAt.getTime()).toBeGreaterThan(Date.now());
    });

    test('should never roll an anonymous allowance over', async () => {
      const user = await prisma.user.create({
        data: { isAnonymous: true, aiTier: 'anonymous', aiUsed: config.ai.quota.anonymous },
      });

      await expect(quotaService.reserve(user)).rejects.toMatchObject({ statusCode: httpStatus.PAYMENT_REQUIRED });
      expect((await prisma.user.findUnique({ where: { id: user.id } })).aiUsed).toBe(config.ai.quota.anonymous);
    });
  });

  describe('meter', () => {
    test('should hand the credit back when the work throws', async () => {
      const user = await anonymousUser();

      await expect(
        quotaService.meter(user, async () => {
          throw new Error('provider is down');
        })
      ).rejects.toThrow('provider is down');

      expect((await prisma.user.findUnique({ where: { id: user.id } })).aiUsed).toBe(0);
    });
  });
});
