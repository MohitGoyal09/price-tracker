import React, { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function api(path, opts) {
  const r = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}

export default function App() {
  const [q, setQ] = useState('yoga');
  const [results, setResults] = useState([]);
  const [tracked, setTracked] = useState([]);
  const [detail, setDetail] = useState({});
  const [msg, setMsg] = useState('');

  const refresh = async () => {
    try { setTracked(await api('/api/tracked')); } catch (e) { setMsg(e.message); }
  };
  useEffect(() => { refresh(); }, []);

  const search = async () => {
    try { const d = await api('/api/search?q=' + encodeURIComponent(q)); setResults(d.results); setMsg(`${d.results.length} found`); }
    catch (e) { setMsg(e.message); }
  };

  const track = async (id, optionId) => {
    try { await api('/api/track', { method: 'POST', body: JSON.stringify({ store_product_id: String(id), selected_option_id: optionId }) }); setMsg(`tracking ${id}/${optionId} (first scrape running)`); refresh(); }
    catch (e) { setMsg(e.message); }
  };

  const loadHistory = async (t) => {
    try { setDetail({ ...detail, [t.id]: await api('/api/history/' + t.id) }); }
    catch (e) { setMsg(e.message); }
  };

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <h1>Product Price Tracker</h1>
      <p>{msg}</p>
      <div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search mock store…" style={{ width: 300 }} />
        <button onClick={search}>Search</button>
        <button onClick={refresh}>Refresh tracked</button>
        <button onClick={() => api('/api/scrape-now', { method: 'POST' }).then(refresh)}>Scrape now</button>
        <a href={API + '/api/export.csv'}><button>Export CSV</button></a>
      </div>
      <h2>Search results</h2>
      {results.map((r) => (
        <SearchRow key={r.id} item={r} onTrack={track} />
      ))}
      <h2>Tracked ({tracked.length})</h2>
      {tracked.map((t) => (
        <div key={t.id} style={{ border: '1px solid #ccc', margin: 8, padding: 8 }}>
          <b>{t.product_name}</b> · {t.selected_option_label} · <a href={t.product_url} target="_blank" rel="noreferrer">store page #{t.store_product_id}</a>
          <button onClick={() => loadHistory(t)}>History + log</button>
          <History rows={detail[t.id] || []} />
        </div>
      ))}
    </div>
  );
}

function SearchRow({ item, onTrack }) {
  const [full, setFull] = useState(null);
  useEffect(() => { fetch((import.meta.env.VITE_API_URL || 'http://localhost:4000') + '/api/products/' + item.id).then((r) => r.json()).then(setFull).catch(() => {}); }, [item.id]);
  return (
    <div style={{ border: '1px solid #eee', margin: 8, padding: 8 }}>
      <b>{item.name}</b> · {item.brand} · SKU {item.sku}
      <div>{(full?.options || []).map((o) => (
        <button key={o.id} onClick={() => onTrack(item.id, o.id)}>Track {o.label} ({o.id})</button>
      ))}</div>
    </div>
  );
}

function History({ rows }) {
  if (!rows.length) return <p>No scrapes yet.</p>;
  const ok = rows.filter((r) => r.outcome !== 'failed' && r.price != null);
  return (
    <div>
      <table border="1" cellPadding="4">
        <thead><tr><th>time (UTC)</th><th>price</th><th>stock</th><th>outcome</th><th>msg</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td>{new Date(r.scraped_at).toISOString()}</td><td>{r.price ?? ''}</td><td>{r.stock ?? ''}</td><td>{r.outcome}</td><td>{r.message}</td></tr>
        ))}</tbody>
      </table>
      <p>Price trend: {ok.map((r) => `${new Date(r.scraped_at).toISOString().slice(5, 16)} ₹${r.price}`).join(' → ')}</p>
    </div>
  );
}
