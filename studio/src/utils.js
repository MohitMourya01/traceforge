/** Format status code to CSS badge class */
export function statusClass(code) {
  if (!code) return '';
  if (code < 300) return 'badge-2xx';
  if (code < 400) return 'badge-3xx';
  if (code < 500) return 'badge-4xx';
  return 'badge-5xx';
}

/** Format milliseconds nicely */
export function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Format bytes */
export function fmtBytes(b) {
  if (b == null) return '—';
  if (b < 1024) return `${b}B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1048576).toFixed(1)}MB`;
}

/** Relative time ago */
export function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 5000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return new Date(isoString).toLocaleTimeString();
}

/** Try to pretty-print JSON; return original string if not JSON */
export function prettyJSON(str) {
  if (!str) return '';
  try { return JSON.stringify(JSON.parse(str), null, 2); }
  catch { return str; }
}

/** Parse JSON safely, return null on failure */
export function safeJSON(str) {
  try { return JSON.parse(str); }
  catch { return null; }
}

/** Method badge CSS sub-class */
export function methodClass(method) {
  return (method || '').toLowerCase();
}

/** Copy text to clipboard */
export async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; }
}
