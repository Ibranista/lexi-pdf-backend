const paginate = require('../../../src/utils/paginate');

describe('paginate util', () => {
  const makeModel = (results, totalResults) => ({
    count: jest.fn().mockResolvedValue(totalResults),
    findMany: jest.fn().mockResolvedValue(results),
  });

  test('should apply default limit and page', async () => {
    const model = makeModel([], 0);
    const result = await paginate(model, {}, {});

    expect(model.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10, orderBy: [{ createdAt: 'asc' }] })
    );
    expect(result).toEqual({ results: [], page: 1, limit: 10, totalPages: 0, totalResults: 0 });
  });

  test('should compute skip from page and limit', async () => {
    const model = makeModel([], 25);
    const result = await paginate(model, {}, { page: 2, limit: 5 });

    expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 5, take: 5 }));
    expect(result).toMatchObject({ page: 2, limit: 5, totalPages: 5, totalResults: 25 });
  });

  test('should parse a single sortBy criterion', async () => {
    const model = makeModel([], 0);
    await paginate(model, {}, { sortBy: 'name:desc' });

    expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ name: 'desc' }] }));
  });

  test('should parse multiple comma-separated sortBy criteria', async () => {
    const model = makeModel([], 0);
    await paginate(model, {}, { sortBy: 'role:desc,name:asc' });

    expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ role: 'desc' }, { name: 'asc' }] }));
  });

  test('should pass the filter through as the where clause', async () => {
    const model = makeModel([], 0);
    const filter = { role: 'admin' };
    await paginate(model, filter, {});

    expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: filter }));
    expect(model.count).toHaveBeenCalledWith({ where: filter });
  });
});
