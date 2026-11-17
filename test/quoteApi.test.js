const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fetchRandomQuote, normalizeQuote, ExternalApiError } = require('../src/quoteApi');

function fakeResponse({ ok = true, status = 200, body, jsonThrows = false }) {
  return {
    ok,
    status,
    json: async () => {
      if (jsonThrows) throw new SyntaxError('bad json');
      return body;
    },
  };
}

test('normalizeQuote maps the external payload to the internal shape', () => {
  const result = normalizeQuote({ id: 12, quote: '  Keep going.  ', author: ' Someone ' });
  assert.deepEqual(result, {
    externalId: '12',
    content: 'Keep going.',
    author: 'Someone',
    sourceApi: 'dummyjson',
  });
});

test('normalizeQuote rejects payloads missing quote or author', () => {
  assert.throws(() => normalizeQuote({ id: 1, author: 'A' }), ExternalApiError);
  assert.throws(() => normalizeQuote({ id: 1, quote: 'Q', author: '   ' }), ExternalApiError);
  assert.throws(() => normalizeQuote(null), ExternalApiError);
});

test('fetchRandomQuote returns a normalized quote on success', async () => {
  const fetchImpl = async (url, opts) => {
    assert.equal(url, 'https://example.test/q');
    assert.ok(opts.signal, 'request should carry an abort signal');
    return fakeResponse({ body: { id: 3, quote: 'Hello', author: 'World' } });
  };
  const q = await fetchRandomQuote({ url: 'https://example.test/q', fetchImpl });
  assert.equal(q.content, 'Hello');
  assert.equal(q.externalId, '3');
});

test('fetchRandomQuote wraps network failures', async () => {
  const fetchImpl = async () => {
    throw new TypeError('fetch failed');
  };
  await assert.rejects(
    fetchRandomQuote({ url: 'https://example.test', fetchImpl }),
    (err) => err instanceof ExternalApiError && /unreachable/.test(err.message) && err.status === 502,
  );
});

test('fetchRandomQuote reports timeouts', async () => {
  const fetchImpl = (url, { signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      });
    });
  await assert.rejects(
    fetchRandomQuote({ url: 'https://example.test', timeoutMs: 20, fetchImpl }),
    (err) => /timed out/.test(err.message),
  );
});

test('fetchRandomQuote reports non-2xx responses and invalid JSON', async () => {
  await assert.rejects(
    fetchRandomQuote({
      url: 'https://example.test',
      fetchImpl: async () => fakeResponse({ ok: false, status: 503 }),
    }),
    /HTTP 503/,
  );
  await assert.rejects(
    fetchRandomQuote({
      url: 'https://example.test',
      fetchImpl: async () => fakeResponse({ jsonThrows: true }),
    }),
    /invalid JSON/,
  );
});
