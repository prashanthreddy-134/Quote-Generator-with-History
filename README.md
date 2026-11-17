# Quote Generator with History

A full-stack app that fetches a random quote from an external API, shows it to the user, and saves every fetched quote to a SQLite database as history.

It covers the core skills of this task: calling a third-party API, handling its failures, persisting data, and building a REST API with a frontend that uses it.

## Features

- Fetch a random quote from an external API (`https://dummyjson.com/quotes/random` by default)
- Every fetched quote is saved to a SQLite database with its source, author, and timestamp
- Browse history newest first, with "Show more" pagination
- Remove a single entry, or clear the whole history
- Friendly error messages when the external API is down, slow, or returns bad data
- Keyboard shortcut: press `N` for a new quote
- Works on mobile and respects reduced-motion settings

## Tech stack

| Layer      | Technology                                   |
|------------|----------------------------------------------|
| Backend    | Node.js, Express 4                           |
| Database   | SQLite via Node's built-in `node:sqlite`    |
| Frontend   | Vanilla HTML, CSS, and JavaScript (no build) |
| External API | DummyJSON quotes (swappable via `.env`)   |
| Tests      | Node's built-in test runner (`node:test`)    |

## Project structure

```
quote-generator-with-history/
├── server.js              # Entry point: loads config, opens DB, starts HTTP server
├── src/
│   ├── app.js             # Express app: routes, validation, error handling
│   ├── db.js              # Opens SQLite and creates the schema
│   ├── quoteRepository.js # All SQL for the quote history
│   └── quoteApi.js        # External quote API client (timeouts, normalization)
├── public/
│   ├── index.html         # Single page UI
│   ├── style.css
│   └── app.js             # Client logic: fetch, render history, delete
├── test/
│   ├── api.test.js        # Endpoint tests against an in-memory database
│   └── quoteApi.test.js   # External API client tests (no network needed)
├── .env.example
├── package.json
└── README.md
```

## Setup

Requirements: **Node.js 22.13 or newer** (or Node 24+) and npm.

```bash
# 1. Go into the project folder
cd quote-generator-with-history

# 2. Install dependencies
npm install

# 3. (Optional) Create your own config
cp .env.example .env

# 4. Start the app
npm start
```

Open **http://localhost:3000** in your browser.

To run it in development with auto-restart on file changes:

```bash
npm run dev
```

### Running the tests

```bash
npm test
```

The tests use an in-memory database and a fake external API, so they run offline.

## Configuration

Set these in `.env` (all optional):

| Variable              | Default                                      | Purpose                              |
|-----------------------|----------------------------------------------|--------------------------------------|
| `PORT`                | `3000`                                       | HTTP port                            |
| `DB_PATH`             | `./data/quotes.db`                           | SQLite file location                 |
| `QUOTE_API_URL`       | `https://dummyjson.com/quotes/random`        | External quote endpoint              |
| `QUOTE_API_TIMEOUT_MS`| `5000`                                       | How long to wait for the external API|

To use a different quote provider, point `QUOTE_API_URL` at any endpoint that returns JSON with `id`, `quote`, and `author` fields. If the field names differ, update `normalizeQuote` in `src/quoteApi.js`.

## API reference

Base URL: `http://localhost:3000/api`

### `GET /quotes/random`

Fetches a new quote from the external API, saves it to history, and returns it.

- **201 Created**
  ```json
  {
    "id": 4,
    "externalId": "27",
    "content": "The only way to do great work is to love what you do.",
    "author": "Steve Jobs",
    "sourceApi": "dummyjson",
    "fetchedAt": "2026-11-17T10:42:13.120Z"
  }
  ```
- **502 Bad Gateway**: the external API is unreachable, timed out, or returned bad data.
  ```json
  { "error": "Quote service is unreachable (timed out after 5000 ms)" }
  ```

### `GET /quotes/history?limit=10&offset=0`

Returns saved quotes, newest first.

- `limit` (1–100, default 10)
- `offset` (default 0)

```json
{
  "items": [ { "id": 4, "content": "...", "author": "...", "...": "..." } ],
  "total": 12,
  "limit": 10,
  "offset": 0
}
```

### `DELETE /quotes/history/:id`

Deletes one saved quote. Returns `204 No Content`, `404` if the id does not exist, or `400` if the id is not a positive integer.

### `DELETE /quotes/history`

Deletes all saved quotes. Returns `{ "deleted": 12 }`.

### `GET /health`

Returns `{ "status": "ok" }`. Useful for uptime checks.

## Design notes

- **Layers are separate.** Routes do HTTP only, the repository owns SQL, and the API client owns the external service. Swapping the quote provider or the database touches one file each.
- **Dependencies are injected.** `createApp` takes the repository and the fetch function as arguments, which is why the tests can run against an in-memory database and a fake API.
- **External failures are contained.** Each request to the quote service has a timeout. Failures become `502` responses with a readable message and never save partial data. Unexpected errors return a generic `500` so internal details do not leak to the browser.
- **Input is validated.** Pagination values are clamped, ids must be positive integers, and request bodies are capped at 10 KB.
- **No user input is rendered as HTML.** The frontend builds elements with `textContent`, so quote text from the external API cannot inject markup.
- **Timestamps are ISO 8601 UTC** and formatted in the user's locale in the browser.

## Troubleshooting

- **"Could not get a quote … Quote service is unreachable"**: check your internet connection, or point `QUOTE_API_URL` at another provider.
- **"Cannot find module 'node:sqlite'"**: your Node.js is too old. Install Node 22.13+ or 24 LTS from nodejs.org.
- **Port already in use**: set a different `PORT` in `.env`.
