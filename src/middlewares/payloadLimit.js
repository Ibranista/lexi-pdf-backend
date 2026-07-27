const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

/**
 * Reject oversized bodies with the machine reason the client branches on.
 * On 413 the sync client re-sends in chunks of 200 rows, so this has to be a
 * clean, recognisable refusal rather than a dropped connection.
 *
 * @param {number} maxBytes
 */
const payloadLimit = (maxBytes) => (req, res, next) => {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    return next(
      new ApiError(httpStatus.REQUEST_ENTITY_TOO_LARGE, 'Payload too large — send it in smaller chunks.', true, '', {
        reason: 'PAYLOAD_TOO_LARGE',
        maxBytes,
      })
    );
  }
  return next();
};

module.exports = payloadLimit;
