const httpStatus = require('http-status');
const config = require('../config/config');
const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { toMs } = require('../utils/serialize');

/**
 * The AI budget (spec §4).
 *
 * Counted in requests, not tokens, because "8 of 20 questions" is a sentence a
 * user can act on. Counted per user, never per device, so reinstalling does
 * not reset it. Meter tokens separately if cost ever needs attributing.
 */

const limitFor = (user) => config.ai.quota[user.aiTier] ?? config.ai.quota.anonymous;

/** The block echoed on every AI response. */
const state = (user) => ({
  used: user.aiUsed,
  limit: limitFor(user),
  resetsAt: toMs(user.aiResetsAt),
  tier: user.aiTier,
});

/**
 * 402, never 401 — a 401 would trigger the client's silent-refresh
 * interceptor and log the user out instead of showing the wall.
 */
const exhausted = (user) =>
  new ApiError(httpStatus.PAYMENT_REQUIRED, "You've used your free AI credits.", true, '', {
    reason: 'AI_QUOTA_EXHAUSTED',
    quota: state(user),
    // anonymous → sign-in wall; free → paywall
    requiresAuth: user.isAnonymous,
  });

/**
 * Roll a renewing allowance over if its period has ended. Anonymous users have
 * `aiResetsAt: null` and never roll over — a renewing free tier would remove
 * the reason to ever sign in.
 */
const rollover = async (user) => {
  if (!user.aiResetsAt || user.aiResetsAt > new Date()) {
    return user;
  }
  const resetsAt = new Date(user.aiResetsAt);
  while (resetsAt <= new Date()) {
    resetsAt.setMonth(resetsAt.getMonth() + 1);
  }
  return prisma.user.update({ where: { id: user.id }, data: { aiUsed: 0, aiResetsAt: resetsAt } });
};

/**
 * Take one unit before generating. Conditional on the stored counter, so two
 * concurrent requests cannot both slip through on the last credit.
 * @param {User} user
 * @returns {Promise<User>} the user with the reserved counter
 * @throws {ApiError} 402 when the budget is gone
 */
const reserve = async (user) => {
  const current = await rollover(user);
  const limit = limitFor(current);

  const { count } = await prisma.user.updateMany({
    where: { id: current.id, aiUsed: { lt: limit } },
    data: { aiUsed: { increment: 1 } },
  });

  if (count === 0) {
    throw exhausted({ ...current, aiUsed: limit });
  }
  return { ...current, aiUsed: current.aiUsed + 1 };
};

/**
 * Hand the unit back when generation failed, so a provider outage does not
 * cost the user credits.
 */
const release = async (userId) => {
  await prisma.user.updateMany({ where: { id: userId, aiUsed: { gt: 0 } }, data: { aiUsed: { decrement: 1 } } });
};

/**
 * Reserve → run → reconcile. The only way AI work should be invoked.
 * @param {User} user
 * @param {Function} run - async () => result
 * @returns {Promise<{ result: any, quota: Object }>}
 */
const meter = async (user, run) => {
  const reserved = await reserve(user);
  try {
    const result = await run();
    return { result, quota: state(reserved) };
  } catch (error) {
    await release(reserved.id);
    throw error;
  }
};

module.exports = {
  limitFor,
  state,
  reserve,
  release,
  meter,
  exhausted,
};
