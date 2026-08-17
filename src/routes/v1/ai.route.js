const express = require('express');
const validate = require('../../middlewares/validate');
const auth = require('../../middlewares/auth');
const aiValidation = require('../../validations/ai.validation');
const aiController = require('../../controllers/ai.controller');

const router = express.Router();

router.post('/context', auth(), validate(aiValidation.context), aiController.context);
router.post('/translate', auth(), validate(aiValidation.translate), aiController.translate);
router.post('/translate/stream', auth(), validate(aiValidation.translate), aiController.translateStream);
router.post('/chat', auth(), validate(aiValidation.chat), aiController.chat);
router.post('/chat/stream', auth(), validate(aiValidation.chat), aiController.chatStream);
router.post('/chat/live', auth(), validate(aiValidation.chatLive), aiController.chatLive);
router.post('/realtime/session', auth(), validate(aiValidation.realtimeSession), aiController.realtimeSession);
router.post('/realtime/turn', auth(), validate(aiValidation.realtimeTurn), aiController.realtimeTurn);
router.get('/chat/history', auth(), validate(aiValidation.chatHistory), aiController.chatHistory);
router.delete('/chat/history', auth(), validate(aiValidation.clearChat), aiController.clearChat);
router.post('/speak', auth(), validate(aiValidation.speak), aiController.speak);
router.post('/transcribe', auth(), validate(aiValidation.transcribe), aiController.transcribe);
router.get('/tts', auth(), validate(aiValidation.tts), aiController.tts);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: AI
 *   description: |
 *     Lexi. Every endpoint here shares one per-user budget counted in requests and
 *     returns its state as `quota`. When the budget is gone they answer 402 (never 401,
 *     which would trigger the client's refresh interceptor) with `AI_QUOTA_EXHAUSTED`.
 */

/**
 * @swagger
 * /ai/context:
 *   post:
 *     summary: Upload extracted book text
 *     description: |
 *       Sent in chunks of ~20 pages, fire-and-forget, when the user first opens Lexi on a
 *       document. v1 records progress and discards the text: chat runs on a rolling page
 *       excerpt, so nothing reads an index yet. The route exists so the client can start
 *       uploading without a client release.
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [docKey, pages]
 *             properties:
 *               docKey:
 *                 type: string
 *               title:
 *                 type: string
 *               author:
 *                 type: string
 *               pageCount:
 *                 type: number
 *               pages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: number
 *                     text:
 *                       type: string
 *     responses:
 *       "202":
 *         description: Accepted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               docKey: 3f2a
 *               indexed: 40
 *               ready: false
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /ai/translate:
 *   post:
 *     summary: Translate and explain a selection in the passage it came from
 *     description: |
 *       Powers the word card. `s1` says what the selection means *in this passage*,
 *       `s2` why it matters here — a generic dictionary gloss is a regression. Both stay
 *       under 140 characters; the card does not scroll. `audioUrl` is inlined when a
 *       voice exists for the target language, otherwise the key is omitted.
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [docKey, text, targetLang]
 *             properties:
 *               docKey:
 *                 type: string
 *               text:
 *                 type: string
 *               context:
 *                 type: string
 *               page:
 *                 type: number
 *               targetLang:
 *                 type: string
 *                 enum: [am, ar, en]
 *               style:
 *                 type: string
 *                 enum: [simple, balanced, advanced]
 *     responses:
 *       "200":
 *         description: OK
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "402":
 *         description: Out of AI credits — show the sign-in wall or the paywall
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               code: 402
 *               reason: AI_QUOTA_EXHAUSTED
 *               message: You've used your free AI credits.
 *               requiresAuth: true
 */

/**
 * @swagger
 * /ai/chat:
 *   post:
 *     summary: Ask Lexi about the open document
 *     description: |
 *       Lexi answers about this document and nothing else. Off-topic questions come back
 *       as `kind: "drift"` with a redirect, never an answer and never a bare refusal.
 *       Questions about the book's own subject matter that go slightly beyond the text are
 *       answered briefly and tied back to the book — that is `normal`, not `drift`.
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [docKey, sessionId, message]
 *             properties:
 *               docKey:
 *                 type: string
 *               sessionId:
 *                 type: string
 *               title:
 *                 type: string
 *               author:
 *                 type: string
 *               page:
 *                 type: number
 *               excerpt:
 *                 type: string
 *               message:
 *                 type: string
 *               style:
 *                 type: string
 *                 enum: [simple, balanced, advanced]
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               reply: Sherman is the counter-example the book keeps reaching for …
 *               kind: normal
 *               sessionId: 9c1e
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "402":
 *         description: Out of AI credits
 */

/**
 * @swagger
 * /ai/chat/live:
 *   post:
 *     summary: One turn of a live, spoken conversation (SSE)
 *     description: |
 *       Everything `/ai/chat/stream` sends, plus the reply's audio. The reply is cut into
 *       sentences and voiced *as it is written*, so playback starts on the first sentence
 *       instead of after the last word — that gap is the whole difference between a
 *       conversation and a walkie-talkie.
 *
 *       Server-Sent Events, `text/event-stream`:
 *
 *       - `data: { "t": "…" }` — a token of the reply.
 *       - `data: { "s": 0, "url": "https://…/static/tts/card-….mp3", "text": "…" }` — a clip
 *         is ready. `s` is its play order: clips may arrive out of order, because a repeated
 *         sentence is a filesystem cache hit and renders instantly while a fresh one does not.
 *         Play by `s`, holding anything that arrives early.
 *       - `data: { "done": true, "kind": "normal", "sessionId": "…", "quota": {…} }` — end of
 *         the turn *and* of the audio queue: no clip is announced after it.
 *       - `data: { "error": true, "message": "…" }` — the turn failed; the credit is released.
 *
 *       Body is `/ai/chat`'s plus `spoken` (default true), which asks for an answer written to
 *       be heard: a few sentences, no lists or file names, ending in something the reader can
 *       answer out loud. Closing the connection aborts the model mid-reply; whatever had
 *       already been said is still saved to the thread, so the transcript matches what was
 *       shown. Metered as one credit, like any other reply — the speech is free, for the same
 *       reason `/ai/speak` is.
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [docKey, sessionId, message]
 *             properties:
 *               docKey:
 *                 type: string
 *               sessionId:
 *                 type: string
 *               title:
 *                 type: string
 *               author:
 *                 type: string
 *               page:
 *                 type: number
 *               excerpt:
 *                 type: string
 *               message:
 *                 type: string
 *               style:
 *                 type: string
 *                 enum: [simple, balanced, advanced]
 *               spoken:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       "200":
 *         description: An event stream of tokens and clips
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *             example: |
 *               data: {"t":"It "}
 *               data: {"t":"turns "}
 *               data: {"s":0,"url":"https://api.example.com/static/tts/card-9f2c.mp3","text":"It turns night into usable time."}
 *               data: {"done":true,"kind":"normal","sessionId":"9c1e","quota":{"used":4,"limit":50}}
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "402":
 *         description: Out of AI credits
 */

/**
 * @swagger
 * /ai/chat/history:
 *   get:
 *     summary: Prior turns for a document's conversation
 *     description: Oldest first, capped at 200, so reopening Lexi on a document continues the same thread.
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: OK
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *   delete:
 *     summary: Forget a document's conversation
 *     description: |
 *       Deletes the thread's messages and the session itself, so the next question starts
 *       fresh. Idempotent: clearing a thread that never reached the server is a 204 too.
 *       The reader's style memory is not touched — it is not part of this document.
 *       Free, and never metered.
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "204":
 *         description: No content
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /ai/transcribe:
 *   post:
 *     summary: Turn a spoken question into text
 *     description: |
 *       Backs the mic button in the chat composer. The clip is recorded on the device and
 *       sent as base64 in the JSON body — every other endpoint here is JSON and the body
 *       cap is already 6mb, so a few hundred kilobytes of speech needs no multipart stack.
 *       Nothing is stored: unlike a synthesized clip, a recording of someone's voice has no
 *       reason to outlive the request that transcribed it.
 *
 *       A clip with no speech in it answers 200 with `text: ""` and refunds its credit —
 *       holding a microphone and saying nothing is a normal outcome, not an error. The
 *       transcript lands in the composer as an editable draft, never sent on the reader's
 *       behalf.
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [audio]
 *             properties:
 *               audio:
 *                 type: string
 *                 description: base64 audio, with or without a `data:` prefix
 *               mimeType:
 *                 type: string
 *                 description: the recorder's container, e.g. `audio/m4a`
 *               lang:
 *                 type: string
 *                 enum: [am, ar, en]
 *                 description: language hint; markedly improves short clips
 *     responses:
 *       "200":
 *         description: OK — `text` is empty when nothing was said
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               text: Why does he keep coming back to Sherman?
 *       "400":
 *         description: The recording was longer than a minute
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "402":
 *         description: Out of AI credits
 *       "502":
 *         description: Transcription failed upstream
 */

/**
 * @swagger
 * /ai/tts:
 *   get:
 *     summary: Speak a word in the target language
 *     description: |
 *       Amharic has no voice: the answer is 200 with `audioUrl` omitted, not an error,
 *       and it costs no credit. The media URL needs no auth and is cacheable.
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: text
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: lang
 *         required: true
 *         schema:
 *           type: string
 *           enum: [am, ar, en]
 *     responses:
 *       "200":
 *         description: OK
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "402":
 *         description: Out of AI credits
 */
