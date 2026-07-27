const express = require('express');
const config = require('../../config/config');
const validate = require('../../middlewares/validate');
const auth = require('../../middlewares/auth');
const payloadLimit = require('../../middlewares/payloadLimit');
const syncValidation = require('../../validations/sync.validation');
const syncController = require('../../controllers/sync.controller');

const router = express.Router();

// anonymous users sync too — this is not gated on having an account
router.post('/', auth(), payloadLimit(config.sync.maxPayloadBytes), validate(syncValidation.sync), syncController.sync);
router.post('/merge', auth(), validate(syncValidation.merge), syncController.merge);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Sync
 *   description: Offline-first reconciliation of documents, annotations and vocabulary
 */

/**
 * @swagger
 * /sync:
 *   post:
 *     summary: Push local changes and pull everything since the cursor
 *     description: |
 *       One round trip in both directions. Last write wins per row, compared on the
 *       client's `updatedAt`, ties breaking toward the server. Deletes are tombstones:
 *       `deletedAt` is set and the row is returned so other devices can drop their copy.
 *       The response excludes writes attributed to the calling `deviceId`.
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deviceId
 *             properties:
 *               cursor:
 *                 type: string
 *                 nullable: true
 *                 description: Opaque; null on first sync
 *               deviceId:
 *                 type: string
 *                 format: uuid
 *               changes:
 *                 type: object
 *                 properties:
 *                   documents:
 *                     type: array
 *                     items:
 *                       type: object
 *                   annotations:
 *                     type: array
 *                     items:
 *                       type: object
 *                   vocab:
 *                     type: array
 *                     items:
 *                       type: object
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cursor:
 *                   type: string
 *                 changes:
 *                   type: object
 *                 serverTime:
 *                   type: number
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "409":
 *         description: A client-generated id collided; re-issue it and push again
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               code: 409
 *               reason: ID_CONFLICT
 *               message: Re-issue these ids and push again.
 *               ids: [m9x2k1-3]
 *       "413":
 *         description: Body over the payload cap; re-send in chunks of 200 rows
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               code: 413
 *               reason: PAYLOAD_TOO_LARGE
 *               message: Payload too large — send it in smaller chunks.
 */

/**
 * @swagger
 * /sync/merge:
 *   post:
 *     summary: Fold an anonymous device's data into the signed-in account
 *     description: |
 *       Union by entity id; on collision the newer `updatedAt` wins. The anonymous user
 *       is then deleted. An unknown or already-merged `fromDeviceId` returns 200 with
 *       zero counts — the client retries this call and it must be idempotent.
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fromDeviceId
 *             properties:
 *               fromDeviceId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               merged:
 *                 documents: 12
 *                 annotations: 84
 *                 vocab: 31
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */
