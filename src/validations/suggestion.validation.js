const Joi = require('joi');
const { TOPICS } = require('../services/suggestion.service');

const getBookSuggestions = {
  query: Joi.object().keys({
    // the client renders SUGGESTION_COUNT (5) skeleton rows and asks for that
    // many; 3–5 keeps the section from jumping as they resolve
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
    // how many times this reader has tapped the library's refresh control. The
    // same interests are otherwise the same question, so this is what lets the
    // service walk further down the popular lists instead of replaying page one
    refresh: Joi.number().integer().min(0).default(0),
  }),
};

module.exports = {
  getBookSuggestions,
};
