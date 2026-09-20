const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const logger = require('../config/logger');
const { genai } = require('../config/langchain');
const { resolveVoice } = require('./voices.service');

const AUDIO_DIR = path.join(__dirname, '../../public/tts');

/**
 * Amharic has no voice on any model we have. The spec's answer is a 200 with
 * `audioUrl` omitted, not an error — the client just hides "Hear it".
 */
const hasVoice = (lang) => config.gemini.ttsLangs.includes(lang);

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

/* -------------------------------------------------------------------------
   Filenames are for reading, not for hearing
   ------------------------------------------------------------------------- */

/**
 * A filename as it turns up mid-sentence: "scan_2024_0093.pdf". Brackets are
 * allowed inside the name ("report_v3(1).pdf") but it has to *start* on an
 * alphanumeric, so an opening bracket around the name is left where it is.
 *
 * The extension list is repeated in TRAILING_EXTENSION below — keep the two in
 * step. They are spelled out rather than composed so both stay literal regexes.
 */
const NAMED_FILE = /[A-Za-z0-9][A-Za-z0-9_.()[\]-]*\.(?:pdf|epubs?|docx?|txt|rtf|mobi|djvu|azw3?|pages|pptx?)\b/gi;

/**
 * Filename-shaped runs with the extension already stripped off. Deliberately
 * narrow — an underscore join, a long serial, or a hash-like alphanumeric run.
 * Ordinary text that happens to mix letters and digits ("COVID-19", "GPT-4",
 * "H2O") has to survive this untouched.
 */
const UNSPEAKABLE_RUN =
  /\b(?:[A-Za-z0-9]+_[A-Za-z0-9_-]+|[A-Za-z-]*\d{5,}[A-Za-z0-9-]*|(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{10,})\b/g;

const TRAILING_EXTENSION = /\.(?:pdf|epubs?|docx?|txt|rtf|mobi|djvu|azw3?|pages|pptx?)$/i;

/** A part worth saying: letters only, and pronounceable rather than an acronym-ish run. */
const isWord = (part) => /^[A-Za-z]{2,}$/.test(part) && /[aeiouy]/i.test(part);

/**
 * How a document name should be *said*.
 *
 * Reading a real filename out loud is miserable — "two zero two four underscore
 * scan zero zero nine three dot p d f" — so the name is reduced to the words it
 * actually contains ("Physics_Notes_2024_final_v3" → "Physics Notes final").
 * When the words don't carry the name (they're outweighed by serials, hashes
 * and version tags) there is nothing worth hearing, and it becomes a plain
 * "this document".
 */
const spokenName = (raw) => {
  const stem = raw.replace(TRAILING_EXTENSION, '');
  // Break the camelCase humps first, so "TheGreatGatsby" comes out as words.
  const words = stem
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(isWord);

  const kept = words.join('').length;
  const total = stem.replace(/[^A-Za-z0-9]/g, '').length;
  // Half the name has to be real words before it is worth saying at all.
  return kept && kept * 2 >= total ? words.join(' ') : 'this document';
};

/**
 * The narration copy of `text`: identical, except that document names nobody
 * could pronounce are spoken as "this document". Only the audio is changed —
 * the reply on screen keeps the real name, so the reader can still see which
 * file is meant.
 */
const speakable = (text) => String(text).replace(NAMED_FILE, spokenName).replace(UNSPEAKABLE_RUN, spokenName);

/**
 * Render `text` to speech with the configured Gemini TTS model and return a
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
/**
 * Gemini speaks raw 16-bit mono PCM (`audio/L16;codec=pcm;rate=24000`), which
 * no player will open as a file. A 44-byte RIFF header makes it a WAV every
 * phone can play, without pulling in an encoder.
 */
const sampleRateOf = (mimeType) => {
  const match = /rate=(\d+)/.exec(mimeType || '');
  return match ? Number(match[1]) : 24000;
};

const toWav = (pcm, sampleRate) => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};

