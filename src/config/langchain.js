const httpStatus = require('http-status');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { GoogleGenAI } = require('@google/genai');
const config = require('./config');
const ApiError = require('../utils/ApiError');

const assertConfigured = () => {
  if (!config.gemini.apiKey) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'AI is not configured on this server.', true, '', {
      reason: 'AI_NOT_CONFIGURED',
    });
  }
};

/**
 * The Gemini chat model takes no request timeout of its own, only a per-call
 * one. Every call through here gets the factory's timeout unless the caller
 * passes its own — `withStructuredOutput` ends up in `invoke` too, so this
 * covers the structured calls as well as the plain ones.
 */
class TimedChatModel extends ChatGoogleGenerativeAI {
  constructor({ timeout, ...fields }) {
    super(fields);
    this.requestTimeout = timeout;
  }

  invoke(input, options) {
    return super.invoke(input, { timeout: this.requestTimeout, ...options });
  }

  stream(input, options) {
    return super.stream(input, { timeout: this.requestTimeout, ...options });
  }
}

/**
 * A LangChain chat model. Kept behind a factory so temperature is a per-call
 * decision and the key check happens on the request, not at import time —
 * booting the API without a Gemini key must still serve §1–3.
 */
const chatModel = ({ temperature = 0, maxRetries = 1, timeout = 30000 } = {}) => {
  assertConfigured();
  return new TimedChatModel({
    apiKey: config.gemini.apiKey,
    model: config.gemini.model,
    temperature,
    maxRetries,
    timeout,
    // Thinking is on by default and costs seconds before the first token —
    // too slow for a word card or a chat bubble.
    ...(config.gemini.thinkingBudget === undefined
      ? {}
      : { thinkingConfig: { thinkingBudget: config.gemini.thinkingBudget } }),
  });
};

let genaiClient;

/** The raw SDK, for what LangChain does not cover here: speech and live voice. */
const genai = () => {
  assertConfigured();
  if (!genaiClient) {
    genaiClient = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  }
  return genaiClient;
};

module.exports = {
  chatModel,
  genai,
  assertConfigured,
};
