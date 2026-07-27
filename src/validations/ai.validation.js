const Joi = require('joi');

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

const tts = {
  query: Joi.object().keys({
    text: Joi.string().max(500).required(),
    lang: Joi.string().valid('am', 'ar', 'en').required(),
  }),
};

module.exports = {
  context,
  translate,
  chat,
  tts,
};
