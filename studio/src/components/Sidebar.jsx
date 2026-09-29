import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { statusClass, fmtMs, methodClass } from '../utils';

const METHODS = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export function Sidebar({ selectedId, onSelect, wsConnected, liveRequests }) {
  const [requests, setRequests]   = useState([]);
  const [search, setSearch]       = useState('');
  const [method, setMethod]       = useState('ALL');
  const [filter, setFilter]       = useState('all'); // all | errors | slow | security
  const [stats, setStats]         = useState({ total_requests: 0, error_requests: 0, slow_requests: 0, audit_high: 0 });
  const [loading, setLoading]     = useState(true);
  const newIds = useRef(new Set());

  // Initial load
  const fetchRequests = useCallback(async () => {
    try {
      const params = {};
      if (method !== 'ALL') params.method = method;
      if (search) params.search = search;
      if (filter === 'errors') params.has_error = true;
      if (filter === 'slow') params.is_slow = true;
      const data = await api.listRequests({ ...params, limit: 200 });
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
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
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
    setTimeout(() => newIds.current.delete(latest.id), 800);
  }, [liveRequests]);

  const handleClear = async () => {
    try {
      await api.clearRequests();
      setRequests([]);
    } catch { /* ignore */ }
  };

  const displayed = requests.filter(r => {
    if (method !== 'ALL' && r.method !== method) return false;
    if (search && !r.url?.toLowerCase().includes(search.toLowerCase()) && !r.domain?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'errors' && !r.has_error) return false;
    if (filter === 'slow' && !r.is_slow) return false;
    if (filter === 'security' && !(r.audit_high > 0 || r.audit_medium > 0 || (r.audit_grade && ['C','D','F'].includes(r.audit_grade)))) return false;
    return true;
  });

  return (
    <aside className="sidebar">
      {/* Stats bar */}
      <div className="stats-bar">
        <div className="stat-pill" onClick={() => setFilter('all')} style={{ cursor: 'pointer' }}>
          <span className="stat-val">{stats.total_requests || 0}</span>
          <span className="stat-label">Total</span>
        </div>
        <div className="stat-pill errors" onClick={() => setFilter('errors')} style={{ cursor: 'pointer' }}>
          <span className="stat-val">{stats.error_requests || 0}</span>
          <span className="stat-label">Errors</span>
        </div>
        <div className="stat-pill slow" onClick={() => setFilter('slow')} style={{ cursor: 'pointer' }}>
          <span className="stat-val">{stats.slow_requests || 0}</span>
          <span className="stat-label">Slow</span>
        </div>
        <div className="stat-pill security" onClick={() => setFilter('security')} style={{ cursor: 'pointer' }}>
          <span className="stat-val text-danger">{stats.audit_high || 0}</span>
          <span className="stat-label">High Risk</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="sidebar-toolbar">
        <div className="sidebar-search-wrap">
          <input
            id="sidebar-search"
            className="input"
            placeholder="Search URL, endpoint, domain..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="sidebar-filters">
          {METHODS.map(m => (
            <button
              key={m}
              className={`filter-btn ${method === m ? 'active' : ''}`}
              onClick={() => setMethod(m)}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="sidebar-filters" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'errors', label: 'Errors' },
              { id: 'slow', label: 'Slow' },
              { id: 'security', label: '🛡️ Risk' }
            ].map(f => (
              <button
                key={f.id}
                className={`filter-btn ${filter === f.id ? 'active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button className="btn btn-sm btn-danger" onClick={handleClear} title="Clear captured history">
            🗑 Clear
          </button>
        </div>
      </div>

      <div className="sidebar-count">
        {loading ? 'Scanning traffic...' : `${displayed.length} request${displayed.length !== 1 ? 's' : ''}`}
      </div>

      {/* List */}
      <div className="request-list">
        {displayed.length === 0 && !loading && (
          <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            {wsConnected ? 'Listening for real-time HTTP traffic...' : 'Backend offline'}
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
    </aside>
  );
}

function RequestRow({ req, selected, isNew, onClick }) {
  const grade = req.audit_grade;
  const gradeClass = grade ? `grade-pill-${grade.toLowerCase()}` : '';
  const hasRisk = req.audit_high > 0 || req.audit_medium > 0;

  return (
    <div
      id={`req-row-${req.id}`}
      className={`request-row${selected ? ' selected' : ''}${req.has_error ? ' has-error' : ''}${hasRisk ? ' has-risk' : ''}${isNew ? ' new-flash' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <span className={`badge badge-method ${methodClass(req.method)}`}>{req.method}</span>

      <div className="row-main">
        <div className="row-path">{req.path || '/'}</div>
        <div className="row-domain">{req.domain}</div>
      </div>

      <div className="row-meta">
        {grade && (
          <span className={`badge badge-grade-pill ${gradeClass}`} title={`Security Grade ${grade}`}>
            {grade}
          </span>
        )}
        {req.status_code && (
          <span className={`badge ${statusClass(req.status_code)}`}>{req.status_code}</span>
        )}
        <span className="row-duration">{fmtMs(req.duration_ms)}</span>
        {req.is_slow && <span className="badge badge-slow">slow</span>}
      </div>
    </div>
  );
}
