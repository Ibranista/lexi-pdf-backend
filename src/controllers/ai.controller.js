const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { aiService, factcheckService, quotaService, realtimeService, sttService, ttsService } = require('../services');

// The origin the client reached this API on — protocol + Host header. Media
// URLs are built from it so they're fetchable from that same device (the dev
// machine's LAN IP in development). Undefined-safe: falls back to config.
const originOf = (req) => `${req.protocol}://${req.get('host')}`;

/**
 * Open a Server-Sent Events response and return its writer.
 *
 * `no-transform` keeps the gzip middleware from buffering the stream, and
 * `setNoDelay` disables Nagle so each token's packet leaves immediately instead
 * of being coalesced with the next one. The writer is a no-op once the socket
 * is gone, so a reader who closes the panel mid-reply doesn't take the request
 * down with an EPIPE.
 */
const openStream = (res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  if (res.socket && typeof res.socket.setNoDelay === 'function') {
    res.socket.setNoDelay(true);
  }
  return (obj) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };
};

/**
 * Book text ingest. Fire-and-forget from the client's side, and free — it
 * generates nothing, so it does not touch the budget.
 */
const context = catchAsync(async (req, res) => {
  res.status(httpStatus.ACCEPTED).send(await aiService.indexContext(req.user.id, req.body));
});

const translate = catchAsync(async (req, res) => {
  const { result, quota } = await quotaService.meter(req.user, () =>
    aiService.translate(req.user.id, req.body, originOf(req))
  );
  res.send({ ...result, quota });
});

const chat = catchAsync(async (req, res) => {
  const { result, quota } = await quotaService.meter(req.user, () => aiService.chat(req.user.id, req.body));
  res.send({ ...result, quota });
});

/**
 * Streaming word card. Same SSE shape as {@link chatStream}: quota reserved
 * up front so an exhausted budget is a clean 402, then `data: { f, t }` per
 * field as it's written (`f` the field name, `t` its value so far), and a
 * final `data: { done, ...card, quota }` carrying the finished, clamped card.
 */
const translateStream = catchAsync(async (req, res) => {
  // Before the headers go out, so a selection with nothing to translate is a
  // real 400 rather than an error frame inside a 200 stream.
  aiService.assertTranslatable(req.body.text);

  const reserved = await quotaService.reserve(req.user);
  const send = openStream(res);

  try {
    const card = await aiService.translateStream(req.user.id, req.body, originOf(req), (f, t) => send({ f, t }));
    send({ done: true, ...card, quota: quotaService.state(reserved) });
  } catch (error) {
    await quotaService.release(reserved.id);
    send({ error: true, message: "Lexi couldn't finish that just now." });
  }
  res.end();
});

/**
 * Streaming chat. Quota is reserved before any bytes go out, so an exhausted
 * budget is a clean 402 (handled by the error middleware) rather than a broken
 * stream. Then the reply is sent as Server-Sent Events — one `data: { t }` per
 * token, a final `data: { done, kind, sessionId, quota }` — which the client's
 * EventSource renders token-by-token.
 */
const chatStream = catchAsync(async (req, res) => {
  const reserved = await quotaService.reserve(req.user);
  const send = openStream(res);

  try {
    const result = await aiService.chatStream(req.user.id, req.body, (token) => send({ t: token }));
    send({ done: true, kind: result.kind, sessionId: result.sessionId, quota: quotaService.state(reserved) });
  } catch (error) {
    await quotaService.release(reserved.id);
    send({ error: true, message: 'Lexi could not finish that just now.' });
  }
  res.end();
});

/**
 * One turn of a live, spoken conversation.
 *
 * Everything {@link chatStream} sends, plus the reply's audio — cut into
 * sentences and voiced as it is written, so the reader hears the first sentence
 * while the last is still being generated. Waiting for the whole reply and then
 * synthesizing it is the difference between a conversation and a walkie-talkie.
 *
 *   data: { t }                  a token of the reply, as before
 *   data: { s, url, text }       a clip is ready; `s` is its play order
 *   data: { done, kind, … }      end of turn — and of the audio queue
 *
 * Clips can arrive out of order (a repeated sentence is a cache hit and renders
 * instantly), which is what `s` is for. Text and audio share the one stream so
 * the transcript and the voice can never disagree about what was said.
 *
 * Metered exactly like {@link chatStream}: one reply, one credit. The speech is
 * free for the same reason `/ai/speak` is — it re-voices an answer the reader
 * has already paid for.
 */
const chatLive = catchAsync(async (req, res) => {
  const reserved = await quotaService.reserve(req.user);
  const send = openStream(res);

  // A reader who hangs up mid-reply stops the model rather than paying for
  // words nobody will hear. What was already said is still persisted.
  const hangup = new AbortController();
  res.on('close', () => hangup.abort());

  try {
    const result = await aiService.chatStream(req.user.id, req.body, (token) => send({ t: token }), {
      signal: hangup.signal,
      speech: {
        requestBase: originOf(req),
        onReady: ({ seq, url, text }) => send({ s: seq, url, text }),
      },
    });
    send({ done: true, kind: result.kind, sessionId: result.sessionId, quota: quotaService.state(reserved) });
  } catch (error) {
    await quotaService.release(reserved.id);
    send({ error: true, message: 'Lexi could not finish that just now.' });
  }
  res.end();
});

