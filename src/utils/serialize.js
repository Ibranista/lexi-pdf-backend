/**
 * Wire formats for the LexiPDF client (spec §0).
 *
 * Timestamps go out as epoch milliseconds, never ISO strings. Optional keys
 * are omitted rather than sent as null — several client call sites test
 * truthiness on presence — with the single exception of `deletedAt`, which
 * the sync entities always carry so a tombstone is unambiguous.
 */

/** @returns {number|null} epoch ms */
const toMs = (date) => (date === null || date === undefined ? null : new Date(date).getTime());

/** @returns {Date|undefined} */
const fromMs = (ms) => (ms === null || ms === undefined ? undefined : new Date(Number(ms)));

/** Drop keys whose value is null/undefined/'' so the client sees absence, not emptiness */
const compact = (obj) => {
  const result = {};
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      result[key] = value;
    }
  });
  return result;
};

/**
 * The `user` half of AuthResponse. Anonymous users get "" for email and name,
 * not a missing key — the client renders the account row off `isAnonymous`.
 *
 * `hasCompletedOnboarding` is always present: it is what the client's root
 * navigator gates on, and an absent key there would read as "not onboarded"
 * and send a returning reader back through the question.
 */
const serializeUser = (user) => ({
  id: user.id,
  email: user.email || '',
  name: user.name || '',
  role: (user.role || 'user').toUpperCase(),
  isEmailVerified: user.isEmailVerified,
  isAnonymous: user.isAnonymous,
  hasCompletedOnboarding: Boolean(user.hasCompletedOnboarding),
  interests: user.interests || [],
  onboardedAt: toMs(user.onboardedAt),
});

const serializeDocument = (doc) => ({
  ...compact({
    docKey: doc.docKey,
    uri: doc.uri,
    name: doc.name,
    ext: doc.ext,
    openedAt: toMs(doc.openedAt),
    page: doc.page,
    pageCount: doc.pageCount,
    bookmarks: doc.bookmarks,
    readingPlanMs: doc.readingPlanMs,
    readingTimeMsByPage: doc.readingTimeMsByPage,
    collections: doc.collections,
    updatedAt: toMs(doc.updatedAt),
  }),
  deletedAt: toMs(doc.deletedAt),
});

const serializeAnnotation = (annotation) => ({
  ...compact({
    id: annotation.id,
    docKey: annotation.docKey,
    page: annotation.page,
    text: annotation.text,
    prefix: annotation.prefix,
    suffix: annotation.suffix,
    source: annotation.source,
    color: annotation.color,
    createdAt: toMs(annotation.createdAt),
    updatedAt: toMs(annotation.updatedAt),
  }),
  // a highlight is a row with note: "" — always present, never omitted
  note: annotation.note || '',
  deletedAt: toMs(annotation.deletedAt),
});

const serializeVocab = (entry) => ({
  ...compact({
    id: entry.id,
    docKey: entry.docKey,
    word: entry.word,
    pos: entry.pos,
    tr: entry.tr,
    translit: entry.translit,
    lang: entry.lang,
    p: entry.p,
    s1: entry.s1,
    s2: entry.s2,
    createdAt: toMs(entry.createdAt),
    updatedAt: toMs(entry.updatedAt),
  }),
  deletedAt: toMs(entry.deletedAt),
});

module.exports = {
  toMs,
  fromMs,
  compact,
  serializeUser,
  serializeDocument,
  serializeAnnotation,
  serializeVocab,
};
