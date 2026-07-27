const httpStatus = require('http-status');
const { ChatOpenAI } = require('@langchain/openai');
const OpenAI = require('openai');
const config = require('./config');
const ApiError = require('../utils/ApiError');

const assertConfigured = () => {
  if (!config.openai.apiKey) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'AI is not configured on this server.', true, '', {
      reason: 'AI_NOT_CONFIGURED',
    });
  }
};

/**
 * A LangChain chat model. Kept behind a factory so temperature is a per-call
 * decision and the key check happens on the request, not at import time —
 * booting the API without an OpenAI key must still serve §1–3.
 */
const chatModel = ({ temperature = 0, maxRetries = 1, timeout = 30000 } = {}) => {
  assertConfigured();
  return new ChatOpenAI({
    apiKey: config.openai.apiKey,
    model: config.openai.model,
    temperature,
    maxRetries,
    timeout,
  });
};

let openaiClient;

/** The raw SDK, for the one thing LangChain does not cover here: speech. */
const speechClient = () => {
  assertConfigured();
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return openaiClient;
};

module.exports = {
  chatModel,
  speechClient,
  assertConfigured,
};
