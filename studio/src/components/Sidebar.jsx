import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { statusClass, fmtMs, methodClass, timeAgo, downloadJSON, durationClass } from '../utils';

const METHODS = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export function Sidebar({ selectedId, onSelect, wsConnected, liveRequests, isRecording = true, onToggleRecording }) {
  const [requests, setRequests]   = useState([]);
  const [search, setSearch]       = useState('');
  const [method, setMethod]       = useState('ALL');
  const [filter, setFilter]       = useState('all'); // all | errors | slow | security
  const [stats, setStats]         = useState({ total_requests: 0, error_requests: 0, slow_requests: 0, audit_high: 0 });
  const [loading, setLoading]     = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const newIds = useRef(new Set());
  const searchInputRef = useRef(null);

  // Initial load
  const fetchRequests = useCallback(async () => {
    try {
      const params = {};
      if (method !== 'ALL') params.method = method;
      if (search) params.search = search;
      if (filter === 'errors') params.has_error = true;
      if (filter === 'slow') params.is_slow = true;
      const data = await api.listRequests({ ...params, limit: 300 });
      setRequests(data);
    } catch { /* backend offline */ }
    finally { setLoading(false); }
  }, [method, search, filter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Refresh stats
  useEffect(() => {
    const refresh = async () => {
      try {
        const s = await api.stats();
        setStats(s);
      } catch { /* ignore */ }
    };
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);

  // Global hotkey: press '/' to focus search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Prepend live WebSocket events
  useEffect(() => {
    if (!liveRequests?.length) return;
    const latest = liveRequests[liveRequests.length - 1];
    if (!latest) return;
    newIds.current.add(latest.id);
    setRequests(prev => {
      const existingIdx = prev.findIndex(r => r.id === latest.id);
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = { ...copy[existingIdx], ...latest };
        return copy;
      }
      return [latest, ...prev];
    });
    setTimeout(() => newIds.current.delete(latest.id), 1200);
  }, [liveRequests]);

  const handleClear = async () => {
    try {
      await api.clearRequests();
      setRequests([]);
      setShowClearConfirm(false);
    } catch { /* ignore */ }
  };

  const handleExportJSON = () => {
    const filename = `traceforge-traffic-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    downloadJSON(filename, requests);
  };

  const displayed = requests.filter(r => {
    if (method !== 'ALL' && r.method?.toUpperCase() !== method) return false;
    if (search) {
      const q = search.toLowerCase();
      const inUrl = (r.url || '').toLowerCase().includes(q);
      const inPath = (r.path || '').toLowerCase().includes(q);
      const inDomain = (r.domain || '').toLowerCase().includes(q);
      if (!inUrl && !inPath && !inDomain) return false;
    }
    if (filter === 'errors' && !r.has_error && (r.status_code < 400)) return false;
    if (filter === 'slow' && !r.is_slow && (r.duration_ms < 500)) return false;
    if (filter === 'security' && !(r.audit_high > 0 || r.audit_medium > 0 || (r.audit_grade && ['C','D','F'].includes(r.audit_grade)))) return false;
    return true;
  });

  return (
    <aside className="sidebar">
      {/* Stats bar */}
      <div className="stats-bar">
        <button
          type="button"
          className={`stat-pill ${filter === 'all' ? 'active-pill' : ''}`}
          onClick={() => setFilter('all')}
          title="Show all requests"
        >
          <span className="stat-val">{stats.total_requests || 0}</span>
          <span className="stat-label">Total</span>
        </button>
        <button
          type="button"
          className={`stat-pill errors ${filter === 'errors' ? 'active-pill' : ''}`}
          onClick={() => setFilter(filter === 'errors' ? 'all' : 'errors')}
          title="Filter error responses (4xx, 5xx)"
        >
          <span className="stat-val">{stats.error_requests || 0}</span>
          <span className="stat-label">Errors</span>
        </button>
        <button
          type="button"
          className={`stat-pill slow ${filter === 'slow' ? 'active-pill' : ''}`}
          onClick={() => setFilter(filter === 'slow' ? 'all' : 'slow')}
          title="Filter slow requests (>500ms)"
        >
          <span className="stat-val">{stats.slow_requests || 0}</span>
          <span className="stat-label">Slow</span>
        </button>
        <button
          type="button"
          className={`stat-pill security ${filter === 'security' ? 'active-pill' : ''}`}
          onClick={() => setFilter(filter === 'security' ? 'all' : 'security')}
          title="Filter requests with High/Medium Security Risk"
        >
          <span className="stat-val text-danger">{stats.audit_high || 0}</span>
          <span className="stat-label">Risks</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="sidebar-toolbar">
        {/* Search Input */}
        <div className="sidebar-search-wrap">
          <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            id="sidebar-search"
            className="input sidebar-search-input"
            placeholder="Search path, domain, URL... (/)"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearch('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Method Filters */}
        <div className="sidebar-method-chips">
          {METHODS.map(m => (
            <button
              key={m}
              className={`method-chip ${m.toLowerCase()} ${method === m ? 'active' : ''}`}
              onClick={() => setMethod(m)}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Category Filter & Actions */}
        <div className="sidebar-action-row">
          <div className="filter-pill-group">
            {[
              { id: 'all', label: 'All' },
              { id: 'errors', label: 'Errors' },
              { id: 'slow', label: 'Slow' },
              { id: 'security', label: '🛡️ Risks' }
            ].map(f => (
              <button
                key={f.id}
                className={`filter-btn-pill ${filter === f.id ? 'active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="sidebar-btn-group">
            {onToggleRecording && (
              <button
                className={`btn btn-xs ${isRecording ? 'btn-ghost' : 'btn-warning-subtle'}`}
                onClick={onToggleRecording}
                title={isRecording ? 'Pause network capturing while analyzing (P)' : 'Resume network capturing (P)'}
              >
                {isRecording ? '⏸ Pause' : '▶ Resume'}
              </button>
            )}
            <button
              className="btn btn-xs btn-ghost"
              onClick={handleExportJSON}
              title="Export captured requests as JSON"
              disabled={displayed.length === 0}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button
              className="btn btn-xs btn-danger-subtle"
              onClick={() => setShowClearConfirm(true)}
              title="Clear captured requests"
              disabled={requests.length === 0}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* List count summary */}
      <div className="sidebar-count-bar">
        <span>{loading ? 'Scanning stream...' : `${displayed.length} of ${requests.length} request${requests.length !== 1 ? 's' : ''}`}</span>
        {isRecording ? (
          wsConnected && (
            <span className="live-stream-badge">
              <span className="live-radar-dot" /> LIVE
            </span>
          )
        ) : (
          <span
            className="paused-stream-badge"
            onClick={onToggleRecording}
            style={{ cursor: 'pointer' }}
            title="Capturing is paused. Click to resume."
          >
            <span className="paused-radar-dot" /> PAUSED
          </span>
        )}
      </div>

      {/* Paused alert banner when analyzing */}
      {!isRecording && (
        <div className="sidebar-paused-strip animate-fade">
          <div className="paused-strip-left">
            <span className="paused-strip-dot" />
            <span className="paused-strip-label">Traffic capture paused</span>
          </div>
          {onToggleRecording && (
            <button
              type="button"
              className="btn btn-xs btn-primary-subtle paused-strip-btn"
              onClick={onToggleRecording}
              title="Resume capturing traffic (P)"
            >
              Resume (P)
            </button>
          )}
        </div>
      )}

      {/* Request list */}
      <div className="request-list">
        {displayed.length === 0 && !loading && (
          <div className="sidebar-empty-state">
            <div className="empty-radar-anim">
              <div className="radar-circle circle-1" />
              <div className="radar-circle circle-2" />
              <div className="radar-sweep" />
              <span className="radar-center-icon">📡</span>
            </div>
            <div className="sidebar-empty-title">
              {wsConnected ? 'Listening for HTTP Traffic' : 'Proxy Gateway Offline'}
            </div>
            <div className="sidebar-empty-sub">
              {wsConnected
                ? 'Send requests through the browser extension or proxy port 7890 to capture and audit live traffic.'
                : 'Start the TraceForge backend server to begin monitoring network requests.'}
            </div>
          </div>
        )}

        {displayed.map(r => (
          <RequestRow
            key={r.id}
            req={r}
            selected={r.id === selectedId}
            isNew={newIds.current.has(r.id)}
            onClick={() => onSelect(r.id)}
          />
        ))}
      </div>

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="modal-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Clear Captured History</span>
              <button className="btn btn-xs btn-icon" onClick={() => setShowClearConfirm(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Are you sure you want to clear all {requests.length} captured HTTP requests and security audit logs? This action cannot be undone.
            </div>
            <div className="modal-footer">
              <button className="btn btn-sm" onClick={() => setShowClearConfirm(false)}>Cancel</button>
              <button className="btn btn-sm btn-danger" onClick={handleClear}>Clear All</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function RequestRow({ req, selected, isNew, onClick }) {
  const grade = req.audit_grade;
  const gradeClass = grade ? `grade-pill-${grade.toLowerCase()}` : '';
  const hasRisk = req.audit_high > 0 || req.audit_medium > 0;
  const status = req.status_code;
  const duration = req.duration_ms;

  return (
    <div
      id={`req-row-${req.id}`}
      className={`request-row ${selected ? 'selected' : ''} ${req.has_error ? 'has-error' : ''} ${hasRisk ? 'has-risk' : ''} ${isNew ? 'new-flash' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick()}
    >
      <div className="row-left-badge">
        <span className={`badge badge-method ${methodClass(req.method)}`}>
          {req.method || 'GET'}
        </span>
      </div>

      <div className="row-main">
        <div className="row-path" title={req.path || '/'}>
          {req.path || '/'}
        </div>
        <div className="row-domain-row">
          <span className="row-domain" title={req.domain}>{req.domain || 'localhost'}</span>
          {req.was_redacted && (
            <span className="row-security-flag" title="PII / Secrets redacted by Sentinel">🛡️</span>
          )}
        </div>
      </div>

      <div className="row-meta">
        <div className="row-meta-top">
          {grade && (
            <span className={`badge badge-grade-pill ${gradeClass}`} title={`Security Grade ${grade}`}>
              {grade}
            </span>
          )}
          {status ? (
            <span className={`badge ${statusClass(status)}`} title={`HTTP ${status}`}>
              {status}
            </span>
          ) : (
            <span className="badge badge-pending">...</span>
          )}
        </div>

        <div className="row-meta-bottom">
          <span className={`row-duration ${durationClass(duration)}`}>
            {fmtMs(duration)}
          </span>
          <span className="row-time" title={req.timestamp}>
            {timeAgo(req.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}

