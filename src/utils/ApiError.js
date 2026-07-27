class ApiError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   * @param {boolean} [isOperational]
   * @param {string} [stack]
   * @param {Object} [details] - extra top-level keys merged into the error body,
   *   e.g. `{ reason: 'ACCOUNT_EXISTS' }` or the quota block on a 402
   */
  constructor(statusCode, message, isOperational = true, stack = '', details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

module.exports = ApiError;
