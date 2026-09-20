const fs = require('fs');
const path = require('path');
const httpStatus = require('http-status');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');

const SAMPLE_DIR = path.join(__dirname, '../../public/voices');
const SAMPLE_VERSION = 'v1';
const VOICES = [
  { id: 'Aoede', name: 'Aoede', description: 'Breezy and relaxed', supportedLanguages: ['en', 'am', 'ar'] },
  { id: 'Kore', name: 'Kore', description: 'Clear and firm', supportedLanguages: ['en', 'am', 'ar'] },
  { id: 'Puck', name: 'Puck', description: 'Upbeat and energetic', supportedLanguages: ['en', 'am', 'ar'] },
];
const voiceIds = VOICES.map((voice) => voice.id);
const resolveVoice = (id, fallback = config.gemini.liveVoice) => {
  if (!id) return fallback;
  if (!voiceIds.includes(id)) throw new ApiError(httpStatus.BAD_REQUEST, 'Choose an available voice.');
  return id;
};
const sampleFile = (voice, lang) => `${voice}-${lang}-${SAMPLE_VERSION}.wav`;

// Metadata is read-only: missing recordings are omitted, never synthesized by
// Preview. Deploy the presaved public/voices files with the API.
const listVoices = (requestBase) => {
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/.test(config.publicUrl || '');
  const base = (local ? requestBase || config.publicUrl : config.publicUrl).replace(/\/$/, '');
  return VOICES.map((voice) => ({
    ...voice,
    samples: Object.fromEntries(
      voice.supportedLanguages
        // Filenames are exclusively built from the fixed catalog above.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        .filter((lang) => fs.existsSync(path.join(SAMPLE_DIR, sampleFile(voice.id, lang))))
        .map((lang) => [lang, `${base}/static/voices/${sampleFile(voice.id, lang)}`])
    ),
  }));
};

module.exports = { SAMPLE_DIR, VOICES, voiceIds, resolveVoice, sampleFile, listVoices };