/**
 * The clip's filename. Content-addressed over the validated inputs plus a fixed
 * tag — never raw user text — so nothing here can walk out of AUDIO_DIR, and
 * identical input is a filesystem hit rather than a second synthesis.
 */
const fileFor = (tag, text, voice = config.gemini.ttsVoice) => {
  const digest = crypto
    .createHash('sha256')
    .update(`${config.gemini.ttsModel}:${voice}:${tag}:${text}`)
    .digest('hex')
    .slice(0, 32);
  return `${tag}-${digest}.wav`;
};

/**
 * A 429 here is usually not a burst the caller can wait out. On the free tier
 * `gemini-3.1-flash-tts` allows ten requests *per day*
 * (GenerateRequestsPerDayPerProjectPerModel-FreeTier), and the model answers an
 * exhausted quota with a retryDelay measured in tens of seconds. Nobody holds a
 * reply open that long, so only a genuinely short cooldown is worth sleeping
 * through; anything longer is a wall, not a wait.
 */
const TTS_MAX_ATTEMPTS = 2;
const TTS_MAX_WAIT_MS = 3000;

const isRateLimited = (error) =>
  /\b429\b|RESOURCE_EXHAUSTED|exceeded your current quota/i.test(String((error && error.message) || ''));

/** The cooldown the model asked for, in ms, or 0 when it named none. */
const retryDelayMs = (error) => {
  const match = /"retryDelay":\s?"([\d.]+)s"/.exec(String((error && error.message) || ''));
  const seconds = match ? Number(match[1]) : NaN;
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : 0;
};

/**
 * When the quota is spent, every later clip in the same reply would fail the
 * same way. Remembering the cooldown turns five doomed round trips into none,
 * which is the difference between a reply that is merely unvoiced and one that
 * takes half a minute to become unvoiced.
 */
let quotaBlockedUntil = 0;

/** One synthesis call, retried only through a cooldown short enough to wait. */
const generateSpeech = async (text, voice) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await genai().models.generateContent({
        model: config.gemini.ttsModel,
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      });
    } catch (error) {
      if (!isRateLimited(error)) throw error;
      const wait = retryDelayMs(error);
      if (wait > TTS_MAX_WAIT_MS || attempt >= TTS_MAX_ATTEMPTS) {
        quotaBlockedUntil = Date.now() + (wait || TTS_MAX_WAIT_MS);
        throw error;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, wait || TTS_MAX_WAIT_MS);
      });
    }
  }
};

const render = async (tag, text, requestBase, voiceId) => {
  const voice = resolveVoice(voiceId, config.gemini.ttsVoice);
  if (!text || !text.trim()) {
    return undefined;
  }

  /* eslint-disable security/detect-non-literal-fs-filename */
  const file = fileFor(tag, text, voice);
  const target = path.join(AUDIO_DIR, file);

  if (fs.existsSync(target)) {
    return publicUrlFor(file, requestBase);
  }

  // Checked after the cache, never before it: a clip we already hold costs
  // nothing and must keep playing even while the quota is spent.
  if (Date.now() < quotaBlockedUntil) {
    return undefined;
  }

  try {
    const response = await generateSpeech(text, voice);
    const part = (((response.candidates || [])[0] || {}).content || { parts: [] }).parts.find((p) => p.inlineData);
    if (!part) {
      throw new Error('no audio in the response');
    }
    await fs.promises.mkdir(AUDIO_DIR, { recursive: true });
    await fs.promises.writeFile(
      target,
      toWav(Buffer.from(part.inlineData.data, 'base64'), sampleRateOf(part.inlineData.mimeType))
    );
    return publicUrlFor(file, requestBase);
  } catch (error) {
    // Audio is an enhancement on top of the translation. Losing it must not
    // lose the word card with it — but a clip that goes missing mid-reply is
    // worth naming in the log, since all the reader gets is a silent gap.
    logger.warn(`tts failed for tag=${tag}${isRateLimited(error) ? ' (rate limited)' : ''}: ${error.message}`);
    return undefined;
  }
  /* eslint-enable security/detect-non-literal-fs-filename */
};

