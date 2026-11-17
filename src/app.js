const express = require('express');

/** Parses an integer query parameter, clamped to [min, max], with a fallback. */
function parseIntParam(value, fallback, min, max) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/**
 * Builds the Express app. Dependencies are passed in so tests can
 * swap the database and the external API.
 */
function createApp({ quoteRepository, fetchRandomQuote, publicDir }) {
  const app = express();

  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(publicDir));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Fetch a new quote from the external API and save it to history.
  app.get('/api/quotes/random', async (req, res, next) => {
    try {
      const quote = await fetchRandomQuote();
      const saved = quoteRepository.save(quote);
      res.status(201).json(saved);
    } catch (err) {
      next(err);
    }
  });

  // Paginated history, newest first.
  app.get('/api/quotes/history', (req, res) => {
    const limit = parseIntParam(req.query.limit, 10, 1, 100);
    const offset = parseIntParam(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const { items, total } = quoteRepository.list({ limit, offset });
    res.json({ items, total, limit, offset });
  });

  // Delete one history entry.
  app.delete('/api/quotes/history/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Quote id must be a positive integer' });
    }
    if (!quoteRepository.remove(id)) {
      return res.status(404).json({ error: 'No saved quote with that id' });
    }
    res.status(204).end();
  });

  // Delete the entire history.
  app.delete('/api/quotes/history', (req, res) => {
    const deleted = quoteRepository.clear();
    res.json({ deleted });
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  // Central error handler. Only errors flagged `expose` reach the client verbatim.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (!err.expose) {
      console.error(err);
    }
    const message = err.expose ? err.message : 'Something went wrong on the server';
    res.status(status).json({ error: message });
  });

  return app;
}

module.exports = { createApp, parseIntParam };
