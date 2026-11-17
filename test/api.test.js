const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { openDatabase } = require('../src/db');
const { createQuoteRepository } = require('../src/quoteRepository');
const { createApp } = require('../src/app');
const { ExternalApiError } = require('../src/quoteApi');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/** Starts the app on a random port with an in-memory database and a fake external API. */
async function startServer(fetchRandomQuote) {
  const db = openDatabase(':memory:');
  const app = createApp({
    quoteRepository: createQuoteRepository(db),
    fetchRandomQuote,
    publicDir: PUBLIC_DIR,
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    base,
    async stop() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      db.close();
    },
  };
}

/** Returns a fake external API function that yields the given quotes in order. */
function fakeQuotes(...quotes) {
  let i = 0;
  return async () => {
    const q = quotes[i % quotes.length];
    i += 1;
    return { externalId: String(q.id), content: q.content, author: q.author, sourceApi: 'test' };
  };
}

test('GET /api/quotes/random fetches, saves and returns the quote with 201', async () => {
  const srv = await startServer(fakeQuotes({ id: 7, content: 'Stay hungry.', author: 'Steve Jobs' }));
  try {
    const res = await fetch(`${srv.base}/api/quotes/random`);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.content, 'Stay hungry.');
    assert.equal(body.author, 'Steve Jobs');
    assert.equal(body.externalId, '7');
    assert.ok(body.id >= 1);
    assert.ok(!Number.isNaN(Date.parse(body.fetchedAt)));
  } finally {
    await srv.stop();
  }
});

test('history is returned newest first with total and pagination', async () => {
  const srv = await startServer(
    fakeQuotes(
      { id: 1, content: 'First', author: 'A' },
      { id: 2, content: 'Second', author: 'B' },
      { id: 3, content: 'Third', author: 'C' },
    ),
  );
  try {
    for (let i = 0; i < 3; i += 1) await fetch(`${srv.base}/api/quotes/random`);

    const all = await (await fetch(`${srv.base}/api/quotes/history`)).json();
    assert.equal(all.total, 3);
    assert.deepEqual(all.items.map((q) => q.content), ['Third', 'Second', 'First']);

    const page = await (await fetch(`${srv.base}/api/quotes/history?limit=2&offset=2`)).json();
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].content, 'First');
    assert.equal(page.total, 3);
  } finally {
    await srv.stop();
  }
});

test('invalid pagination parameters fall back to safe defaults', async () => {
  const srv = await startServer(fakeQuotes({ id: 1, content: 'x', author: 'y' }));
  try {
    const body = await (await fetch(`${srv.base}/api/quotes/history?limit=abc&offset=-5`)).json();
    assert.equal(body.limit, 10);
    assert.equal(body.offset, 0);
  } finally {
    await srv.stop();
  }
});

test('DELETE /api/quotes/history/:id removes one entry, then 404 on repeat', async () => {
  const srv = await startServer(fakeQuotes({ id: 1, content: 'Keep me', author: 'A' }));
  try {
    const saved = await (await fetch(`${srv.base}/api/quotes/random`)).json();

    const del = await fetch(`${srv.base}/api/quotes/history/${saved.id}`, { method: 'DELETE' });
    assert.equal(del.status, 204);

    const again = await fetch(`${srv.base}/api/quotes/history/${saved.id}`, { method: 'DELETE' });
    assert.equal(again.status, 404);

    const bad = await fetch(`${srv.base}/api/quotes/history/abc`, { method: 'DELETE' });
    assert.equal(bad.status, 400);
  } finally {
    await srv.stop();
  }
});

test('DELETE /api/quotes/history clears all entries', async () => {
  const srv = await startServer(fakeQuotes({ id: 1, content: 'x', author: 'y' }));
  try {
    await fetch(`${srv.base}/api/quotes/random`);
    await fetch(`${srv.base}/api/quotes/random`);

    const cleared = await (await fetch(`${srv.base}/api/quotes/history`, { method: 'DELETE' })).json();
    assert.equal(cleared.deleted, 2);

    const after = await (await fetch(`${srv.base}/api/quotes/history`)).json();
    assert.equal(after.total, 0);
  } finally {
    await srv.stop();
  }
});

test('external API failure returns 502 with a readable message and saves nothing', async () => {
  const failing = async () => {
    throw new ExternalApiError('Quote service is unreachable (connection refused)');
  };
  const srv = await startServer(failing);
  try {
    const res = await fetch(`${srv.base}/api/quotes/random`);
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.match(body.error, /unreachable/);

    const history = await (await fetch(`${srv.base}/api/quotes/history`)).json();
    assert.equal(history.total, 0);
  } finally {
    await srv.stop();
  }
});

test('unexpected errors return a generic 500 message without leaking details', async () => {
  const boom = async () => {
    throw new Error('secret internal detail');
  };
  const srv = await startServer(boom);
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await fetch(`${srv.base}/api/quotes/random`);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, 'Something went wrong on the server');
  } finally {
    console.error = originalError;
    await srv.stop();
  }
});

test('unknown API routes return JSON 404', async () => {
  const srv = await startServer(fakeQuotes({ id: 1, content: 'x', author: 'y' }));
  try {
    const res = await fetch(`${srv.base}/api/nope`);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'Endpoint not found');
  } finally {
    await srv.stop();
  }
});

test('the frontend is served from /', async () => {
  const srv = await startServer(fakeQuotes({ id: 1, content: 'x', author: 'y' }));
  try {
    const res = await fetch(`${srv.base}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Quote Generator/);
  } finally {
    await srv.stop();
  }
});