/**
 * Open a live voice conversation.
 *
 * Answers a short-lived client secret the device uses to hold a WebRTC call
 * with the realtime model directly — which is the only way to get the first
 * word back in a few hundred milliseconds instead of a second or two. The API
 * key stays here; so does the prompt, because the rule that keeps Lexi inside
 * one document is not something a client should be able to rewrite.
 *
 * Not metered: opening a line costs nothing and a reader who opens it twice
 * because the first attempt failed should not pay for that. The turns spoken
 * across it are metered as they land, by {@link realtimeTurn}.
 */
const realtimeSession = catchAsync(async (req, res) => {
  // Refused before a session is minted rather than after, so an exhausted
  // reader meets the wall instead of a microphone that answers nothing.
  const current = await quotaService.assertAvailable(req.user);
  const session = await realtimeService.createSession(req.user.id, req.body);
  res.send({ ...session, quota: quotaService.state(current) });
});

/**
 * Record one exchange from a live conversation, and charge for it.
 *
 * The call never passes through this server, so this is the only point at which
 * a spoken turn can be counted or kept. Sent by the client as each turn
 * completes rather than at the end of the call: a conversation that ends with
 * the app being killed should still have left its history behind.
 */
const realtimeTurn = catchAsync(async (req, res) => {
  const { result, quota } = await quotaService.meter(req.user, () => aiService.recordTurn(req.user.id, req.body));
  res.send({ ...result, quota });
});

/**
 * Check the page in front of the reader.
 *
 * Metered only when a check actually runs. A page skipped because the book is
 * fiction, or because it is too short to hold a claim, costs nothing — and a
 * cached page costs nothing either, since somebody already paid for it. Billing
 * a page turn that did no work would make reading with this on feel like a
 * meter running, which is exactly what would get it turned off.
 */
const pageCheck = catchAsync(async (req, res) => {
  const { result, quota } = await quotaService.meter(req.user, () => factcheckService.checkPage(req.user.id, req.body));

  if (!result.checked || result.cached) {
    await quotaService.release(req.user.id);
    return res.send({ ...result, quota: quotaService.state(req.user) });
  }
  return res.send({ ...result, quota });
});

const chatHistory = catchAsync(async (req, res) => {
  const messages = await aiService.chatHistory(req.user.id, req.query.sessionId);
  res.send({ messages });
});

/**
 * Delete a document's conversation. Idempotent — clearing a thread that is
 * already gone is a 204 too, so the client never has to care whether the
 * history had reached the server yet. Free: it generates nothing.
 */
const clearChat = catchAsync(async (req, res) => {
  await aiService.clearChat(req.user.id, req.query.sessionId);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Read arbitrary text aloud (a chat reply's speaker button). Not metered — it
 * re-voices content the reader already paid for, and clips are cached by text.
 */
const speak = catchAsync(async (req, res) => {
  const audioUrl = await ttsService.narrate(req.body.text, originOf(req));
  // When each word lands, so the reader can follow the voice through the text.
  // Only worth aligning once there is a clip to align against; an empty list
  // simply means the reply plays with nothing following it.
  const words = audioUrl ? await ttsService.narrateTimings(req.body.text) : [];
  res.send({ ...(audioUrl ? { audioUrl } : {}), words });
});

const tts = catchAsync(async (req, res) => {
  const { text, lang } = req.query;

  // A language with no voice is a 200 with the key omitted, not an error, and
  // it costs nothing — so it must not spend a credit either.
  if (!ttsService.hasVoice(lang)) {
    return res.send({ quota: quotaService.state(req.user) });
  }

  const { result, quota } = await quotaService.meter(req.user, () => ttsService.synthesize(text, lang, originOf(req)));
  return res.send({ ...(result ? { audioUrl: result } : {}), quota });
});

/**
 * Turn a spoken question into text for the chat composer.
 *
 * Metered like any other model call, but a clip with no speech in it refunds
 * itself: `meter` has already reserved a credit by then, so silence — a
 * mis-tap, a button held for a quarter of a second — must not cost the reader
 * one. The empty transcript still comes back 200; "I heard nothing" is a
 * normal outcome of holding a microphone, not an error.
 */
const transcribe = catchAsync(async (req, res) => {
  const { result, quota } = await quotaService.meter(req.user, () => sttService.transcribe(req.body));

  if (!result.text) {
    await quotaService.release(req.user.id);
    return res.send({ text: '', quota: quotaService.state(req.user) });
  }
  return res.send({ text: result.text, quota });
});

module.exports = {
  context,
  translate,
  translateStream,
  chat,
  chatStream,
  chatLive,
  realtimeSession,
  realtimeTurn,
  pageCheck,
  chatHistory,
  clearChat,
  speak,
  transcribe,
  tts,
};
