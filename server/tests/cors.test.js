const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { getApp } = require('./helper');

describe('CORS preflight', () => {
  it('allows Capacitor WebView cache headers for the shopper app', async () => {
    const app = getApp();
    const res = await supertest(app)
      .options('/api/auth/login')
      .set('Origin', 'https://localhost')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,cache-control,pragma')
      .expect(204);

    assert.equal(res.headers['access-control-allow-origin'], 'https://localhost');
    assert.match(res.headers['access-control-allow-headers'], /Cache-Control/i);
    assert.match(res.headers['access-control-allow-headers'], /Pragma/i);
  });
});
