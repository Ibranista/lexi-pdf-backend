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

// A localhost origin means PUBLIC_URL was never configured for a real host —
// the dev default. An audio URL pointing at localhost is dead on a phone, so
// in that case we fall back to the address the device actually reached us on.
const isLocalOrigin = (url) => /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/.test(url || '');

/**
 * Absolute URL for a synthesized clip. `requestBase` is the origin the caller
 * reached this API on (protocol + Host header). In development it's the dev
 * machine's LAN IP, which is exactly what a device needs; in production
 * PUBLIC_URL is set to the real domain and wins. Either way the URL is one the
 * requesting device can actually fetch.
 */
const publicUrlFor = (file, requestBase) => {
  const base = !isLocalOrigin(config.publicUrl) ? config.publicUrl : requestBase || config.publicUrl;
  return `${base}/static/tts/${file}`;
};

/**
 * Render `text` to speech with the configured OpenAI TTS model and return a
 * direct, cacheable URL. `tag` is a short, filename-safe label (a language
 * code, or "card" for a full narration) that both namespaces the cache and
 * keeps the same input from being synthesized twice.
 *
 * Files are content-addressed by (tag, text, model), so identical input is a
 * filesystem hit on every later request. Swap this body for an S3/CDN upload
 * when there is more than one server.
 *
 * @param {string} tag - filename-safe cache namespace, e.g. 'en' or 'card'
 * @param {string} text
 * @param {string} [requestBase]
 * @returns {Promise<string|undefined>}
 */
const render = async (tag, text, requestBase) => {
  if (!text || !text.trim()) {
    return undefined;
  }

  // the filename is a hash of validated inputs plus a fixed tag, never raw user
  // text — nothing here can walk out of AUDIO_DIR
  /* eslint-disable security/detect-non-literal-fs-filename */
  const digest = crypto.createHash('sha256').update(`${config.openai.ttsModel}:${tag}:${text}`).digest('hex').slice(0, 32);
  const file = `${tag}-${digest}.mp3`;
  const target = path.join(AUDIO_DIR, file);

  if (fs.existsSync(target)) {
    return publicUrlFor(file, requestBase);
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
    return publicUrlFor(file, requestBase);
  } catch (error) {
    // Audio is an enhancement on top of the translation. Losing it must not
    // lose the word card with it.
    logger.warn(`tts failed for tag=${tag}: ${error.message}`);
    return undefined;
  }
  /* eslint-enable security/detect-non-literal-fs-filename */
};

/**
 * Speak a single word/phrase in `lang`. Gated to languages we have a voice for
 * (Amharic has none): the answer is then undefined and the card just hides
 * "Hear it". Backs the `/ai/tts` endpoint.
 */
const synthesize = async (text, lang, requestBase) => {
  if (!hasVoice(lang)) {
    return undefined;
  }
  return render(lang, text, requestBase);
};

/**
 * Voice a whole word card — the selection, its explanation and an example —
 * as one natural reading. Unlike `synthesize` this is NOT gated on the target
 * language: the narration is mostly in the reader's explanation language, which
 * the model can always speak, so "Hear it" reads the card for every language.
 */
const narrate = async (text, requestBase) => render('card', text, requestBase);

module.exports = {
  synthesize,
  narrate,
  hasVoice,
  AUDIO_DIR,
};
