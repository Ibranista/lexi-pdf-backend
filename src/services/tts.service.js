const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const logger = require('../config/logger');
const { speechClient } = require('../config/langchain');

const AUDIO_DIR = path.join(__dirname, '../../public/tts');

/**
 * Amharic has no voice on any model we have. The spec's answer is a 200 with
 * `audioUrl` omitted, not an error — the client just hides "Hear it".
 */
const hasVoice = (lang) => config.openai.ttsLangs.includes(lang);

const publicUrlFor = (file) => `${config.publicUrl}/static/tts/${file}`;

/**
 * Synthesize `text` and return a direct, cacheable HTTPS(-in-production) URL,
 * or undefined when the language has no voice.
 *
 * Files are content-addressed by (lang, text, model), so the same word is
 * synthesized once and every later request is a filesystem hit. Swap this
 * function's body for an S3/CDN upload when there is more than one server.
 *
 * @param {string} text
 * @param {string} lang
 * @returns {Promise<string|undefined>}
 */
const synthesize = async (text, lang) => {
  if (!hasVoice(lang)) {
    return undefined;
  }

  // the filename is a hash of validated inputs, never user text — nothing here
  // can walk out of AUDIO_DIR
  /* eslint-disable security/detect-non-literal-fs-filename */
  const digest = crypto.createHash('sha256').update(`${config.openai.ttsModel}:${lang}:${text}`).digest('hex').slice(0, 32);
  const file = `${lang}-${digest}.mp3`;
  const target = path.join(AUDIO_DIR, file);

  if (fs.existsSync(target)) {
    return publicUrlFor(file);
  }

  try {
    const response = await speechClient().audio.speech.create({
      model: config.openai.ttsModel,
      voice: 'alloy',
      input: text,
      response_format: 'mp3',
    });
    await fs.promises.mkdir(AUDIO_DIR, { recursive: true });
    await fs.promises.writeFile(target, Buffer.from(await response.arrayBuffer()));
    return publicUrlFor(file);
  } catch (error) {
    // Audio is an enhancement on top of the translation. Losing it must not
    // lose the word card with it.
    logger.warn(`tts failed for lang=${lang}: ${error.message}`);
    return undefined;
  }
  /* eslint-enable security/detect-non-literal-fs-filename */
};

module.exports = {
  synthesize,
  hasVoice,
  AUDIO_DIR,
};
