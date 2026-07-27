const Joi = require('joi');
const { TOPICS } = require('../services/suggestion.service');

const getBookSuggestions = {
  query: Joi.object().keys({
    // the client renders SUGGESTION_COUNT (3) skeleton rows; 3–5 keeps the
    // section from jumping
    limit: Joi.number().integer().min(1).max(5).default(3),
    // comma-separated onboarding ids, in the order the user picked them
    interests: Joi.string()
      .custom((value, helpers) => {
        const ids = value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);
        if (ids.some((id) => !TOPICS[id])) {
          return helpers.message('"interests" contains an unknown interest id');
        }
        return ids;
      })
      .default([]),
    collection: Joi.string().max(60),
  }),
};

module.exports = {
  getBookSuggestions,
};
