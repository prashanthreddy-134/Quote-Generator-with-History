(() => {
  const PAGE_SIZE = 10;

  const els = {
    slip: document.querySelector('.slip'),
    quoteText: document.getElementById('quote-text'),
    quoteAuthor: document.getElementById('quote-author'),
    newButton: document.getElementById('new-quote'),
    status: document.getElementById('status'),
    error: document.getElementById('error'),
    historyList: document.getElementById('history-list'),
    historyEmpty: document.getElementById('history-empty'),
    historyCount: document.getElementById('history-count'),
    clearButton: document.getElementById('clear-history'),
    loadMore: document.getElementById('load-more'),
  };

  // How many history rows the server has told us about (the offset for the next page).
  let loadedCount = 0;
  let totalCount = 0;
  let busy = false;

  /** Calls the local API and throws a readable Error on failure. */
  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { Accept: 'application/json' },
      ...options,
    });

    if (response.status === 204) return null;

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Request failed with status ${response.status}`);
    }
    return body;
  }

  function showError(message) {
    els.error.textContent = message;
    els.error.hidden = false;
  }

  function clearError() {
    els.error.textContent = '';
    els.error.hidden = true;
  }

  function setBusy(isBusy) {
    busy = isBusy;
    els.newButton.disabled = isBusy;
    els.status.textContent = isBusy ? 'Fetching a quote…' : '';
  }

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  /** Puts a quote on the slip. `fresh` replays the short entrance animation. */
  function showQuote(quote, fresh = false) {
    els.quoteText.textContent = quote.content;
    els.quoteAuthor.textContent = quote.author;
    if (fresh) {
      els.slip.classList.remove('is-fresh');
      // Force a reflow so the animation restarts on repeated fetches.
      void els.slip.offsetWidth;
      els.slip.classList.add('is-fresh');
    }
  }

  function updateHistoryMeta() {
    const hasItems = totalCount > 0;
    els.historyEmpty.hidden = hasItems;
    els.clearButton.hidden = !hasItems;
    els.historyCount.textContent = hasItems
      ? `${totalCount} ${totalCount === 1 ? 'quote' : 'quotes'} saved`
      : '';
    els.loadMore.hidden = loadedCount >= totalCount;
  }

  function renderEntry(item) {
    const li = document.createElement('li');
    li.className = 'ledger-item';
    li.dataset.id = item.id;

    const text = document.createElement('p');
    text.className = 'ledger-text';
    text.textContent = `“${item.content}”`;

    const meta = document.createElement('p');
    meta.className = 'ledger-meta';
    meta.textContent = `${item.author} · ${formatDate(item.fetchedAt)}`;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn-text danger';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove quote by ${item.author}`);
    remove.addEventListener('click', () => deleteEntry(item.id, li));

    li.append(text, meta, remove);
    return li;
  }

  /** Adds a page of history rows to the ledger and updates the counters. */
  function appendPage(data) {
    totalCount = data.total;
    data.items.forEach((item) => els.historyList.append(renderEntry(item)));
    loadedCount += data.items.length;
    updateHistoryMeta();
  }

  /** Reloads the history from the first page. */
  async function reloadHistory() {
    const data = await api(`/api/quotes/history?limit=${PAGE_SIZE}&offset=0`);
    els.historyList.replaceChildren();
    loadedCount = 0;
    appendPage(data);
    return data;
  }

  async function loadMore() {
    try {
      clearError();
      const data = await api(`/api/quotes/history?limit=${PAGE_SIZE}&offset=${loadedCount}`);
      appendPage(data);
    } catch (err) {
      showError(err.message);
    }
  }

  async function fetchNewQuote() {
    if (busy) return;
    setBusy(true);
    clearError();
    try {
      const quote = await api('/api/quotes/random');
      showQuote(quote, true);
      await reloadHistory();
    } catch (err) {
      showError(`Could not get a quote. ${err.message}. Try again in a moment.`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(id, row) {
    try {
      clearError();
      await api(`/api/quotes/history/${id}`, { method: 'DELETE' });
      row.remove();
      loadedCount -= 1;
      totalCount -= 1;
      updateHistoryMeta();
    } catch (err) {
      showError(`Could not remove that quote. ${err.message}`);
    }
  }

  async function clearHistory() {
    if (!window.confirm('Delete every saved quote? This cannot be undone.')) return;
    try {
      clearError();
      await api('/api/quotes/history', { method: 'DELETE' });
      els.historyList.replaceChildren();
      loadedCount = 0;
      totalCount = 0;
      updateHistoryMeta();
    } catch (err) {
      showError(`Could not clear history. ${err.message}`);
    }
  }

  async function init() {
    try {
      const data = await reloadHistory();
      if (data.items.length > 0) {
        showQuote(data.items[0]);
      }
    } catch (err) {
      showError(`Could not load your history. ${err.message}`);
    }
  }

  els.newButton.addEventListener('click', fetchNewQuote);
  els.loadMore.addEventListener('click', loadMore);
  els.clearButton.addEventListener('click', clearHistory);

  document.addEventListener('keydown', (event) => {
    const typing = event.target.closest?.('input, textarea, [contenteditable]');
    if (!typing && event.key.toLowerCase() === 'n' && !event.metaKey && !event.ctrlKey) {
      fetchNewQuote();
    }
  });

  init();
})();
