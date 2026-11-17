/**
 * Data access for the quote history. All SQL lives here so the
 * HTTP layer never touches the database directly.
 */
function createQuoteRepository(db) {
  const insertStmt = db.prepare(`
    INSERT INTO quote_history (external_id, content, author, source_api, fetched_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const selectByIdStmt = db.prepare(`
    SELECT id, external_id AS externalId, content, author,
           source_api AS sourceApi, fetched_at AS fetchedAt
    FROM quote_history
    WHERE id = ?
  `);

  const countStmt = db.prepare('SELECT COUNT(*) AS total FROM quote_history');

  const listStmt = db.prepare(`
    SELECT id, external_id AS externalId, content, author,
           source_api AS sourceApi, fetched_at AS fetchedAt
    FROM quote_history
    ORDER BY fetched_at DESC, id DESC
    LIMIT ? OFFSET ?
  `);

  const deleteStmt = db.prepare('DELETE FROM quote_history WHERE id = ?');
  const clearStmt = db.prepare('DELETE FROM quote_history');

  return {
    /** Saves a quote and returns the stored row, including its new id. */
    save({ externalId, content, author, sourceApi }) {
      const fetchedAt = new Date().toISOString();
      const info = insertStmt.run(externalId ?? null, content, author, sourceApi, fetchedAt);
      return selectByIdStmt.get(Number(info.lastInsertRowid));
    },

    /** Returns one page of history (newest first) plus the total count. */
    list({ limit, offset }) {
      return {
        items: listStmt.all(limit, offset),
        total: countStmt.get().total,
      };
    },

    /** Returns true if a row was deleted. */
    remove(id) {
      return deleteStmt.run(id).changes > 0;
    },

    /** Deletes all history and returns the number of rows removed. */
    clear() {
      return clearStmt.run().changes;
    },
  };
}

module.exports = { createQuoteRepository };
