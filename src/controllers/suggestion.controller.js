const catchAsync = require('../utils/catchAsync');
const logger = require('../config/logger');
const { suggestionService } = require('../services');

const getBookSuggestions = catchAsync(async (req, res) => {
  const { limit, interests, collection, refresh } = req.query;

  let payload = { suggestions: [] };
  try {
    payload = await suggestionService.getSuggestions({ limit, interests, collection, refresh });
  } catch (error) {
    // An empty section beats a 5xx: the client's failure path is a degraded
    // title-only row, which looks broken.
    logger.warn(`book suggestions failed: ${error.message}`);
  }

  // Safe to cache for an hour because `refresh` is part of the url: a reader
  // asking for a different shelf asks a different address, so the hit they get
  // back is never the shelf they were trying to replace.
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(payload);
});

module.exports = {
  getBookSuggestions,
};
