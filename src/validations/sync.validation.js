const Joi = require('joi');

// epoch milliseconds, never ISO strings (spec §0)
const timestamp = Joi.number().integer().min(0);

// sha256 hex, 64 chars — sha256(lowercase(fileName) + ':' + fileSizeBytes)
const docKey = Joi.string().length(64).hex().required();

const documentSchema = Joi.object().keys({
  docKey,
  uri: Joi.string().required(),
  name: Joi.string().required(),
  ext: Joi.string().max(16),
  openedAt: timestamp,
  page: Joi.number().integer().min(0),
  pageCount: Joi.number().integer().min(0).allow(null),
  bookmarks: Joi.array().items(Joi.number().integer().min(0)),
  readingPlanMs: Joi.array().items(Joi.number().integer().min(0)),
  readingTimeMsByPage: Joi.object().pattern(/^\d+$/, Joi.number().integer().min(0)).allow(null),
  // fixed shelf ids, not display labels — the client renders those from i18n
  collections: Joi.array().items(Joi.string().valid('studying', 'later', 'important')),
  updatedAt: timestamp.required(),
  deletedAt: timestamp.allow(null),
});

const annotationSchema = Joi.object().keys({
  id: Joi.string().max(64).required(),
  docKey,
  page: Joi.number().integer().min(0).required(),
  // no max, no trim: `text` is the verbatim passage the reflow reader
  // re-finds the highlight by
  text: Joi.string().required(),
  source: Joi.string().allow('', null),
  color: Joi.string().valid('amber', 'rose', 'sage', 'sky').required(),
  note: Joi.string().allow('').default(''),
  createdAt: timestamp.required(),
  updatedAt: timestamp.required(),
  deletedAt: timestamp.allow(null),
});

const vocabSchema = Joi.object().keys({
  id: Joi.string().max(64).required(),
  docKey,
  word: Joi.string().required(),
  pos: Joi.string().allow('', null),
  tr: Joi.string().required(),
  translit: Joi.string().allow('', null),
  lang: Joi.string().valid('am', 'ar', 'en').required(),
  p: Joi.number().integer().min(0).allow(null),
  s1: Joi.string().allow('', null),
  s2: Joi.string().allow('', null),
  createdAt: timestamp.required(),
  updatedAt: timestamp.required(),
  deletedAt: timestamp.allow(null),
});

const sync = {
  body: Joi.object().keys({
    cursor: Joi.string().allow(null, ''),
    deviceId: Joi.string().max(255).required(),
    changes: Joi.object()
      .keys({
        documents: Joi.array().items(documentSchema).default([]),
        annotations: Joi.array().items(annotationSchema).default([]),
        vocab: Joi.array().items(vocabSchema).default([]),
      })
      .default({ documents: [], annotations: [], vocab: [] }),
  }),
};

const merge = {
  body: Joi.object().keys({
    fromDeviceId: Joi.string().max(255).required(),
  }),
};

module.exports = {
  sync,
  merge,
};
