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
/**
 * The clip's filename. Content-addressed over the validated inputs plus a fixed
 * tag — never raw user text — so nothing here can walk out of AUDIO_DIR, and
 * identical input is a filesystem hit rather than a second synthesis.
 */
const fileFor = (tag, text) => {
  const digest = crypto.createHash('sha256').update(`${config.openai.ttsModel}:${tag}:${text}`).digest('hex').slice(0, 32);
  return `${tag}-${digest}.mp3`;
};

const render = async (tag, text, requestBase) => {
  if (!text || !text.trim()) {
    return undefined;
  }

  /* eslint-disable security/detect-non-literal-fs-filename */
  const file = fileFor(tag, text);
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
const narrate = async (text, requestBase) => render('card', speakable(text), requestBase);

/**
 * When each word of a clip is spoken, so the reader can follow the voice along
 * the text instead of hunting for where it has got to.
 *
 * Speech models do not hand back word timings, so the clip is read *back* —
 * transcribed with word-level timestamps. That sounds circular and is actually
 * the easy case for it: this is forced alignment against audio we generated
 * ourselves from text we already know, not open-ended recognition.
 *
 * Cached next to the mp3 and keyed the same way, so a reply spoken twice is
 * aligned once. Failure is silent and returns nothing — the clip still plays,
 * it just plays without anything following it.
 *
 * @param {string} text - the same text handed to {@link narrate}
 * @returns {Promise<{ w: string, s: number, e: number }[]>}
 */
const narrateTimings = async (text) => {
  const spoken = speakable(text);
  if (!spoken || !spoken.trim()) return [];

  /* eslint-disable security/detect-non-literal-fs-filename */
  const audio = path.join(AUDIO_DIR, fileFor('card', spoken));
  const timings = `${audio}.words.json`;

  try {
    if (fs.existsSync(timings)) {
      return JSON.parse(await fs.promises.readFile(timings, 'utf8'));
    }
    if (!fs.existsSync(audio)) return [];

    const result = await speechClient().audio.transcriptions.create({
      file: fs.createReadStream(audio),
      model: config.openai.sttModel,
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
    });

    const words = (result.words || []).map((word) => ({
      w: word.word,
      s: word.start,
      e: word.end,
    }));
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
