const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { aiService, quotaService, ttsService } = require('../services');

// The origin the client reached this API on — protocol + Host header. Media
// URLs are built from it so they're fetchable from that same device (the dev
// machine's LAN IP in development). Undefined-safe: falls back to config.
const originOf = (req) => `${req.protocol}://${req.get('host')}`;

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
 * Streaming chat. Quota is reserved before any bytes go out, so an exhausted
 * budget is a clean 402 (handled by the error middleware) rather than a broken
 * stream. Then the reply is sent as Server-Sent Events — one `data: { t }` per
 * token, a final `data: { done, kind, sessionId, quota }` — which the client's
 * EventSource renders token-by-token. `no-transform` keeps the gzip middleware
 * from buffering the stream, and `setNoDelay` disables Nagle so each token's
 * packet goes out immediately instead of being coalesced.
 */
const chatStream = catchAsync(async (req, res) => {
  const reserved = await quotaService.reserve(req.user);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  if (res.socket && typeof res.socket.setNoDelay === 'function') {
    res.socket.setNoDelay(true);
  }

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };

  try {
    const result = await aiService.chatStream(req.user.id, req.body, (token) => send({ t: token }));
    send({ done: true, kind: result.kind, sessionId: result.sessionId, quota: quotaService.state(reserved) });
  } catch (error) {
    await quotaService.release(reserved.id);
    send({ error: true, message: 'Lexi could not finish that just now.' });
  }
  res.end();
});

const chatHistory = catchAsync(async (req, res) => {
  const messages = await aiService.chatHistory(req.user.id, req.query.sessionId);
  res.send({ messages });
});

/**
 * Read arbitrary text aloud (a chat reply's speaker button). Not metered — it
 * re-voices content the reader already paid for, and clips are cached by text.
 */
const speak = catchAsync(async (req, res) => {
  const audioUrl = await ttsService.narrate(req.body.text, originOf(req));
  res.send({ ...(audioUrl ? { audioUrl } : {}) });
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

module.exports = {
  context,
  translate,
  chat,
  chatStream,
  chatHistory,
  speak,
  tts,
};
