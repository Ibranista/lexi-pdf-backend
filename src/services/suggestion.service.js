const logger = require('../config/logger');

/**
 * Book suggestions (spec §3). Replaces the client's three fan-out Gutendex
 * searches with one personalised call.
 *
 * Everything here is defensive on purpose: the endpoint is unauthenticated,
 * renders a section the reader did not ask for, and the client falls back to a
 * degraded row on failure. Partial results beat a 5xx every time.
 */

// the trailing slash matters: without it Gutendex answers 301 and the redirect
// hop costs more than the whole request does
const GUTENDEX = 'https://gutendex.com/books/';
const REQUEST_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 60 * 60 * 1000;

// the 16 onboarding ids (src/constants/onboarding.ts) → a Gutendex topic
const TOPICS = {
  textbooks: 'education',
  'academic-papers': 'science',
  science: 'science',
  'language-learning': 'language',
  'work-documents': 'business',
  reports: 'politics',
  business: 'business',
  manuals: 'technology',
  philosophy: 'philosophy',
  history: 'history',
  'self-improvement': 'conduct of life',
  essays: 'essays',
  biographies: 'biography',
  fiction: 'fiction',
  novels: 'fiction',
  'short-stories': 'short stories',
};

// badge text: one word, ~10 chars, it sits in a fixed pill
const KINDS = {
  textbooks: 'Textbook',
  'academic-papers': 'Science',
  science: 'Science',
  'language-learning': 'Language',
  'work-documents': 'Business',
  reports: 'Report',
  business: 'Business',
  manuals: 'Manual',
  philosophy: 'Ideas',
  history: 'History',
  'self-improvement': 'Growth',
  essays: 'Essay',
  biographies: 'Life',
  fiction: 'Novel',
  novels: 'Novel',
  'short-stories': 'Stories',
};

const DEFAULT_INTERESTS = ['self-improvement', 'philosophy', 'fiction'];
const SHELVES = ['📖 Reading Later', '🔖 To Read', '💛 Favorites'];

const cache = new Map();

// what follows the comma is not always a given name: Gutenberg also writes
// "Marcus Aurelius, Emperor of Rome", and flipping that reads as nonsense
const EPITHET = /\b(of|emperor|empress|king|queen|saint|st\.|sir|lord|lady|dr\.|pope|prince|princess|duke|earl|bishop)\b/i;

/** "Austen, Jane" → "Jane Austen"; the client renders it as-is after "by". */
const displayAuthor = (author) => {
  if (!author || !author.name) return '';
  const [family, ...rest] = author.name.split(',').map((part) => part.trim());
  const given = rest.join(', ');
  if (!given || EPITHET.test(given)) {
    return family;
  }
  return `${given} ${family}`;
};

/** Rendered numberOfLines={1}; anything past ~40 chars is invisible anyway. */
const clampTitle = (title) => {
  const clean = (title || '').split('\n')[0].trim();
  return clean.length <= 40 ? clean : `${clean.slice(0, 39).trimEnd()}…`;
};

/**
 * The client packs a cover into this url as `?lexiCover=…` and later strips
 * the *first* match back off. A lexiCover of ours would be the one stripped,
 * and the book would open at a mangled url.
 */
const stripLexiCover = (url) => url.replace(/([?&])lexiCover=[^&]*&?/, '$1').replace(/[?&]$/, '');

const secure = (url) => (url ? url.replace(/^http:\/\//, 'https://') : undefined);

const toSuggestion = (book, interest, collection) => {
  const formats = book.formats || {};
  const html = Object.entries(formats).find(([type]) => type.startsWith('text/html'));
  const readUrl = html ? stripLexiCover(secure(html[1])) : `https://www.gutenberg.org/ebooks/${book.id}.html.images`;
  const coverUrl = secure(formats['image/jpeg']);

  return {
    id: `gutenberg-${book.id}`,
    title: clampTitle(book.title),
    author: displayAuthor((book.authors || [])[0]),
    // omit the key entirely when there is no cover
    ...(coverUrl ? { coverUrl } : {}),
    readUrl: readUrl.endsWith('.zip') ? '' : readUrl,
    collection,
    kind: KINDS[interest] || 'Classic',
  };
};

const fetchTopic = async (topic) => {
  const url = `${GUTENDEX}?topic=${encodeURIComponent(topic)}&languages=en&sort=popular`;
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`gutendex ${response.status}`);
  }
  const body = await response.json();
  return body.results || [];
};

/**
 * @param {Object} query - { limit, interests, collection }
 * @returns {Promise<{ suggestions: Object[] }>}
 */
const getSuggestions = async ({ limit = 3, interests, collection }) => {
  const picked = (interests && interests.length ? interests : DEFAULT_INTERESTS).filter((id) => TOPICS[id]);
  const chosen = picked.length ? picked : DEFAULT_INTERESTS;

  const cacheKey = JSON.stringify({ limit, chosen, collection });
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }

  // one request per interest, in the order the user picked them; a topic that
  // fails drops out rather than failing the call
  const batches = await Promise.all(
    chosen.slice(0, limit).map(async (interest) => {
      try {
        return { interest, books: await fetchTopic(TOPICS[interest]) };
      } catch (error) {
        logger.warn(`book suggestions: topic "${interest}" failed — ${error.message}`);
        return { interest, books: [] };
      }
    })
  );

  // round-robin so three interests give three different flavours, and `id`
  // stays stable across requests because nothing here is randomised
  const suggestions = [];
  const seen = new Set();
  for (let depth = 0; suggestions.length < limit && depth < 5; depth += 1) {
    batches.forEach(({ interest, books }, index) => {
      const book = books[depth];
      if (!book || seen.has(book.id) || suggestions.length >= limit) return;
      seen.add(book.id);
      suggestions.push(toSuggestion(book, interest, collection || SHELVES[index % SHELVES.length]));
    });
  }

  const value = { suggestions };
  // never cache a wipeout: a transient upstream failure would otherwise blank
  // the section for an hour
  if (suggestions.length) {
    cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return value;
};

module.exports = {
  getSuggestions,
  TOPICS,
};
