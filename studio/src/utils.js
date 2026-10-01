/** Format status code to CSS badge class */
export function statusClass(code) {
  if (!code) return 'badge-muted';
  if (code < 300) return 'badge-2xx';
  if (code < 400) return 'badge-3xx';
  if (code < 500) return 'badge-4xx';
  return 'badge-5xx';
}

/** Status code standard text fallback */
export function getStatusText(code) {
  const map = {
    200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
    301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
    409: 'Conflict', 422: 'Unprocessable Entity', 429: 'Too Many Requests',
    500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout'
  };
  return map[code] || '';
}

/** Duration class based on latency */
export function durationClass(ms) {
  if (ms == null) return '';
  if (ms < 150) return 'duration-fast';
  if (ms < 600) return 'duration-normal';
  if (ms < 1500) return 'duration-slow';
  return 'duration-critical';
}

/** Format milliseconds nicely */
export function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Format bytes */
export function fmtBytes(b) {
  if (b == null || b === 0) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

/** Relative time ago */
export function timeAgo(isoString) {
  if (!isoString) return '—';
  const diff = Math.max(0, Date.now() - new Date(isoString).getTime());
  if (diff < 3000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Try to pretty-print JSON; return original string if not JSON */
export function prettyJSON(str) {
  if (!str) return '';
  try {
    const parsed = typeof str === 'string' ? JSON.parse(str) : str;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(str);
  }
}

/** Parse JSON safely, return null on failure */
export function safeJSON(str) {
  try { return JSON.parse(str); }
  catch { return null; }
}

/** Method badge CSS sub-class */
export function methodClass(method) {
  return (method || 'get').toLowerCase();
}

/** Copy text to clipboard */
export async function copyToClipboard(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  }
}

/** Download object or string as a JSON file */
export function downloadJSON(filename, data) {
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

