/**
 * Query a Prisma model with pagination
 * @param {Object} model - A Prisma model delegate, e.g. prisma.user
 * @param {Object} [filter] - Prisma `where` filter
 * @param {Object} [options] - Query options
 * @param {string} [options.sortBy] - Sorting criteria using the format: sortField:(desc|asc). Multiple sorting criteria should be separated by commas (,)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<{results: Object[], page: number, limit: number, totalPages: number, totalResults: number}>}
 */
const paginate = async (model, filter, options) => {
  let orderBy;
  if (options.sortBy) {
    orderBy = options.sortBy.split(',').map((sortOption) => {
      const [key, order] = sortOption.split(':');
      return { [key]: order === 'desc' ? 'desc' : 'asc' };
    });
  } else {
    orderBy = [{ createdAt: 'asc' }];
  }

  const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 10;
  const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
  const skip = (page - 1) * limit;

  const [totalResults, results] = await Promise.all([
    model.count({ where: filter }),
    model.findMany({ where: filter, orderBy, skip, take: limit }),
  ]);

  const totalPages = Math.ceil(totalResults / limit);
  return { results, page, limit, totalPages, totalResults };
};

module.exports = paginate;