/**
 * Speak a single word/phrase in `lang`. Gated to languages we have a voice for
 * (Amharic has none): the answer is then undefined and the card just hides
 * "Hear it". Backs the `/ai/tts` endpoint.
 */
const synthesize = async (text, lang, requestBase, voiceId) => {
  if (!hasVoice(lang)) {
    return undefined;
  }
  return render(lang, text, requestBase, voiceId);
};

/**
 * Voice a whole word card — the selection, its explanation and an example —
 * as one natural reading. Unlike `synthesize` this is NOT gated on the target
 * language: the narration is mostly in the reader's explanation language, which
 * the model can always speak, so "Hear it" reads the card for every language.
 */
const narrate = async (text, requestBase, voiceId) => render('card', speakable(text), requestBase, voiceId);

/**
 * How long a word takes to say, relative to the others: its letters, plus the
 * pause a reader leaves after a comma or a full stop.
 */
const spokenWeight = (word) => {
  let weight = Math.max(word.replace(/[^\p{L}\p{N}]/gu, '').length, 1);
  if (/[,;:]$/.test(word)) weight += 3;
  if (/[.!?…]$/.test(word)) weight += 6;
  return weight;
};

/**
 * When each word of a clip is spoken, so the reader can follow the voice along
 * the text instead of hunting for where it has got to.
 *
 * Gemini's speech model hands back no word timings, and transcribing our own
 * clip back just to get them would be a second paid call per reply. The clip's
 * length is known exactly from its PCM, so the words are laid across it in
 * proportion to how long each takes to say. That drifts by a fraction of a
 * second at most, which is fine for a highlight that follows along.
 *
 * Cached next to the clip and keyed the same way, so a reply spoken twice is
 * aligned once. Failure is silent and returns nothing — the clip still plays,
 * it just plays without anything following it.
 *
 * @param {string} text - the same text handed to {@link narrate}
 * @returns {Promise<{ w: string, s: number, e: number }[]>}
 */
const narrateTimings = async (text, voiceId) => {
  const voice = resolveVoice(voiceId, config.gemini.ttsVoice);
  const spoken = speakable(text);
  if (!spoken || !spoken.trim()) return [];

  /* eslint-disable security/detect-non-literal-fs-filename */
  const audio = path.join(AUDIO_DIR, fileFor('card', spoken, voice));
  const timings = `${audio}.words.json`;

  try {
    if (fs.existsSync(timings)) {
      return JSON.parse(await fs.promises.readFile(timings, 'utf8'));
    }
    if (!fs.existsSync(audio)) return [];

    const handle = await fs.promises.open(audio, 'r');
    const header = Buffer.alloc(44);
    try {
      await handle.read(header, 0, 44, 0);
    } finally {
      await handle.close();
    }
    const duration = header.readUInt32LE(40) / header.readUInt32LE(28);

    const tokens = spoken.split(/\s+/).filter(Boolean);
    const total = tokens.reduce((sum, word) => sum + spokenWeight(word), 0);
    let cursor = 0;
    const words = tokens.map((word) => {
      const s = (cursor / total) * duration;
      cursor += spokenWeight(word);
      return { w: word, s: Number(s.toFixed(3)), e: Number(((cursor / total) * duration).toFixed(3)) };
    });

    await fs.promises.writeFile(timings, JSON.stringify(words));
    return words;
  } catch (error) {
    logger.warn(`tts: word timings failed — ${error.message}`);
    return [];
  }
  /* eslint-enable security/detect-non-literal-fs-filename */
};

module.exports = {
  synthesize,
  narrate,
  narrateTimings,
  speakable,
  hasVoice,
  AUDIO_DIR,
};
