const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { serializeUser } = require('../utils/serialize');
const { authService, userService, tokenService, emailService, deviceService } = require('../services');

/** The one response shape the client's auth layer already handles. */
const authResponse = async (user) => ({ user: serializeUser(user), tokens: await tokenService.generateAuthTokens(user) });

const register = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body);
  res.status(httpStatus.CREATED).send(await authResponse(user));
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await authService.loginUserWithEmailAndPassword(email, password);
  res.send(await authResponse(user));
});

const logout = catchAsync(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const refreshTokens = catchAsync(async (req, res) => {
  const tokens = await authService.refreshAuth(req.body.refreshToken);
  res.send({ ...tokens });
});

const forgotPassword = catchAsync(async (req, res) => {
  const resetPasswordToken = await tokenService.generateResetPasswordToken(req.body.email);
  await emailService.sendResetPasswordEmail(req.body.email, resetPasswordToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.query.token, req.body.password);
  res.status(httpStatus.NO_CONTENT).send();
});

const sendVerificationEmail = catchAsync(async (req, res) => {
  const verifyEmailToken = await tokenService.generateVerifyEmailToken(req.user);
  await emailService.sendVerificationEmail(req.user.email, verifyEmailToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const verifyEmail = catchAsync(async (req, res) => {
  await authService.verifyEmail(req.query.token);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Who the caller is, onboarding flag included. The client calls this on every
 * launch: `/auth/device` only answers on the launch that mints the session, and
 * the root navigator needs the flag on all the others too.
 */
const me = catchAsync(async (req, res) => {
  res.send({ user: serializeUser(req.user) });
});

/** The reader finished (or skipped) onboarding — recorded against their row. */
const onboarding = catchAsync(async (req, res) => {
  const user = await userService.setOnboarding(req.user, req.body);
  res.send({ user: serializeUser(user) });
});

/** §1.1 — idempotent anonymous session for a device */
const device = catchAsync(async (req, res) => {
  const user = await deviceService.registerDevice(req.body);
  res.send(await authResponse(user));
});

/** §1.2 — the anonymous row becomes the real account, so nothing has to move */
const linkEmail = catchAsync(async (req, res) => {
  const user = await deviceService.linkEmail(req.user, req.body);
  await deviceService.revokeRefreshTokens(user.id);
  res.send(await authResponse(user));
});

const linkGoogle = catchAsync(async (req, res) => {
  const user = await deviceService.linkGoogle(req.user, req.body.idToken);
  await deviceService.revokeRefreshTokens(user.id);
  res.send(await authResponse(user));
});

/** §1.3 — signing in to the account that already owns this Google identity */
const googleLogin = catchAsync(async (req, res) => {
  const user = await deviceService.loginWithGoogle(req.body.idToken);
  res.send(await authResponse(user));
});

module.exports = {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
  me,
  onboarding,
  device,
  linkEmail,
  linkGoogle,
  googleLogin,
};
