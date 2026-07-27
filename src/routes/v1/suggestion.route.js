const express = require('express');
const validate = require('../../middlewares/validate');
const suggestionValidation = require('../../validations/suggestion.validation');
const suggestionController = require('../../controllers/suggestion.controller');

const router = express.Router();

// unauthenticated: the library renders this section before anyone signs in
router.get('/', validate(suggestionValidation.getBookSuggestions), suggestionController.getBookSuggestions);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Suggestions
 *   description: Personalised reading suggestions
 */

/**
 * @swagger
 * /book-suggestions:
 *   get:
 *     summary: Books to suggest in the library
 *     description: |
 *       Returns 3–5 rows, consistently — the client renders a fixed number of skeleton
 *       rows. `id` is stable across requests because it is the React key. `readUrl` is an
 *       HTML page, never a PDF or EPUB: it loads in a WebView and a binary renders blank,
 *       and it never carries a `lexiCover` query parameter. Failures and empty results
 *       are 200 with an empty array rather than a 5xx.
 *     tags: [Suggestions]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *           default: 3
 *       - in: query
 *         name: interests
 *         description: Comma-separated onboarding ids, in the order the user picked them
 *         schema:
 *           type: string
 *         example: philosophy,self-improvement,biographies
 *       - in: query
 *         name: collection
 *         description: The user's dominant shelf label, rendered verbatim including emoji
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               suggestions:
 *                 - id: gutenberg-1342
 *                   title: Pride and Prejudice
 *                   author: Jane Austen
 *                   coverUrl: https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg
 *                   readUrl: https://www.gutenberg.org/ebooks/1342.html.images
 *                   collection: 📖 Reading Later
 *                   kind: Novel
 */
