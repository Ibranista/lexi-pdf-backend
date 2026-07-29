const httpStatus = require('http-status');
const config = require('../config/config');
const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { toMs, fromMs, serializeDocument, serializeAnnotation, serializeVocab } = require('../utils/serialize');

// One pull never returns more than this per entity; the cursor comes back
// short and the client immediately syncs again for the rest.
const PAGE_SIZE = 1000;

/**
 * Cursors are an opaque base64 of `{ t: <epoch ms> }`. Anything we cannot read
 * is treated as a first sync rather than an error — a client that lost its
 * cursor must be able to recover by sending garbage or null.
 */
const encodeCursor = (date) => Buffer.from(JSON.stringify({ t: date.getTime() })).toString('base64url');

const decodeCursor = (cursor) => {
  if (!cursor) return null;
  try {
    const { t } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return Number.isFinite(t) ? new Date(t) : null;
  } catch (error) {
    return null;
  }
};

/**
 * Per-entity description of how a client row maps onto a table. Everything
 * below this point is generic over the three entities.
 */
const ENTITIES = {
  documents: {
    model: 'document',
    serialize: serializeDocument,
    // identity of a row within one user's data
    identity: (row) => row.docKey,
    identityField: 'docKey',
    where: (userId, row) => ({ userId_docKey: { userId, docKey: row.docKey } }),
    toData: (row, deviceId) => ({
      docKey: row.docKey,
      uri: row.uri,
      name: row.name,
      ext: row.ext || 'PDF',
      openedAt: fromMs(row.openedAt) || new Date(),
      page: row.page || 0,
      pageCount: row.pageCount ?? null,
      bookmarks: row.bookmarks || [],
      readingPlanMs: row.readingPlanMs || [],
      readingTimeMsByPage: row.readingTimeMsByPage ?? null,
      collections: row.collections || [],
      updatedAt: fromMs(row.updatedAt),
      deletedAt: fromMs(row.deletedAt) || null,
      lastDeviceId: deviceId,
    }),
  },
  annotations: {
    model: 'annotation',
    serialize: serializeAnnotation,
    identity: (row) => row.id,
    identityField: 'id',
    where: (userId, row) => ({ userId_id: { userId, id: row.id } }),
    // Same id, different birthday: two devices minted the same client id for
    // two different annotations. Merging them would silently lose one.
    collides: (stored, incoming) => toMs(stored.createdAt) !== toMs(incoming.createdAt),
    toData: (row, deviceId) => ({
      id: row.id,
      docKey: row.docKey,
      page: row.page,
      // verbatim: the reflow reader re-finds the mark by searching for this
      // exact string, so no trimming, no quote normalisation
      text: row.text,
      source: row.source ?? null,
      color: row.color,
      note: row.note || '',
      createdAt: fromMs(row.createdAt) || new Date(),
      updatedAt: fromMs(row.updatedAt),
      deletedAt: fromMs(row.deletedAt) || null,
      lastDeviceId: deviceId,
    }),
  },
  vocab: {
    model: 'vocabEntry',
    serialize: serializeVocab,
    identity: (row) => row.id,
    identityField: 'id',
    where: (userId, row) => ({ userId_id: { userId, id: row.id } }),
    collides: (stored, incoming) => toMs(stored.createdAt) !== toMs(incoming.createdAt),
    toData: (row, deviceId) => ({
      id: row.id,
      docKey: row.docKey,
      word: row.word,
      pos: row.pos ?? null,
      tr: row.tr,
      translit: row.translit ?? null,
      lang: row.lang,
      p: row.p ?? null,
      s1: row.s1 ?? null,
      s2: row.s2 ?? null,
      createdAt: fromMs(row.createdAt) || new Date(),
      updatedAt: fromMs(row.updatedAt),
      deletedAt: fromMs(row.deletedAt) || null,
      lastDeviceId: deviceId,
    }),
  },
};

const ENTITY_NAMES = Object.keys(ENTITIES);

/**
 * Collapse repeats within one push. A burst can legitimately contain the same
 * row twice; only the newest matters and createMany would reject the pair.
 */
const dedupe = (spec, rows) => {
  const byIdentity = new Map();
  rows.forEach((row) => {
    const previous = byIdentity.get(spec.identity(row));
    if (!previous || Number(row.updatedAt) >= Number(previous.updatedAt)) {
      byIdentity.set(spec.identity(row), row);
    }
  });
  return [...byIdentity.values()];
};

