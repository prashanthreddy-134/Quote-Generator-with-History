const fs = require('fs');
const path = require('path');
// Built into Node 22.13+ and Node 24+. No native compilation needed.
const { DatabaseSync } = require('node:sqlite');

/**
 * Opens (and creates if needed) the SQLite database and ensures the schema exists.
 * Pass ':memory:' to get a throwaway database, which the tests use.
 */
function openDatabase(filePath) {
  if (filePath !== ':memory:') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS quote_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT,
      content     TEXT    NOT NULL,
      author      TEXT    NOT NULL,
      source_api  TEXT    NOT NULL,
      fetched_at  TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_quote_history_fetched_at
      ON quote_history (fetched_at DESC, id DESC);
  `);

  return db;
}

module.exports = { openDatabase };
