// Lightweight HTTP catalog access — no browser needed.
// Store is a Vite SPA: listings + item details are plain JSON.
const STORE = (process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com').replace(/\/$/, '');
const PER_PAGE = 60; // server caps limit at 60

async function fetchJson(url, timeoutMs = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`catalog ${r.status} for ${url}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function searchCatalog(query, maxPages = 16) {
  const q = (query || '').trim().toLowerCase();
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await fetchJson(`${STORE}/api/v2/listings?page=${page}&limit=${PER_PAGE}`);
    const results = data.results || [];
    for (const r of results) {
      if (!q || r.name?.toLowerCase().includes(q) || r.brand?.toLowerCase().includes(q) || r.sku?.toLowerCase().includes(q)) {
        out.push(r);
      }
    }
    if (page >= (data.totalPages || 1)) break;
    if (!q && out.length >= 60) break; // unfiltered: one page is enough for picker
  }
  return out.slice(0, 60);
}

export async function getItem(id) {
  return fetchJson(`${STORE}/api/v2/items/${encodeURIComponent(id)}`);
}

export async function getManifest() {
  try {
    return await fetchJson(`${STORE}/api/v2/ui/manifest`, 10000);
  } catch {
    return null;
  }
}