/**
 * Push one entity's rows. Last write wins on the client's `updatedAt`, ties
 * break toward the server.
 *
 * A colliding client id aborts the whole entity so the push stays atomic and
 * the client can re-issue and retry — except during a merge, where there is no
 * client to re-issue and the colliding row is simply left behind.
 *
 * @returns {Promise<{ conflicts: string[], serverWon: Object[] }>}
 */
const applyEntity = async (userId, deviceId, name, incoming, { tolerateCollisions = false } = {}) => {
  const spec = ENTITIES[name];
  const rows = dedupe(spec, incoming);
  if (!rows.length) {
    return { conflicts: [], serverWon: [] };
  }

  const stored = await prisma[spec.model].findMany({
    where: { userId, [spec.identityField]: { in: rows.map(spec.identity) } },
  });
  const byIdentity = new Map(stored.map((row) => [spec.identity(row), row]));

  const creates = [];
  const updates = [];
  const conflicts = [];
  const serverWon = [];

  rows.forEach((row) => {
    const previous = byIdentity.get(spec.identity(row));
    if (!previous) {
      creates.push({ userId, ...spec.toData(row, deviceId) });
      return;
    }
    if (spec.collides && spec.collides(previous, row)) {
      conflicts.push(spec.identity(row));
      return;
    }
    // Ties break toward the server, with one exception: a delete. A highlight
    // that loses a tie is stale data the reader will not notice; a tombstone
    // that loses one puts a note they deleted back on their screen — and the
    // client, told its push succeeded, has already dropped the tombstone and
    // will never send it again. Same-millisecond create-then-delete is rare but
    // it is exactly the case where "deleted" has to stick.
    const deleting = row.deletedAt !== null && row.deletedAt !== undefined;
    const incomingWins = deleting
      ? toMs(row.updatedAt) >= toMs(previous.updatedAt)
      : toMs(row.updatedAt) > toMs(previous.updatedAt);

    if (incomingWins) {
      updates.push(prisma[spec.model].update({ where: spec.where(userId, row), data: spec.toData(row, deviceId) }));
    } else {
      // The server's copy is newer or the same age. The client has to be told
      // what it is, and the device filter on the pull would hide it if this
      // same device wrote it, so hand it back explicitly.
      serverWon.push(previous);
    }
  });

  if (conflicts.length && !tolerateCollisions) {
    return { conflicts, serverWon };
  }

  if (creates.length) {
    await prisma[spec.model].createMany({ data: creates, skipDuplicates: true });
  }
  if (updates.length) {
    await prisma.$transaction(updates);
  }

  return { conflicts: [], serverWon };
};

/**
 * Everything changed since `since` and at or before `until`, minus this
 * device's own writes so a push does not echo back into itself.
 */
const pullEntity = async (userId, deviceId, name, since, until) => {
  const spec = ENTITIES[name];
  const where = {
    userId,
    serverUpdatedAt: { ...(since ? { gt: since } : {}), lte: until },
    ...(deviceId ? { OR: [{ lastDeviceId: null }, { lastDeviceId: { not: deviceId } }] } : {}),
  };

  const rows = await prisma[spec.model].findMany({ where, orderBy: { serverUpdatedAt: 'asc' }, take: PAGE_SIZE });
  if (rows.length < PAGE_SIZE) {
    return { rows, truncatedAt: null };
  }

  // A createMany stamps every row it inserts with the same serverUpdatedAt, so
  // a page boundary can land inside a group of identical timestamps. Pull the
  // whole group in, otherwise the next `gt` cursor would step over the rest.
  const boundary = rows[rows.length - 1].serverUpdatedAt;
  const tail = await prisma[spec.model].findMany({ where: { ...where, serverUpdatedAt: boundary } });
  const byIdentity = new Map([...rows, ...tail].map((row) => [spec.identity(row), row]));
  return { rows: [...byIdentity.values()], truncatedAt: boundary };
};

/** Tombstones are kept so other devices can remove their copies, then purged. */
const purgeTombstones = async (userId) => {
  const cutoff = new Date(Date.now() - config.sync.tombstoneDays * 24 * 60 * 60 * 1000);
  await Promise.all(
    ENTITY_NAMES.map((name) => prisma[ENTITIES[name].model].deleteMany({ where: { userId, deletedAt: { lt: cutoff } } }))
  );
};

/**
 * One round trip, both directions (spec §2.3).
 * @param {string} userId
 * @param {Object} body - { cursor, deviceId, changes }
 * @returns {Promise<Object>}
 */
