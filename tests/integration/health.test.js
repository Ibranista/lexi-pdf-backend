const request = require('supertest');
const httpStatus = require('http-status');
const app = require('../../src/app');

describe('Health route', () => {
  test('should report that the API process is alive', async () => {
    const response = await request(app).get('/health').expect(httpStatus.OK);

    expect(response.body).toEqual({ status: 'ok' });
  });
});
