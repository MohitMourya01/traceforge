import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { CopyBtn } from './CopyBtn';
import { methodClass, statusClass, fmtMs } from '../utils';

const SEVERITIES = ['ALL', 'HIGH', 'MEDIUM', 'LOW'];
const CATEGORIES = ['ALL', 'AUTH', 'INJECTION', 'CORS', 'LEAK', 'DOS', 'TRANSPORT', 'INFO'];

export function SecurityPage({ onSelectRequest }) {
  const [stats, setStats]           = useState(null);
  const [findings, setFindings]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [sevFilter, setSevFilter]   = useState('ALL');
  const [catFilter, setCatFilter]   = useState('ALL');
  const [search, setSearch]         = useState('');
  const [selectedFinding, setSelectedFinding] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryData, findingsData] = await Promise.all([
        api.globalAuditStats(),
        api.listFindings({ limit: 150 })
      ]);
      setStats(summaryData);
      setFindings(findingsData);
    } catch (e) {
      console.error('Failed to fetch security stats:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filteredFindings = findings.filter(f => {
    if (sevFilter !== 'ALL' && f.severity !== sevFilter) return false;
    if (catFilter !== 'ALL' && f.category !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const match = (f.title || '').toLowerCase().includes(q) ||
                    (f.rule_id || '').toLowerCase().includes(q) ||
                    (f.category || '').toLowerCase().includes(q) ||
                    (f.description || '').toLowerCase().includes(q) ||
                    (f.evidence || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const grade = stats?.posture_grade || 'A';
  const gradeClass = `grade-${grade.toLowerCase()}`;

  const categoryCounts = stats?.category_counts || {};
  const maxCatCount = Math.max(1, ...Object.values(categoryCounts));

  return (
    <div className="security-page">
      {/* Header */}
      <div className="security-page-header">
        <div className="security-header-left">
          <div className="security-shield-badge">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div>
            <div className="security-header-title">Sentinel Cyber Security Posture</div>
            <div className="security-header-sub">
              Continuous AST & Network heuristic auditing for OWASP Top 10, Injection, Auth & Token Leaks
            </div>
          </div>
        </div>

        <div className="security-header-actions">
          <button className="btn btn-secondary" onClick={fetchData} disabled={loading}>
            {loading ? <div className="spinner" /> : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
            )}
            Refresh Metrics
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="security-kpi-grid">
        {/* Posture Grade Card */}
        <div className={`kpi-card kpi-grade-card ${gradeClass}`}>
          <div className="kpi-card-header">
            <span className="kpi-card-title">Security Posture</span>
            <span className="live-radar-dot" />
          </div>
          <div className="kpi-grade-display">
            <div className="kpi-grade-circle">
              <span className="kpi-grade-letter">{grade}</span>
            </div>
            <div className="kpi-grade-details">
              <div className="kpi-grade-label">
                {grade === 'A' ? 'Secure / Low Risk' :
                 grade === 'B' ? 'Minor Vulnerabilities' :
                 grade === 'C' ? 'Moderate Risk' :
                 grade === 'D' ? 'High Risk Exposure' :
                 'Critical Alert Level'}
              </div>
              <div className="kpi-score-badge">
                Risk Score: <strong>{stats?.total_score ?? 0}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Total Scanned */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Requests Scanned</span>
            <span className="kpi-card-icon">⚡</span>
          </div>
          <div className="kpi-card-num">{stats?.scanned_requests ?? 0}</div>
          <div className="kpi-card-sub">
            {stats?.affected_requests ?? 0} endpoints flagged with findings
          </div>
        </div>

        {/* High Severity */}
        <div className="kpi-card kpi-card-high">
          <div className="kpi-card-header">
            <span className="kpi-card-title">High Risk</span>
            <span className="kpi-risk-pulse high-pulse" />
          </div>
          <div className="kpi-card-num text-danger">{stats?.high ?? 0}</div>
          <div className="kpi-card-sub">Immediate exploit or leak hazards</div>
        </div>

        {/* Medium Severity */}
        <div className="kpi-card kpi-card-med">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Medium Warnings</span>
            <span className="kpi-risk-pulse med-pulse" />
          </div>
          <div className="kpi-card-num text-warning">{stats?.medium ?? 0}</div>
          <div className="kpi-card-sub">CORS misconfigs & weak transport</div>
        </div>

        {/* Low Severity */}
        <div className="kpi-card kpi-card-low">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Low / Info Notices</span>
            <span className="kpi-risk-pulse low-pulse" />
          </div>
          <div className="kpi-card-num text-primary">{stats?.low ?? 0}</div>
          <div className="kpi-card-sub">Header hardening & best practices</div>
        </div>
      </div>

      {/* Main Grid: Categories on Left, Live Feed on Right */}
      <div className="security-main-grid">
        {/* Category Attack Surface */}
        <div className="security-sidebar-card">
          <div className="sec-card-header">
            <span className="sec-card-title">Vulnerability Categories</span>
            <span className="sec-card-badge">{Object.keys(categoryCounts).length} Types</span>
          </div>

          <div className="category-bars-list">
            {Object.keys(categoryCounts).length === 0 ? (
              <div className="sec-empty-small">No category data yet</div>
            ) : (
              Object.entries(categoryCounts).map(([cat, count]) => {
                const pct = Math.round((count / maxCatCount) * 100);
                const isSelected = catFilter === cat;
                return (
                  <div
                    key={cat}
                    className={`cat-bar-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => setCatFilter(isSelected ? 'ALL' : cat)}
                  >
                    <div className="cat-bar-labels">
                      <span className="cat-bar-name">{cat}</span>
                      <span className="cat-bar-count">{count}</span>
                    </div>
                    <div className="cat-bar-track">
                      <div className="cat-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="sentinel-rule-pack-info">
            <div className="rule-pack-title">Sentinel Rule Engine</div>
            <p className="rule-pack-text">
              Real-time pattern inspection for SQLi, XSS, Path Traversal, JWT Weaknesses, Secret Leaks, CORS wildcarding, and Missing Headers.
            </p>
          </div>
        </div>

        {/* Live Findings Feed */}
        <div className="security-feed-card">
          <div className="sec-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="sec-card-title">Real-time Findings Feed</span>
              <span className="sec-card-badge">{filteredFindings.length} items</span>
            </div>

            <div className="sec-filter-pills">
              {SEVERITIES.map(s => (
                <button
                  key={s}
                  className={`filter-btn filter-btn-xs ${sevFilter === s ? 'active' : ''}`}
                  onClick={() => setSevFilter(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Search bar */}
          <div className="sec-feed-search-bar">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="input input-sm sec-feed-input"
              placeholder="Search findings feed by rule, title, or evidence..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {catFilter !== 'ALL' && (
              <span className="cat-active-pill" onClick={() => setCatFilter('ALL')}>
                Category: {catFilter} ✕
              </span>
            )}
          </div>

          {/* Findings Feed List */}
          <div className="sec-feed-list">
            {filteredFindings.length === 0 ? (
              <div className="sec-feed-empty">
                <div className="sec-feed-empty-icon">🛡️</div>
                <div className="sec-feed-empty-title">
                  {findings.length === 0 ? 'No Cyber Security Findings' : 'No findings match current filters'}
                </div>
                <div className="sec-feed-empty-sub">
                  Sentinel monitors incoming and outgoing network traffic automatically.
                </div>
              </div>
            ) : (
              filteredFindings.map(f => {
                const isHigh = f.severity === 'HIGH';
                const isMed  = f.severity === 'MEDIUM';

                return (
                  <div key={f.id} className={`sec-feed-item ${isHigh ? 'feed-high' : isMed ? 'feed-med' : 'feed-low'}`}>
                    <div className="feed-item-top">
                      <div className="feed-item-badges">
                        <span className={`finding-sev-badge ${isHigh ? 'badge-high' : isMed ? 'badge-med' : 'badge-low'}`}>
                          {f.severity}
                        </span>
                        <span className="finding-cat-badge">{f.category}</span>
                        <span className="finding-rule-id">[{f.rule_id}]</span>
                        <span className="feed-item-title">{f.title}</span>
                      </div>

                      {f.captured_request_id && (
                        <button
                          className="btn btn-xs btn-primary feed-inspect-btn"
                          onClick={() => onSelectRequest && onSelectRequest(f.captured_request_id)}
                          title="Jump to captured request in Inspector"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          Inspect Request #{f.captured_request_id}
                        </button>
                      )}
                    </div>

                    <div className="feed-item-desc">{f.description}</div>

                    {f.evidence && (
                      <div className="feed-item-evidence">
                        <div className="evidence-header">
                          <span>Payload Evidence</span>
                          <CopyBtn text={f.evidence} />
                        </div>
                        <pre className="evidence-code">{f.evidence}</pre>
                      </div>
                    )}

                    {f.remediation && (
                      <div className="feed-item-remediation">
                        <strong>Remediation: </strong>
                        <span>{f.remediation}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