const sync = async (userId, body) => {
  const { cursor, deviceId, changes = {} } = body;
  const since = decodeCursor(cursor);

  // Anything written from here on lands after `until` and is left for the next
  // round, which keeps the cursor from stepping over concurrent writes.
  const until = new Date();

  const applied = {};
  const conflicts = [];
  /* eslint-disable no-await-in-loop, no-restricted-syntax */
  for (const name of ENTITY_NAMES) {
    const result = await applyEntity(userId, deviceId, name, changes[name] || []);
    applied[name] = result.serverWon;
    conflicts.push(...result.conflicts);
  }
  /* eslint-enable no-await-in-loop, no-restricted-syntax */

  if (conflicts.length) {
    throw new ApiError(httpStatus.CONFLICT, 'Re-issue these ids and push again.', true, '', {
      reason: 'ID_CONFLICT',
      ids: conflicts,
    });
  }

  if (deviceId) {
    await prisma.device.updateMany({ where: { deviceId, userId }, data: { lastSyncedAt: new Date() } });
  }

  const pulled = await Promise.all(ENTITY_NAMES.map((name) => pullEntity(userId, deviceId, name, since, until)));

  const responseChanges = {};
  let nextCursor = until;
  ENTITY_NAMES.forEach((name, index) => {
    const spec = ENTITIES[name];
    const { rows, truncatedAt } = pulled[index];
    // include rows this push lost, so the client adopts the server's version
    const byIdentity = new Map([...rows, ...applied[name]].map((row) => [spec.identity(row), row]));
    responseChanges[name] = [...byIdentity.values()].map(spec.serialize);
    if (truncatedAt && truncatedAt < nextCursor) {
      nextCursor = truncatedAt;
    }
  });

  await purgeTombstones(userId);

  return {
    cursor: encodeCursor(nextCursor),
    changes: responseChanges,
    serverTime: Date.now(),
  };
};

/**
 * Onboarding follows the same last-write-wins rule as everything else here.
 * The account keeps its own answers unless the device answered them later —
 * which is the ordinary case, because the reader onboarded anonymously on this
 * phone and only then signed into an account made somewhere else.
 *
 * Never un-completes: an account that has onboarded stays onboarded even if
 * the row being absorbed had not.
 */
const mergeOnboarding = async (user, source) => {
  const completed = user.hasCompletedOnboarding || source.hasCompletedOnboarding;
  const deviceIsNewer = toMs(source.onboardedAt) > (toMs(user.onboardedAt) ?? 0);
  const adoptDevice = source.hasCompletedOnboarding && (!user.hasCompletedOnboarding || deviceIsNewer);

  if (completed === user.hasCompletedOnboarding && !adoptDevice) {
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      hasCompletedOnboarding: completed,
      ...(adoptDevice ? { interests: source.interests, onboardedAt: source.onboardedAt } : {}),
    },
  });
};

/**
 * Fold an anonymous user's data into the caller's account and delete it
 * (spec §1.3). Union by entity id; on collision the newer `updatedAt` wins.
 *
 * Idempotent by contract: an unknown or already-merged `fromDeviceId` is a
 * 200 with zero counts, because the client retries this call.
 *
 * @param {User} user - the signed-in account absorbing the data
 * @param {string} fromDeviceId
 * @returns {Promise<Object>}
 */
const merge = async (user, fromDeviceId) => {
  const empty = { merged: { documents: 0, annotations: 0, vocab: 0 } };

  const device = await prisma.device.findUnique({ where: { deviceId: fromDeviceId }, include: { user: true } });
  if (!device || device.userId === user.id || !device.user.isAnonymous) {
    return empty;
  }

  const source = device.user;
  const merged = {};

  /* eslint-disable no-await-in-loop, no-restricted-syntax */
  for (const name of ENTITY_NAMES) {
    const spec = ENTITIES[name];
    const rows = await prisma[spec.model].findMany({ where: { userId: source.id } });
    // route them through the same last-write-wins path as a normal push
    const result = await applyEntity(user.id, device.deviceId, name, rows.map(spec.serialize), {
      tolerateCollisions: true,
    });
    merged[name] = rows.length - result.conflicts.length;
  }
  /* eslint-enable no-await-in-loop, no-restricted-syntax */

  await mergeOnboarding(user, source);

  // cascades through the anonymous user's devices, tokens and leftover rows
  await prisma.user.delete({ where: { id: source.id } });

  return { merged };
};

module.exports = {
  sync,
  merge,
  encodeCursor,
  decodeCursor,
  ENTITY_NAMES,
};
