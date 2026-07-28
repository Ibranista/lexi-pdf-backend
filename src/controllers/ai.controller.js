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
  tts,
};
