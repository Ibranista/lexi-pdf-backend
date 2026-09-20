const httpStatus = require('http-status');
const config = require('../config/config');
const logger = require('../config/logger');
const { genai } = require('../config/langchain');
const ApiError = require('../utils/ApiError');

/**
 * Speech to text for the chat composer's mic button.
 *
 * The clip is recorded on the device and posted as base64 rather than
 * multipart: every other endpoint here is JSON, the body cap is already 6mb,
 * and a spoken question is a few seconds of 64kbps audio — a few hundred
 * kilobytes. Adding a multipart stack to the app for one field would be the
 * bigger change.
 *
 * Nothing is written to disk. Unlike a synthesized clip, which is cached and
 * served back as a URL, a recording of someone's voice has no reason to
 * outlive the request that transcribed it.
 */

/**
 * What the recorder sends, mapped to what Gemini accepts. An .m4a is AAC in an
 * MP4 container, which Gemini takes as `audio/mp4` but not under its own name.
 */
const GEMINI_MIME_TYPES = {
  'audio/aac': 'audio/aac',
  'audio/flac': 'audio/flac',
  'audio/m4a': 'audio/mp4',
  'audio/mp3': 'audio/mp3',
  'audio/mp4': 'audio/mp4',
  'audio/mpeg': 'audio/mp3',
  'audio/ogg': 'audio/ogg',
  'audio/wav': 'audio/wav',
  'audio/webm': 'audio/webm',
  'audio/x-m4a': 'audio/mp4',
};

const TRANSCRIBE_PROMPT = [
  'Transcribe this recording word for word, in the language it is spoken in.',
  'Reply with the transcript only: no quotes, labels, timestamps or commentary.',
  'If nobody speaks in it, reply with nothing at all.',
].join(' ');

/**
 * Below this a "recording" is a tapped-and-released button, not speech. A model
 * will hallucinate a plausible sentence out of a fraction of a second of room
 * noise, so this is rejected before it reaches the model rather than after.
 */
const MIN_AUDIO_BYTES = 2048;

/**
 * A minute of the recorder's 64kbps mono is around 500KB, so this is generous
 * for a spoken question while staying under what a 6mb base64 body can carry
 * once decoded (~4.5MB). The client stops recording at a minute; this is the
 * server not taking that promise on trust.
 */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/**
 * Speech models' way of saying they heard nothing: with no speech in the clip
 * they can emit one of a small set of stock phrases rather than an empty
 * string. Returning "Thank you." as the reader's question would be worse than
 * admitting we heard nothing.
 */
const EMPTY_TRANSCRIPTS = ['thank you.', 'thank you', 'thanks for watching!', 'you', 'bye.', '.', 'أهلا بك', 'شكرا'];

const isEmptyTranscript = (text) => !text || EMPTY_TRANSCRIPTS.includes(text.trim().toLowerCase());

/**
 * Transcribe a spoken question.
 *
 * @param {Object} params
 * @param {string} params.audio - base64 audio, with or without a data: prefix
 * @param {string} [params.mimeType] - the recorder's container, e.g. 'audio/m4a'
 * @returns {Promise<{ text: string }>} the transcript, empty when nothing was said
 */
const transcribe = async ({ audio, mimeType }) => {
  // `data:audio/m4a;base64,AAAA…` or the bare payload — accept both.
  const payload = audio.includes(',') ? audio.slice(audio.indexOf(',') + 1) : audio;
  const buffer = Buffer.from(payload, 'base64');

  if (buffer.length < MIN_AUDIO_BYTES) {
    return { text: '' };
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'That recording is too long — keep it under a minute.', true, '', {
      reason: 'AUDIO_TOO_LONG',
    });
  }

  const geminiMime = GEMINI_MIME_TYPES[(mimeType || '').toLowerCase()] || 'audio/mp4';

  try {
    const result = await genai().models.generateContent({
      model: config.gemini.model,
      contents: [
        { parts: [{ inlineData: { mimeType: geminiMime, data: buffer.toString('base64') } }, { text: TRANSCRIBE_PROMPT }] },
      ],
      // Plain text back, since the whole output is going straight into a text
      // input the reader can edit.
      config: {
        temperature: 0,
        ...(config.gemini.thinkingBudget === undefined
          ? {}
          : { thinkingConfig: { thinkingBudget: config.gemini.thinkingBudget } }),
      },
    });

    const text = (result && result.text) || '';
    return { text: isEmptyTranscript(text) ? '' : text.trim() };
  } catch (error) {
    logger.warn(`transcription failed: ${error.message}`);
    throw new ApiError(httpStatus.BAD_GATEWAY, "Couldn't make out that recording.", true, '', {
      reason: 'TRANSCRIPTION_FAILED',
    });
  }
};

module.exports = {
  transcribe,
};
