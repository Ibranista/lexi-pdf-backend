const Joi = require('joi');
const { password } = require('./custom.validation');
const { TOPICS } = require('../services/suggestion.service');

const register = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    name: Joi.string().required(),
  }),
};

const login = {
  body: Joi.object().keys({
    email: Joi.string().required(),
    password: Joi.string().required(),
  }),
};

const logout = {
  body: Joi.object().keys({
    refreshToken: Joi.string().required(),
  }),
};

const refreshTokens = {
  body: Joi.object().keys({
    refreshToken: Joi.string().required(),
  }),
};

const forgotPassword = {
  body: Joi.object().keys({
    email: Joi.string().email().required(),
  }),
};

const resetPassword = {
  query: Joi.object().keys({
    token: Joi.string().required(),
  }),
  body: Joi.object().keys({
    password: Joi.string().required().custom(password),
  }),
};

const verifyEmail = {
  query: Joi.object().keys({
    token: Joi.string().required(),
  }),
};

const device = {
  body: Joi.object().keys({
    // A stable per-install id from the OS (ANDROID_ID on Android,
    // identifierForVendor on iOS) — not a UUID on every platform, and not
    // security-bearing.
    deviceId: Joi.string().max(255).required(),
    platform: Joi.string().valid('ios', 'android', 'web').required(),
    model: Joi.string().max(120),
    osVersion: Joi.string().max(40),
    appVersion: Joi.string().max(40),
    locale: Joi.string().max(35),
  }),
};

const onboarding = {
  body: Joi.object()
    .keys({
      hasCompletedOnboarding: Joi.boolean(),
      // the same ids /book-suggestions takes — an unknown one personalises
      // nothing, so it is a client bug worth answering 400 for rather than
      // storing and quietly ignoring forever
      interests: Joi.array()
        .items(Joi.string().valid(...Object.keys(TOPICS)))
        .max(Object.keys(TOPICS).length),
    })
    .min(1),
};

const linkEmail = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    name: Joi.string().required(),
  }),
};

const linkGoogle = {
  body: Joi.object().keys({
    idToken: Joi.string().required(),
  }),
};

module.exports = {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  verifyEmail,
  onboarding,
  device,
  linkEmail,
  linkGoogle,
};
