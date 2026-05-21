export function format(value) {
  return Math.round(value || 0).toLocaleString("en-US");
}

export function shortSessionName(sessionId) {
  const file = String(sessionId || "").split("/").at(-1) || String(sessionId || "");
  return file.replace(/^rollout-/, "").replace(/-[0-9a-f]{8,}.*$/i, "");
}

export function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function pct(value, total) {
  return total > 0 ? value / total * 100 : 0;
}
