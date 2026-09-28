// Price-drop alert rule (bonus deliverable): fire when a successful scrape
// comes in at least `thresholdPct` below the previous successful price.
// Comparing consecutive successes means a sustained low price alerts once
// instead of on every run. Returns the alert payload or null.
export function detectDrop(prevPrice, newPrice, thresholdPct = 5) {
  if (prevPrice == null || newPrice == null) return null;
  if (!(prevPrice > 0) || !(newPrice >= 0)) return null;
  if (newPrice >= prevPrice) return null;
  const dropPct = ((prevPrice - newPrice) / prevPrice) * 100;
  if (dropPct < thresholdPct) return null;
  return { oldPrice: prevPrice, newPrice, dropPct: Math.round(dropPct * 100) / 100 };
}
