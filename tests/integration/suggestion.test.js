const request = require('supertest');
const httpStatus = require('http-status');
const app = require('../../src/app');

const gutendexBook = (id, title, author) => ({
  id,
  title,
  authors: [{ name: author }],
  formats: {
    'text/html': `http://www.gutenberg.org/ebooks/${id}.html.images`,
    'image/jpeg': `http://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`,
    'application/zip': `https://www.gutenberg.org/files/${id}/${id}.zip`,
  },
});

const mockGutendex = (results) => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ results }) }));
};

describe('GET /v1/book-suggestions', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('should map Gutendex results onto the shape the client renders', async () => {
    mockGutendex([gutendexBook(1342, 'Pride and Prejudice', 'Austen, Jane')]);

    const res = await request(app)
      .get('/v1/book-suggestions')
      .query({ limit: 1, interests: 'novels', collection: '📖 Reading Later' })
      .expect(httpStatus.OK);

    expect(res.body.suggestions).toHaveLength(1);
    expect(res.body.suggestions[0]).toEqual({
      id: 'gutenberg-1342',
      title: 'Pride and Prejudice',
      // display-ready, not "Austen, Jane"
      author: 'Jane Austen',
      coverUrl: 'https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg',
      readUrl: 'https://www.gutenberg.org/ebooks/1342.html.images',
      collection: '📖 Reading Later',
      kind: 'Novel',
    });
    expect(res.get('Cache-Control')).toContain('max-age=3600');
  });

  test('should not flip an epithet into a given name', async () => {
    mockGutendex([gutendexBook(2680, 'Meditations', 'Marcus Aurelius, Emperor of Rome')]);

    const res = await request(app).get('/v1/book-suggestions').query({ limit: 1, interests: 'philosophy' });

    expect(res.body.suggestions[0].author).toBe('Marcus Aurelius');
  });

  test('should never send a readUrl carrying a lexiCover parameter', async () => {
    const book = gutendexBook(1342, 'Pride and Prejudice', 'Austen, Jane');
    book.formats['text/html'] = 'https://www.gutenberg.org/ebooks/1342.html?lexiCover=abc&x=1';
    mockGutendex([book]);

    const res = await request(app).get('/v1/book-suggestions').query({ limit: 1, interests: 'fiction' });

    expect(res.body.suggestions[0].readUrl).not.toContain('lexiCover');
    expect(res.body.suggestions[0].readUrl).toContain('x=1');
  });

  test('should omit coverUrl entirely when there is no cover', async () => {
    const book = gutendexBook(1342, 'Pride and Prejudice', 'Austen, Jane');
    delete book.formats['image/jpeg'];
    mockGutendex([book]);

    const res = await request(app).get('/v1/book-suggestions').query({ limit: 1, interests: 'history' });

    expect(res.body.suggestions[0]).not.toHaveProperty('coverUrl');
  });

  test('should return 200 with an empty array when the upstream is down', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('gutendex unreachable');
    });

    const res = await request(app)
      .get('/v1/book-suggestions')
      .query({ limit: 3, interests: 'essays' })
      .expect(httpStatus.OK);

    expect(res.body).toEqual({ suggestions: [] });
  });

  test('should reject an unknown interest id', async () => {
    await request(app).get('/v1/book-suggestions').query({ interests: 'astrology' }).expect(httpStatus.BAD_REQUEST);
  });

  test('should need no authentication', async () => {
    mockGutendex([gutendexBook(1342, 'Pride and Prejudice', 'Austen, Jane')]);
    await request(app).get('/v1/book-suggestions').query({ limit: 1, interests: 'biographies' }).expect(httpStatus.OK);
  });
});
