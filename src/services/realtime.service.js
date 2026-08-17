const httpStatus = require('http-status');
const config = require('../config/config');
const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const aiService = require('./ai.service');

/**
 * Live voice, as a real conversation.
 *
 * The sentence-at-a-time pipeline behind `/ai/chat/live` cannot be made fast
 * enough: a sentence has to be finished, sent to a speech model, rendered to a
 * file and fetched back before a single word is heard. That floor is a second
 * or two no matter how the chunking is tuned, and a second or two is the
 * difference between talking to someone and leaving them a voicemail.
 *
 * So the model speaks directly. The device holds a WebRTC call with OpenAI's
 * realtime model — audio up, audio down, first word back in a few hundred
 * milliseconds — and the transcript arrives on the same connection, so the chat
 * on screen is written by the same turn the reader is hearing.
 *
 * The API key never leaves this server. The device is given a short-lived
 * client secret instead, minted here with the book's instructions already
 * baked in: the scope rule that keeps Lexi inside one document is not something
 * a client can be trusted to send.
 */

const CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets';

/** A minted secret is good for a few minutes; the call outlives it once open. */
const REQUEST_TIMEOUT_MS = 10000;

/**
 * What a live call adds on top of the spoken-answer rules.
 *
 * Only the parts that are specific to being *interruptible and in real time* —
 * brevity, no lists and no file names come from the shared spoken guidance,
 * which is why this session is built with `spoken: true`. Repeating them here
 * would be noise; contradicting them, which an earlier draft of this did by
 * inheriting the chat-bubble rule, is worse.
 */
const VOICE_GUIDANCE = [
  '',
  'This is a live call, not a written answer:',
  '- The reader can interrupt you. If they start talking, stop immediately and listen.',
  '- Never narrate what you are about to do. Answer.',
  '- Speak at a natural pace. Do not spell things out or read punctuation aloud.',
].join('\n');

/**
 * The document this session is allowed to talk about, and how to talk about it.
 * Built here rather than sent by the client for the same reason the typed chat
 * builds it here: the scope rule is the product, and a prompt the device could
 * rewrite is not a rule.
 */
const instructionsFor = async (userId, { docKey, title, author, page, style }) => {
  const [known, memory] = await Promise.all([
    prisma.documentIndex.findUnique({ where: { userId_docKey: { userId, docKey } } }),
    prisma.userMemory.findUnique({ where: { userId } }),
  ]);

  return (
    aiService.chatSystemPrompt({
      author: author || (known && known.author) || '',
      memory: (memory && memory.style) || '',
      page,
      // The same rules the SSE voice turn uses: a few sentences, no lists, no
      // file names read out, ending on something answerable.
      spoken: true,
      style,
      title: title || (known && known.title) || '',
      turns: 1,
    }) + VOICE_GUIDANCE
  );
};

/**
 * Mint a short-lived client secret for one live conversation.
 *
 * @param {string} userId
 * @param {Object} params - { docKey, title, author, page, style }
 * @returns {Promise<{ clientSecret: string, expiresAt: number, model: string, voice: string }>}
 */
const createSession = async (userId, params) => {
  if (!config.openai.apiKey) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Live voice is not configured on this server.', true, '', {
      reason: 'REALTIME_NOT_CONFIGURED',
    });
  }

  const instructions = await instructionsFor(userId, params);

  const response = await fetch(CLIENT_SECRETS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      session: {
        type: 'realtime',
        model: config.openai.realtimeModel,
        instructions,
        audio: {
          input: {
            // Server-side turn detection: the model decides when the reader has
            // finished talking, from the audio itself. The old client-side
            // silence timer was a guess made from a level meter, and it either
            // cut people off or made them wait.
            turn_detection: { type: 'semantic_vad' },
            transcription: { model: config.openai.sttModel },
          },
          output: { voice: config.openai.realtimeVoice },
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new ApiError(httpStatus.BAD_GATEWAY, "Lexi couldn't open a voice session just now.", true, '', {
      reason: 'REALTIME_SESSION_FAILED',
      detail: detail.slice(0, 500),
    });
  }

  const body = await response.json();
  // The GA shape is `{ value, expires_at }`; older ones nested it under
  // `client_secret`. Accept both rather than breaking on a field move.
  const secret = body.value || (body.client_secret && (body.client_secret.value || body.client_secret));
  const expiresAt = body.expires_at || (body.client_secret && body.client_secret.expires_at);

  if (!secret) {
    throw new ApiError(httpStatus.BAD_GATEWAY, "Lexi couldn't open a voice session just now.", true, '', {
      reason: 'REALTIME_SESSION_FAILED',
    });
  }

  return {
    clientSecret: secret,
    expiresAt: expiresAt ? expiresAt * 1000 : null,
    model: config.openai.realtimeModel,
    voice: config.openai.realtimeVoice,
  };
};

module.exports = {
  createSession,
  instructionsFor,
  VOICE_GUIDANCE,
};
