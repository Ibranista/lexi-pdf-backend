const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const exclude = require('../utils/exclude');
const { userService } = require('../services');

// internal columns the admin user API has no business exposing: the password
// hash, row timestamps, the AI budget counters, and the reader's own onboarding
// state (theirs to read and write through /auth/me and /auth/onboarding)
const PRIVATE_FIELDS = [
  'password',
  'createdAt',
  'updatedAt',
  'googleId',
  'isAnonymous',
  'aiTier',
  'aiUsed',
  'aiResetsAt',
  'hasCompletedOnboarding',
  'interests',
  'onboardedAt',
];

const createUser = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body);
  res.status(httpStatus.CREATED).send(exclude(user, PRIVATE_FIELDS));
});

const getUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'role']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await userService.queryUsers(filter, options);
  result.results = result.results.map((user) => exclude(user, PRIVATE_FIELDS));
  res.send(result);
});

const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  res.send(exclude(user, PRIVATE_FIELDS));
});

const updateUser = catchAsync(async (req, res) => {
  const user = await userService.updateUserById(req.params.userId, req.body);
  res.send(exclude(user, PRIVATE_FIELDS));
});

const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUserById(req.params.userId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
};
