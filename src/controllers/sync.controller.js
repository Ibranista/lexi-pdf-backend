const catchAsync = require('../utils/catchAsync');
const { syncService } = require('../services');

const sync = catchAsync(async (req, res) => {
  res.send(await syncService.sync(req.user.id, req.body));
});

const merge = catchAsync(async (req, res) => {
  res.send(await syncService.merge(req.user, req.body.fromDeviceId));
});

module.exports = {
  sync,
  merge,
};
