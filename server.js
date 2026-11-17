require('dotenv').config();

const path = require('path');
const { openDatabase } = require('./src/db');
const { createQuoteRepository } = require('./src/quoteRepository');
const { fetchRandomQuote } = require('./src/quoteApi');
const { createApp } = require('./src/app');

const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'quotes.db');
const QUOTE_API_URL = process.env.QUOTE_API_URL || 'https://dummyjson.com/quotes/random';
const QUOTE_API_TIMEOUT_MS = Number(process.env.QUOTE_API_TIMEOUT_MS) || 5000;

function start() {
  const db = openDatabase(DB_PATH);
  const quoteRepository = createQuoteRepository(db);

  const app = createApp({
    quoteRepository,
    publicDir: path.join(__dirname, 'public'),
    fetchRandomQuote: () =>
      fetchRandomQuote({ url: QUOTE_API_URL, timeoutMs: QUOTE_API_TIMEOUT_MS }),
  });

  const server = app.listen(PORT, () => {
    console.log(`Quote Generator running at http://localhost:${PORT}`);
    console.log(`Quote history stored in ${DB_PATH}`);
  });

  const shutdown = () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
