/**
 * Client for the external quote service.
 * Any service that returns { id, quote, author } works here.
 */

const SOURCE_NAME = 'dummyjson';

class ExternalApiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'ExternalApiError';
    this.status = status;
    this.expose = true; // safe to show the message to the client
  }
}

/** Turns the raw API payload into the shape the repository expects. */
function normalizeQuote(data) {
  const content = typeof data?.quote === 'string' ? data.quote.trim() : '';
  const author = typeof data?.author === 'string' ? data.author.trim() : '';

  if (!content || !author) {
    throw new ExternalApiError('Quote service returned an unexpected payload');
  }

  return {
    externalId: data.id != null ? String(data.id) : null,
    content,
    author,
    sourceApi: SOURCE_NAME,
  };
}

/**
 * Fetches one random quote from the external API.
 * Throws ExternalApiError for network errors, timeouts, bad status codes and bad payloads.
 */
async function fetchRandomQuote({
  url,
  timeoutMs = 5000,
  fetchImpl = globalThis.fetch,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    const reason = err.name === 'AbortError' ? `timed out after ${timeoutMs} ms` : err.message;
    throw new ExternalApiError(`Quote service is unreachable (${reason})`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ExternalApiError(`Quote service responded with HTTP ${response.status}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new ExternalApiError('Quote service returned invalid JSON');
  }

  return normalizeQuote(data);
}

module.exports = { fetchRandomQuote, normalizeQuote, ExternalApiError };
