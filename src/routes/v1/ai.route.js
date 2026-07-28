const express = require('express');
const validate = require('../../middlewares/validate');
const auth = require('../../middlewares/auth');
const aiValidation = require('../../validations/ai.validation');
const aiController = require('../../controllers/ai.controller');

const router = express.Router();

router.post('/context', auth(), validate(aiValidation.context), aiController.context);
router.post('/translate', auth(), validate(aiValidation.translate), aiController.translate);
router.post('/chat', auth(), validate(aiValidation.chat), aiController.chat);
router.post('/chat/stream', auth(), validate(aiValidation.chat), aiController.chatStream);
router.get('/chat/history', auth(), validate(aiValidation.chatHistory), aiController.chatHistory);
router.post('/speak', auth(), validate(aiValidation.speak), aiController.speak);
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
