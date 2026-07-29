const httpStatus = require('http-status');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const config = require('../config/config');
const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { tokenTypes } = require('../config/tokens');

const googleClient = config.google.clientIds.length ? new OAuth2Client(config.google.clientIds[0]) : null;

/**
 * Register (or recover) a device session.
 *
 * Idempotent on `deviceId`: the same device always gets the same anonymous
 * user back, with fresh tokens. That is how the app recovers when the refresh
 * token is lost.
 *
 * One exception, from §1.4: if the device is still attached to a *full*
 * account — the user linked, then signed out — the device is detached and a
 * fresh, empty anonymous user is created. Handing back the real account would
 * mean a signed-out phone silently holds a session for it.
 *
 * @param {Object} deviceBody
 * @returns {Promise<User>}
 */
const registerDevice = async (deviceBody) => {
  const { deviceId, ...meta } = deviceBody;
  const existing = await prisma.device.findUnique({ where: { deviceId }, include: { user: true } });

  if (existing && existing.user.isAnonymous) {
    await prisma.device.update({ where: { deviceId }, data: meta });
    return existing.user;
  }

  if (existing) {
    await prisma.device.delete({ where: { deviceId } });
  }

  return prisma.user.create({
    data: {
      isAnonymous: true,
      aiTier: 'anonymous',
      // Onboarding is the one thing the detached device keeps. Everything else
      // belonged to the account and stays with it, but "has this person been
      // shown the question on this phone?" is about the phone in their hand —
      // signing out should not walk them back through onboarding.
      hasCompletedOnboarding: existing ? existing.user.hasCompletedOnboarding : false,
      interests: existing ? existing.user.interests : [],
      onboardedAt: existing ? existing.user.onboardedAt : null,
      devices: { create: { deviceId, ...meta } },
    },
  });
};

/**
 * The allowance a user gets the moment they stop being anonymous: the signed-in
 * free tier, renewing monthly (spec §7.4).
 */
const freeTierGrant = () => {
  const resetsAt = new Date();
  resetsAt.setMonth(resetsAt.getMonth() + 1);
  return { aiTier: 'free', aiUsed: 0, aiResetsAt: resetsAt };
};

const assertAnonymous = (user) => {
  if (!user.isAnonymous) {
    throw new ApiError(httpStatus.CONFLICT, 'This session is already signed in.', true, '', { reason: 'ALREADY_LINKED' });
  }
};

const accountExists = (message) => new ApiError(httpStatus.CONFLICT, message, true, '', { reason: 'ACCOUNT_EXISTS' });

/**
 * Turn the caller's anonymous row into a real email account. There is no data
 * migration: the row itself is upgraded, so highlights and vocabulary stay put.
 * @param {User} user - the anonymous caller
 * @param {Object} body - { email, password, name }
 * @returns {Promise<User>}
 */
const linkEmail = async (user, { email, password, name }) => {
  assertAnonymous(user);

  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken) {
    throw accountExists('That email is already registered.');
  }

  return prisma.user.update({
    where: { id: user.id },
    data: {
      email,
      name,
      password: await bcrypt.hash(password, 8),
      isAnonymous: false,
      ...freeTierGrant(),
    },
  });
};

/**
 * Verify a Google id token and return its payload.
 * @param {string} idToken
 * @returns {Promise<Object>}
 */
const verifyGoogleIdToken = async (idToken) => {
  if (!googleClient) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Google sign-in is not configured on this server.', true, '', {
      reason: 'GOOGLE_NOT_CONFIGURED',
    });
  }
  try {
    // Android sign-in stamps the token with the *web* client id, iOS with the
    // iOS one. Accept every client id belonging to this project, and no others.
    const ticket = await googleClient.verifyIdToken({ idToken, audience: config.google.clientIds });
    return ticket.getPayload();
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'That Google sign-in could not be verified.', true, '', {
      reason: 'INVALID_ID_TOKEN',
    });
  }
};

/**
 * Upgrade the caller's anonymous row to the Google identity in `idToken`.
 * @param {User} user - the anonymous caller
 * @param {string} idToken
 * @returns {Promise<User>}
 */
const linkGoogle = async (user, idToken) => {
  assertAnonymous(user);
  const payload = await verifyGoogleIdToken(idToken);

  const taken = await prisma.user.findFirst({
    where: { OR: [{ googleId: payload.sub }, ...(payload.email ? [{ email: payload.email }] : [])] },
  });
  if (taken) {
    throw accountExists('That Google account is already in use.');
  }

  return prisma.user.update({
    where: { id: user.id },
    data: {
      googleId: payload.sub,
      email: payload.email || null,
      name: payload.name || '',
      isEmailVerified: Boolean(payload.email_verified),
      isAnonymous: false,
      ...freeTierGrant(),
    },
  });
};

/**
 * Sign in to an account that already owns this Google identity. Used after
 * /auth/link/google answers ACCOUNT_EXISTS, on the way to /sync/merge.
 * @param {string} idToken
 * @returns {Promise<User>}
 */
const loginWithGoogle = async (idToken) => {
  const payload = await verifyGoogleIdToken(idToken);
  const user = await prisma.user.findFirst({
    where: { OR: [{ googleId: payload.sub }, ...(payload.email ? [{ email: payload.email }] : [])], isAnonymous: false },
  });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No account exists for that Google identity.', true, '', {
      reason: 'NO_SUCH_ACCOUNT',
    });
  }
  if (!user.googleId) {
    return prisma.user.update({ where: { id: user.id }, data: { googleId: payload.sub } });
  }
  return user;
};

/**
 * Drop every refresh token a user holds. Called when an anonymous session is
 * upgraded, so the pre-upgrade tokens cannot be replayed.
 * @param {string} userId
 */
const revokeRefreshTokens = async (userId) => {
  await prisma.token.deleteMany({ where: { userId, type: tokenTypes.REFRESH } });
};

module.exports = {
  registerDevice,
  linkEmail,
  linkGoogle,
  loginWithGoogle,
  verifyGoogleIdToken,
  revokeRefreshTokens,
  freeTierGrant,
};
