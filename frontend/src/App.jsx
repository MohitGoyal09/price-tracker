import React, { useEffect, useState } from 'react';
import { Search, RefreshCw, Zap, Download, ExternalLink, Trash2, Activity, ChevronDown, TrendingUp, TrendingDown, Bell } from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './components/ui/card';
import { Badge, OutcomeBadge } from './components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { Skeleton } from './components/ui/skeleton';
import { cn } from './lib/utils';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const inr = (n) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN'));
const tstr = (iso) => new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + 'Z';

async function api(path, opts) {
  const r = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}

export default function App() {
  const [q, setQ] = useState('yoga');
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [tracked, setTracked] = useState([]);
  const [hist, setHist] = useState({});
  const [open, setOpen] = useState({});
  const [msg, setMsg] = useState('Connected to the mock store.');
  const [busy, setBusy] = useState({ search: false, scrape: false, initial: true });
  const [feedFilter, setFeedFilter] = useState('all');
  const [alerts, setAlerts] = useState([]);

  const refresh = async () => {
    try {
      const t = await api('/api/tracked');
      setTracked(t);
      const hs = await Promise.all(t.map((x) => api('/api/history/' + x.id).catch(() => [])));
      const m = {};
      t.forEach((x, i) => { m[x.id] = hs[i]; });
      setHist(m);
      setAlerts(await api('/api/alerts').catch(() => []));
    } catch (e) { setMsg('Error: ' + e.message); }
    setBusy((b) => ({ ...b, initial: false }));
  };
  useEffect(() => { refresh(); }, []);

  const search = async () => {
    setBusy((b) => ({ ...b, search: true }));
    try {
      const d = await api('/api/search?q=' + encodeURIComponent(q));
      setResults(d.results); setSearched(true);
      setMsg(`${d.results.length} match${d.results.length === 1 ? '' : 'es'} for “${q}”.`);
    } catch (e) { setMsg('Error: ' + e.message); }
    setBusy((b) => ({ ...b, search: false }));
  };

  const track = async (id, optionId) => {
    try {
      await api('/api/track', { method: 'POST', body: JSON.stringify({ store_product_id: String(id), selected_option_id: optionId }) });
      setMsg(`Tracking ${id}/${optionId} — first scrape running in the background.`);
      refresh();
    } catch (e) { setMsg('Error: ' + e.message); }
  };

  const untrack = async (t) => {
    try { await api('/api/tracked/' + t.id, { method: 'DELETE' }); setMsg(`Stopped tracking ${t.product_name}.`); refresh(); }
    catch (e) { setMsg('Error: ' + e.message); }
  };

  const scrapeNow = async () => {
    setBusy((b) => ({ ...b, scrape: true }));
    setMsg('Scraping live prices — a few seconds per product…');
    try { const r = await api('/api/scrape-now', { method: 'POST' }); setMsg(`Scrape done: ${r.results.map((x) => `${x.product} → ${x.outcome}`).join(' · ')}`); }
    catch (e) { setMsg('Error: ' + e.message); }
    setBusy((b) => ({ ...b, scrape: false }));
    refresh();
  };

  const all = Object.values(hist).flat();
  const okCount = all.filter((r) => r.outcome === 'success').length;
  const retryCount = all.filter((r) => r.outcome === 'retried').length;
  const failCount = all.filter((r) => r.outcome === 'failed').length;

  // Global activity feed: every attempt across products, newest first.
  const byId = Object.fromEntries(tracked.map((t) => [t.id, t]));
  const feed = all
    .map((r) => ({ ...r, product: byId[r.tracked_product_id] }))
    .sort((a, b) => new Date(b.scraped_at) - new Date(a.scraped_at));
  const shownFeed = (feedFilter === 'all' ? feed : feed.filter((r) => r.outcome === feedFilter)).slice(0, 100);

  // Biggest movers: % change latest vs previous successful scrape. Using the
  // last two points (not first→last) so ancient history can't distort the board.
  const movers = tracked
    .map((t) => {
      const ok = (hist[t.id] || []).filter((r) => r.outcome !== 'failed' && r.price != null);
      if (ok.length < 2 || !ok[ok.length - 2].price) return null;
      const prev = ok[ok.length - 2].price;
      const pct = ((ok[ok.length - 1].price - prev) / prev) * 100;
      return { t, pct, last: ok[ok.length - 1] };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Activity className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pulse</h1>
            <p className="text-sm text-muted-foreground">Product price tracker · INE mock store · scrapes every 2h</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={refresh}><RefreshCw />Refresh</Button>
          <Button size="sm" disabled={busy.scrape} onClick={scrapeNow}><Zap />{busy.scrape ? 'Scraping…' : 'Scrape now'}</Button>
          <a href={API + '/api/export.csv'}><Button variant="outline" size="sm"><Download />Export CSV</Button></a>
        </div>
      </header>

      <p className="mt-3 font-mono text-xs text-muted-foreground">{msg}</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tracked products" value={tracked.length} />
        <Stat label="Scrape attempts" value={all.length} />
        <Stat label="Succeeded" value={okCount + retryCount} />
        <Stat label="Failed (logged)" value={failCount} alert={failCount > 0} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Find a product</CardTitle>
          <CardDescription>Partial or full name — searched live against the mock store.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="e.g. yoga mat, headlamp…" />
            <Button disabled={busy.search} onClick={search}><Search />{busy.search ? 'Searching…' : 'Search'}</Button>
          </div>
          {searched && (
            <div className="mt-3 space-y-2">
              {results.length === 0 && <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No matches — try a shorter fragment.</p>}
              {results.map((r) => <SearchRow key={r.id} item={r} onTrack={track} />)}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="tracked" className="mt-6">
        <TabsList>
          <TabsTrigger value="tracked">Tracked ({tracked.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity ({all.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="tracked" className="space-y-4">
          {busy.initial && [0, 1, 2].map((i) => <Skeleton key={i} className="h-44 w-full" />)}
          {!busy.initial && tracked.length === 0 && (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nothing tracked yet — search above and pick an option to start the 2-hour price watch.
            </p>
          )}
          {tracked.map((t) => (
            <TrackedCard key={t.id} t={t} rows={hist[t.id] || []}
              isOpen={!!open[t.id]} onToggle={() => setOpen((o) => ({ ...o, [t.id]: !o[t.id] }))} onUntrack={() => untrack(t)} />
          ))}
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab movers={movers} feed={shownFeed} total={feed.length} filter={feedFilter} onFilter={setFeedFilter} alerts={alerts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ActivityTab({ movers, feed, total, filter, onFilter, alerts }) {
  const filters = ['all', 'success', 'retried', 'failed'];
  return (
    <div className="space-y-4">
      <Card className={alerts.length ? 'border-amber-300' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Bell />Price-drop alerts {alerts.length > 0 && <Badge variant="warning">{alerts.length}</Badge>}</CardTitle>
          <CardDescription>Fires when a scrape lands ≥5% below the previous success.</CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 && <p className="text-sm text-muted-foreground">No drops detected yet — alerts appear here automatically.</p>}
          <div className="space-y-2">
            {alerts.slice(0, 5).map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <div>
                  <p className="text-sm font-semibold">{a.product_name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{a.selected_option} · {tstr(a.created_at)}</p>
                </div>
                <p className="font-mono text-sm">{inr(a.old_price)} → <strong>{inr(a.new_price)}</strong> <Badge variant="success">−{Number(a.drop_pct).toFixed(1)}%</Badge></p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Biggest movers</CardTitle>
          <CardDescription>% change vs previous successful scrape.</CardDescription>
        </CardHeader>
        <CardContent>
          {movers.length === 0 && <p className="text-sm text-muted-foreground">Need at least two successful scrapes per product.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {movers.map(({ t, pct, last }) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{t.product_name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{t.selected_option_label} · {inr(last.price)}</p>
                </div>
                <Badge variant={pct > 0 ? 'destructive' : pct < 0 ? 'success' : 'secondary'} className="shrink-0">
                  {pct > 0 ? <TrendingUp /> : <TrendingDown />}{pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Scrape activity</CardTitle>
            <CardDescription>Every attempt across all products, newest first (showing {feed.length} of {total}).</CardDescription>
          </div>
          <div className="flex gap-1.5">
            {filters.map((f) => (
              <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => onFilter(f)}>
                {f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {feed.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attempts match this filter.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Time (UTC)</TableHead><TableHead>Product</TableHead><TableHead>Price</TableHead><TableHead>Stock</TableHead><TableHead>Outcome</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {feed.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{tstr(r.scraped_at)}</TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{r.product?.product_name || '—'}</p>
                        <p className="font-mono text-xs text-muted-foreground">{r.selected_option}</p>
                      </TableCell>
                      <TableCell className="font-mono">{r.price == null ? '—' : inr(r.price)}</TableCell>
                      <TableCell className="font-mono">{r.stock == null ? '—' : r.stock}</TableCell>
                      <TableCell><OutcomeBadge outcome={r.outcome} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, alert }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn('mt-1 font-mono text-2xl font-semibold', alert && 'text-red-600')}>{value}</p>
      </CardContent>
    </Card>
  );
}

function SearchRow({ item, onTrack }) {
  const [full, setFull] = useState(null);
  useEffect(() => {
    fetch(API + '/api/products/' + item.id).then((r) => r.json()).then(setFull).catch(() => {});
  }, [item.id]);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
      <div>
        <p className="text-sm font-semibold">{item.name}</p>
        <p className="font-mono text-xs text-muted-foreground">{item.brand} · SKU {item.sku} · #{item.id}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(full?.options || []).map((o) => (
          <Button key={o.id} variant="outline" size="sm" onClick={() => onTrack(item.id, o.id)}>Track {o.label}</Button>
        ))}
      </div>
    </div>
  );
}

function TrackedCard({ t, rows, isOpen, onToggle, onUntrack }) {
  const ok = rows.filter((r) => r.outcome !== 'failed' && r.price != null);
  const latest = rows[rows.length - 1];
  const first = ok[0], last = ok[ok.length - 1];
  const delta = first && last && ok.length > 1 ? last.price - first.price : 0;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>{t.product_name}</CardTitle>
          <CardDescription className="mt-1 font-mono text-xs">
            {t.selected_option_label} · #{t.store_product_id} · {t.sku}
          </CardDescription>
        </div>
        {latest && <OutcomeBadge outcome={latest.outcome} />}
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-3xl font-semibold tracking-tight">{last ? inr(last.price) : '—'}</span>
          {first && last && (
            <Badge variant={delta > 0 ? 'destructive' : delta < 0 ? 'success' : 'secondary'}>
              {delta === 0 ? '± ₹0 since first scrape' : `${delta > 0 ? '+' : '−'}₹${Math.abs(delta).toLocaleString('en-IN')} since first scrape`}
            </Badge>
          )}
          {!last && <span className="text-sm text-muted-foreground">First scrape pending…</span>}
        </div>
        {last && (
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {last.stock === 0 ? 'Sold out' : `${last.stock} in stock`} · updated {tstr(last.scraped_at)}
          </p>
        )}
        {ok.length > 1 && <div className="mt-3"><Sparkline data={ok.map((r) => r.price)} /></div>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onToggle}>
            Scrape log ({rows.length})<ChevronDown className={cn('transition-transform', isOpen && 'rotate-180')} />
          </Button>
          <a href={t.product_url} target="_blank" rel="noreferrer">
            <Button variant="ghost" size="sm"><ExternalLink />Store page</Button>
          </a>
          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-600" onClick={onUntrack}><Trash2 />Stop tracking</Button>
        </div>
        {isOpen && (
          rows.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No attempts logged yet.</p> : (
            <div className="mt-3 rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Time (UTC)</TableHead><TableHead>Price</TableHead><TableHead>Stock</TableHead><TableHead>Outcome</TableHead><TableHead>Detail</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {[...rows].reverse().map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{tstr(r.scraped_at)}</TableCell>
                      <TableCell className="font-mono">{r.price == null ? '—' : inr(r.price)}</TableCell>
                      <TableCell className="font-mono">{r.stock == null ? '—' : r.stock}</TableCell>
                      <TableCell><OutcomeBadge outcome={r.outcome} /></TableCell>
                      <TableCell className="max-w-64 truncate text-xs text-muted-foreground">{r.message} (try {r.attempt})</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}

function Sparkline({ data }) {
  const w = 600, h = 56, p = 4;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => `${(p + (i * (w - 2 * p)) / Math.max(data.length - 1, 1)).toFixed(1)},${(h - p - ((v - min) / span) * (h - 2 * p)).toFixed(1)}`).join(' ');
  const up = data[data.length - 1] >= data[0];
  const color = up ? '#059669' : '#dc2626';
  const lastPt = pts.split(' ').pop().split(',');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-14 w-full" role="img" aria-label="price trend">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastPt[0]} cy={lastPt[1]} r="4" fill={color} />
    </svg>
  );
}
