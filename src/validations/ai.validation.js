const Joi = require('joi');
const { voiceIds } = require('../services/voices.service');

const docKey = Joi.string().length(64).hex().required();
const style = Joi.string().valid('simple', 'balanced', 'advanced').default('balanced');

const context = {
  body: Joi.object().keys({
    docKey,
    title: Joi.string().allow(''),
    author: Joi.string().allow(''),
    pageCount: Joi.number().integer().min(0),
    // sent in chunks of ~20 pages
    pages: Joi.array()
      .items(
        Joi.object().keys({
          page: Joi.number().integer().min(0).required(),
          text: Joi.string().allow('').required(),
        })
      )
      .max(200)
      .required(),
  }),
};

const translate = {
  body: Joi.object().keys({
    docKey,
    text: Joi.string().max(500).required(),
    context: Joi.string().allow('').max(4000),
    page: Joi.number().integer().min(0),
    targetLang: Joi.string().valid('am', 'ar', 'en').required(),
    voiceId: Joi.string().valid(...voiceIds),
    style,
  }),
};

const chat = {
  body: Joi.object().keys({
    docKey,
    sessionId: Joi.string().max(64).required(),
    title: Joi.string().allow('').max(300),
    author: Joi.string().allow('').max(200),
    page: Joi.number().integer().min(0),
    excerpt: Joi.string().allow('').max(8000),
    message: Joi.string().max(2000).required(),
    style,
  }),
};

/**
 * A live voice turn. Same body as a typed one plus `spoken`, which asks for a
 * reply written to be *heard* — a few sentences ending in something the reader
 * can answer out loud, rather than the paragraphs a chat bubble can carry.
 * Defaults true: nothing reaches this route that isn't being spoken.
 */
const chatLive = {
  body: chat.body.keys({
    spoken: Joi.boolean().default(true),
    voiceId: Joi.string().valid(...voiceIds),
  }),
};

/**
 * Opening a live voice line. No `message` — nothing has been said yet; this
 * only names the document the conversation is allowed to be about, which the
 * server turns into the model's instructions.
 */
const realtimeSession = {
  body: Joi.object().keys({
    docKey,
    title: Joi.string().allow('').max(300),
    author: Joi.string().allow('').max(200),
    page: Joi.number().integer().min(0),
    style,
    voiceId: Joi.string().valid(...voiceIds),
    excerpt: Joi.string().allow('').max(4000),
    chapter: Joi.string().allow('').max(300),
  }),
};

/**
 * One exchange, handed back after it happened. The call itself runs device to
 * model, so these two strings are the only record of it that reaches us.
 */
const realtimeTurn = {
  body: Joi.object().keys({
    docKey,
    sessionId: Joi.string().max(64).required(),
    title: Joi.string().allow('').max(300),
    page: Joi.number().integer().min(0),
    message: Joi.string().max(4000).required(),
    reply: Joi.string().max(8000).required(),
  }),
};

/**
 * One page, as extracted by the reflow view. The cap matches what a dense page
 * of a book actually holds; anything longer is two pages or a bad extraction,
 * and either way is not what this was designed to read.
 */
const pageCheck = {
  body: Joi.object().keys({
    docKey,
    page: Joi.number().integer().min(0).required(),
    text: Joi.string().max(12000).required(),
    title: Joi.string().allow('').max(300),
    author: Joi.string().allow('').max(200),
  }),
};

const chatHistory = {
  query: Joi.object().keys({
    sessionId: Joi.string().max(64).required(),
    docKey: Joi.string().length(64).hex(),
  }),
};

/** Clearing a thread needs only the thread — the document key is irrelevant. */
const clearChat = {
  query: Joi.object().keys({
    sessionId: Joi.string().max(64).required(),
  }),
};

const speak = {
  body: Joi.object().keys({
    text: Joi.string().max(4000).required(),
    voiceId: Joi.string().valid(...voiceIds),
  }),
};

const tts = {
  query: Joi.object().keys({
    text: Joi.string().max(500).required(),
    lang: Joi.string().valid('am', 'ar', 'en').required(),
    voiceId: Joi.string().valid(...voiceIds),
  }),
};

/**
 * A spoken question, base64 in the JSON body.
 *
 * The cap matches `express.json({ limit: '6mb' })` in app.js — going above it
 * would be decorative, since the body parser rejects the request before any
 * validation runs. The real length check is on the *decoded* bytes in
 * stt.service, which is what can tell the reader their recording was too long
 * instead of failing them with a bare 413.
 */
const transcribe = {
  body: Joi.object().keys({
    audio: Joi.string()
      .max(6 * 1024 * 1024)
      .required(),
    mimeType: Joi.string().max(60),
    lang: Joi.string().valid('am', 'ar', 'en'),
  }),
};

module.exports = {
  context,
  translate,
  chat,
  chatLive,
  realtimeSession,
  realtimeTurn,
  pageCheck,
  chatHistory,
  clearChat,
  speak,
  transcribe,
  tts,
};
