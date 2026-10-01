import { useState, useEffect } from 'react';
import { api } from '../api';
import { CopyBtn } from './CopyBtn';

const SEVERITIES = ['ALL', 'HIGH', 'MEDIUM', 'LOW'];
const CATEGORIES = ['ALL', 'AUTH', 'INJECTION', 'CORS', 'LEAK', 'DOS', 'TRANSPORT', 'INFO'];

export function AuditTab({ requestId }) {
  const [audit, setAudit]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [rerunning, setRerunning] = useState(false);
  const [sevFilter, setSevFilter] = useState('ALL');
  const [catFilter, setCatFilter] = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});

  const fetchAudit = async () => {
    if (!requestId) return;
    setLoading(true);
    try {
      const data = await api.getRequestAudit(requestId);
      setAudit(data);
    } catch (e) {
      console.error('Audit fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, [requestId]);

  const handleRerun = async () => {
    setRerunning(true);
    try {
      const res = await api.rerunAudit(requestId);
      setAudit(res);
    } catch (e) {
      console.error('Rerun audit error:', e);
    } finally {
      setRerunning(false);
    }
  };

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="audit-loading-state">
        <div className="cyber-scanner-loader">
          <div className="scanner-line" />
        </div>
        <span>Analyzing security posture with Sentinel AST Engine...</span>
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="detail-section">
        <div className="empty-panel-text">Failed to load security audit details.</div>
      </div>
    );
  }

  const findings = audit.findings || [];
  const filtered = findings.filter(f => {
    if (sevFilter !== 'ALL' && f.severity !== sevFilter) return false;
    if (catFilter !== 'ALL' && f.category !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const match = (f.title || '').toLowerCase().includes(q) ||
                    (f.rule_id || '').toLowerCase().includes(q) ||
                    (f.description || '').toLowerCase().includes(q) ||
                    (f.evidence || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const grade = audit.grade || 'A';
  const gradeClass = `grade-${grade.toLowerCase()}`;

  return (
    <div className="audit-tab-content animate-fade">
      {/* Grade & Score Summary Banner */}
      <div className={`audit-summary-banner ${gradeClass}`}>
        <div className="audit-grade-box">
          <div className="grade-badge-circle">
            <span className="grade-letter">{grade}</span>
          </div>
          <div className="grade-meta">
            <div className="grade-title">Security Posture Grade {grade}</div>
            <div className="grade-sub">
              {grade === 'A' ? 'Minimal Risk Exposure — Clean Request' :
               grade === 'B' ? 'Minor Security Deficiencies Detected' :
               grade === 'C' ? 'Moderate Risk & Policy Deviations' :
               grade === 'D' ? 'Significant Vulnerabilities Present' :
               'Critical Risk / Immediate Exploit Hazard'}
            </div>
          </div>
        </div>

        <div className="audit-stats-row">
          <div className="audit-stat-item">
            <span className="stat-count text-danger">{audit.high || 0}</span>
            <span className="stat-name">High</span>
          </div>
          <div className="audit-stat-item">
            <span className="stat-count text-warning">{audit.medium || 0}</span>
            <span className="stat-name">Medium</span>
          </div>
          <div className="audit-stat-item">
            <span className="stat-count text-primary">{audit.low || 0}</span>
            <span className="stat-name">Low</span>
          </div>
          <div className="audit-stat-item">
            <span className="stat-count">{audit.total || findings.length}</span>
            <span className="stat-name">Total Findings</span>
          </div>
        </div>

        <button
          className="btn btn-secondary btn-rerun-audit"
          onClick={handleRerun}
          disabled={rerunning}
          title="Re-run all Sentinel cybersecurity rules on this request"
        >
          {rerunning ? (
            <>
              <div className="spinner" />
              <span>Scanning...</span>
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
              <span>Re-scan</span>
            </>
          )}
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="audit-filter-toolbar">
        <div className="audit-search-wrap">
          <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="input input-sm audit-search-input"
            placeholder="Search findings by rule, keyword, or evidence payload..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear-btn" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <div className="audit-filters-group">
          <div className="pill-group">
            <span className="pill-group-label">Severity:</span>
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

          <div className="pill-group">
            <span className="pill-group-label">Category:</span>
            {CATEGORIES.map(c => (
              <button
                key={c}
                className={`filter-btn filter-btn-xs ${catFilter === c ? 'active' : ''}`}
                onClick={() => setCatFilter(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Findings List */}
      <div className="audit-findings-list">
        {filtered.length === 0 ? (
          <div className="audit-clean-state">
            <div className="clean-shield-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <div className="clean-state-title">
              {findings.length === 0 ? 'Zero Security Vulnerabilities Detected' : 'No findings match active filter criteria'}
            </div>
            <div className="clean-state-desc">
              {findings.length === 0
                ? 'This HTTP transaction complies with Sentinel AST security heuristics, authentication guards, and payload safety policies.'
                : 'Try adjusting or clearing your search / category filter selection above.'}
            </div>
          </div>
        ) : (
          filtered.map(finding => {
            const isExp = expanded[finding.id] !== false; // default expanded
            const isHigh = finding.severity === 'HIGH';
            const isMed  = finding.severity === 'MEDIUM';

            return (
              <div
                key={finding.id}
                className={`finding-card ${isHigh ? 'card-high' : isMed ? 'card-med' : 'card-low'}`}
              >
                <div className="finding-header" onClick={() => toggleExpand(finding.id)}>
                  <div className="finding-meta-left">
                    <span className={`finding-sev-badge ${isHigh ? 'badge-high' : isMed ? 'badge-med' : 'badge-low'}`}>
                      {finding.severity}
                    </span>
                    <span className="finding-cat-badge">{finding.category}</span>
                    <span className="finding-rule-id">[{finding.rule_id}]</span>
                    <span className="finding-title-text">{finding.title}</span>
                  </div>
                  <div className="finding-meta-right">
                    <span className="expand-toggle-icon">{isExp ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isExp && (
                  <div className="finding-body-content animate-fade">
                    <div className="finding-desc">{finding.description}</div>

                    {finding.evidence && (
                      <div className="finding-evidence-block">
                        <div className="evidence-header">
                          <span>Detected Payload Evidence</span>
                          <CopyBtn text={finding.evidence} label="Copy Evidence" className="btn-xs" />
                        </div>
                        <pre className="evidence-code">
                          <code>{finding.evidence}</code>
                        </pre>
                      </div>
                    )}

                    {finding.remediation && (
                      <div className="finding-remediation-box">
                        <div className="remediation-title">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                          </svg>
                          <span>Remediation Guidance</span>
                        </div>
                        <div className="remediation-body">{finding.remediation}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

