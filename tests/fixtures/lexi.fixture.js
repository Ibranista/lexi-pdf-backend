const crypto = require('crypto');

/** docKey = sha256(lowercase(fileName) + ':' + fileSizeBytes), hex, 64 chars */
const docKeyFor = (fileName, sizeBytes) =>
  crypto.createHash('sha256').update(`${fileName.toLowerCase()}:${sizeBytes}`).digest('hex');

const deviceBody = (deviceId) => ({
  deviceId,
  platform: 'android',
  model: 'SM-S901E',
  osVersion: '15',
  appVersion: '1.0.0',
  locale: 'en-US',
});

const documentBody = (docKey, overrides = {}) => ({
  docKey,
  uri: 'content://com.android.externalstorage.documents/document/primary%3ADownload%2Fbook.pdf',
  name: 'Ego Is the Enemy.pdf',
  ext: 'PDF',
  openedAt: 1769500000000,
  page: 47,
  pageCount: 214,
  bookmarks: [12, 47, 88],
  readingPlanMs: [42000, 51000],
  readingTimeMsByPage: { 47: 182000 },
  collections: ['studying', 'later'],
  updatedAt: 1769500000000,
  deletedAt: null,
  ...overrides,
});

const annotationBody = (docKey, overrides = {}) => ({
  id: 'm9x2k1-3',
  docKey,
  page: 47,
  text: 'Ryan Holiday',
  source: 'Ego Is the Enemy',
  color: 'sky',
  note: '',
  createdAt: 1769500000000,
  updatedAt: 1769500000000,
  deletedAt: null,
  ...overrides,
});

const vocabBody = (docKey, overrides = {}) => ({
  id: 'm9x30a-0',
  docKey,
  word: 'optional',
  pos: 'adjective',
  tr: 'አማራጭ',
  translit: 'amarach',
  lang: 'am',
  p: 47,
  s1: 'It means night no longer forced people to stop.',
  s2: "The phrase marks the book's turning point.",
  createdAt: 1769500000000,
  updatedAt: 1769500000000,
  deletedAt: null,
  ...overrides,
});

module.exports = {
  docKeyFor,
  deviceBody,
  documentBody,
  annotationBody,
  vocabBody,
};
