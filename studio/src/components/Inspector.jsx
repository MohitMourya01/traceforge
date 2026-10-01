import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { CopyBtn } from './CopyBtn';
import { AuditTab } from './AuditTab';
import { statusClass, fmtMs, fmtBytes, prettyJSON, methodClass, downloadJSON } from '../utils';

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'M4 6h16M4 12h16M4 18h7' },
  { id: 'audit',    label: 'Sentinel Audit', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  { id: 'request',  label: 'Request', icon: 'M7 17L17 7M17 7H7M17 7V17' },
  { id: 'response', label: 'Response', icon: 'M17 7L7 17M7 17H17M7 17V7' },
  { id: 'codegen',  label: 'Code Export', icon: 'M16 18l6-6-6-6M8 6l-6 6 6 6' },
  { id: 'replay',   label: 'Replay Console', icon: 'M23 4v6h-6M1 20v-6h6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15' },
];

export function Inspector({ requestId, initialTab = 'overview', isRecording = true, onToggleRecording }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [req, setReq]             = useState(null);
  const [codegen, setCodegen]     = useState(null);
  const [loading, setLoading]     = useState(false);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, requestId]);

  const loadRequest = (id) => {
    if (!id) {
      setReq(null);
      setCodegen(null);
      setFetchError(null);
      return;
    }
    setLoading(true);
    setFetchError(null);

    api.getRequest(id)
      .then(data => {
        setReq(data);
        setFetchError(null);
      })
      .catch(err => {
        setFetchError(err.message || 'Failed to connect to backend proxy on port 7890');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadRequest(requestId);
  }, [requestId]);

  useEffect(() => {
    if (activeTab === 'codegen' && requestId && !codegen && req) {
      api.codegen(requestId)
        .then(setCodegen)
        .catch(err => setCodegen({ error: err.message }));
    }
  }, [activeTab, requestId, codegen, req]);

  if (!requestId) return <EmptyState />;

  if (loading && !req) {
    return (
      <div className="inspector inspector-loading">
        <div className="cyber-scanner-loader">
          <div className="scanner-line" />
        </div>
        <span className="font-mono text-cyan">Scanning traffic capture #{requestId}...</span>
      </div>
    );
  }

  if (fetchError && !req) {
    return (
      <div className="inspector inspector-empty">
        <div className="error-card-terminal">
          <div className="terminal-header">
            <span className="terminal-dot red" />
            <span className="terminal-dot yellow" />
            <span className="terminal-dot green" />
            <span className="terminal-title">GATEWAY CONNECTION ERROR</span>
          </div>
          <div className="terminal-body">
            <div className="terminal-error-text">⚠️ {fetchError}</div>
            <p className="terminal-sub">Ensure the TraceForge backend is running on <code>http://127.0.0.1:7890</code></p>
            <button className="btn btn-sm btn-primary" onClick={() => loadRequest(requestId)} style={{ marginTop: 12 }}>
              🔄 Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!req) return <EmptyState />;

  const reqHeaders  = req.request_headers  ? (typeof req.request_headers === 'string' ? JSON.parse(req.request_headers) : req.request_headers) : {};
  const respHeaders = req.response_headers ? (typeof req.response_headers === 'string' ? JSON.parse(req.response_headers) : req.response_headers) : {};
  const reqBody     = req.request_body  ? (typeof req.request_body === 'string' ? req.request_body : JSON.stringify(req.request_body)) : '';
  const respBody    = req.response_body ? (typeof req.response_body === 'string' ? req.response_body : JSON.stringify(req.response_body)) : '';

  const totalAuditFindings = (req.audit_high || 0) + (req.audit_medium || 0) + (req.audit_low || 0);
  const grade = req.audit_grade || 'A';
  const gradeClass = `grade-${grade.toLowerCase()}`;

  const handleExportSingle = () => {
    const filename = `traceforge-req-${req.id}-${req.method}-${(req.path || 'endpoint').replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    downloadJSON(filename, req);
  };

  return (
    <div className="inspector">
      {/* Inspector Header */}
      <div className="inspector-header">
        <div className="inspector-header-top">
          <div className="inspector-title-row">
            <span className={`badge badge-method ${methodClass(req.method)}`}>
              {req.method || 'GET'}
            </span>
            <div className="inspector-url-bar" title={req.url}>
              <span className="inspector-url-text font-mono">{req.url}</span>
              <CopyBtn text={req.url} iconOnly={true} title="Copy Full URL" className="btn-icon-subtle" />
            </div>
            {req.status_code && (
              <span className={`badge ${statusClass(req.status_code)}`} title={`HTTP Status ${req.status_code}`}>
                {req.status_code} {req.status_text || ''}
              </span>
            )}
            {grade && (
              <span
                className={`badge badge-grade ${gradeClass}`}
                onClick={() => setActiveTab('audit')}
                style={{ cursor: 'pointer' }}
                title={`Security Posture Grade: ${grade} (Click to inspect threats)`}
              >
                GRADE {grade}
              </span>
            )}
          </div>

          <div className="inspector-quick-actions">
            {onToggleRecording && (
              <button
                className={`btn btn-xs ${isRecording ? 'btn-ghost' : 'btn-warning-subtle'}`}
                onClick={onToggleRecording}
                title={isRecording ? 'Pause network traffic capture while analyzing this request (P)' : 'Resume network traffic capture (P)'}
              >
                <span>{isRecording ? '⏸ Pause Capture' : '▶ Resume Capture'}</span>
              </button>
            )}
            <button
              className="btn btn-xs btn-ghost"
              onClick={() => setActiveTab('replay')}
              title="Open in Replay Console"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Replay</span>
            </button>
            <button
              className="btn btn-xs btn-ghost"
              onClick={() => setActiveTab('codegen')}
              title="Generate Code Snippet"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              <span>cURL</span>
            </button>
            <button
              className="btn btn-xs btn-ghost"
              onClick={handleExportSingle}
              title="Download Request Details JSON"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="inspector-tabs">
          {TABS.map(t => {
            const isAudit = t.id === 'audit';
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                className={`inspector-tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                <svg className="tab-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={t.icon} />
                </svg>
                <span className="tab-label">{t.label}</span>
                {isAudit && totalAuditFindings > 0 && (
                  <span className={`tab-audit-badge ${req.audit_high > 0 ? 'badge-high' : req.audit_medium > 0 ? 'badge-med' : 'badge-low'}`}>
                    {totalAuditFindings}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Body */}
      <div className="inspector-body">
        {activeTab === 'overview' && <OverviewTab req={req} onGoToTab={setActiveTab} />}
        {activeTab === 'audit'    && <AuditTab requestId={req.id} />}
        {activeTab === 'request'  && <HeadersBodyTab headers={reqHeaders} body={reqBody} label="Request" />}
        {activeTab === 'response' && <HeadersBodyTab headers={respHeaders} body={respBody} label="Response" />}
        {activeTab === 'codegen'  && <CodeGenTab codegen={codegen} />}
        {activeTab === 'replay'   && <ReplayTab req={req} />}
      </div>
    </div>
  );
}

function OverviewTab({ req, onGoToTab }) {
  const grade = req.audit_grade || 'A';
  const gradeClass = `grade-${grade.toLowerCase()}`;

  const networkFields = [
    ['HTTP Method', req.method],
    ['URL Endpoint', req.url],
    ['Host / Domain', req.domain],
    ['Pathname', req.path || '/'],
    ['Status Code', `${req.status_code || '—'} ${req.status_text || ''}`],
    ['Total Latency', fmtMs(req.duration_ms)],
    ['Timestamp', req.timestamp ? `${new Date(req.timestamp).toLocaleString()} (${new Date(req.timestamp).toISOString()})` : '—'],
  ];

  const payloadFields = [
    ['Request Body Size', fmtBytes(req.request_size || (req.request_body ? req.request_body.length : 0))],
    ['Response Body Size', fmtBytes(req.response_size || (req.response_body ? req.response_body.length : 0))],
    ['Resource Type', req.resource_type || 'xhr / fetch'],
    ['Redaction Applied', req.was_redacted ? '🛡️ Yes (PII / auth secrets masked)' : 'No'],
    ['Error Response', req.has_error ? '⚠️ Yes (HTTP >= 400 or Network Fault)' : 'No'],
    ['Slow Network Warning', req.is_slow ? '⏱️ Yes (>500ms threshold)' : 'No'],
  ];

  const contextFields = [
    ['Tab Title', req.tab_title || '—'],
    ['Tab URL', req.tab_url || '—'],
    ['User Action Label', req.action_label || '—'],
    ['Batch Tracking ID', req.action_batch_id || '—'],
  ];

  return (
    <div className="overview-container animate-fade">
      {/* Metric Cards Grid */}
      <div className="overview-metrics-grid">
        <div className="overview-metric-card">
          <span className="metric-label">Status</span>
          <span className={`metric-value ${statusClass(req.status_code)}`}>
            {req.status_code || '—'}
          </span>
          <span className="metric-sub">{req.status_text || 'Completed'}</span>
        </div>

        <div className="overview-metric-card">
          <span className="metric-label">Duration</span>
          <span className="metric-value font-mono">
            {fmtMs(req.duration_ms)}
          </span>
          <span className="metric-sub">{req.is_slow ? '⚠️ Slow Latency' : 'Optimal'}</span>
        </div>

        <div className="overview-metric-card">
          <span className="metric-label">Bandwidth</span>
          <span className="metric-value font-mono">
            {fmtBytes(req.response_size)}
          </span>
          <span className="metric-sub">In: {fmtBytes(req.request_size)}</span>
        </div>

        <div
          className={`overview-metric-card metric-security-card ${gradeClass}`}
          onClick={() => onGoToTab('audit')}
          style={{ cursor: 'pointer' }}
          title="Click to inspect security audit"
        >
          <div className="security-card-header">
            <span className="metric-label">Sentinel Posture</span>
            <span className="security-link-arrow">→</span>
          </div>
          <span className="metric-value grade-text">Grade {grade}</span>
          <span className="metric-sub">
            {(req.audit_high || 0)} High · {(req.audit_medium || 0)} Med Risks
          </span>
        </div>
      </div>

      {/* Network & Protocol */}
      <div className="detail-section">
        <div className="section-header-bar">
          <span className="section-heading">Network & Protocol Diagnostics</span>
        </div>
        <table className="kv-table">
          <tbody>
            {networkFields.map(([k, v]) => (
              <tr key={k}>
                <td className="kv-key">{k}</td>
                <td className="kv-val font-mono">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payload Diagnostics */}
      <div className="detail-section">
        <div className="section-header-bar">
          <span className="section-heading">Payload & Safety Heuristics</span>
        </div>
        <table className="kv-table">
          <tbody>
            {payloadFields.map(([k, v]) => (
              <tr key={k}>
                <td className="kv-key">{k}</td>
                <td className={`kv-val ${k.includes('Redaction') && req.was_redacted ? 'kv-redacted' : ''}`}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Origin Context */}
      <div className="detail-section">
        <div className="section-header-bar">
          <span className="section-heading">Origin & Automation Context</span>
        </div>
        <table className="kv-table">
          <tbody>
            {contextFields.map(([k, v]) => (
              <tr key={k}>
                <td className="kv-key">{k}</td>
                <td className="kv-val">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeadersBodyTab({ headers, body, label }) {
  const [headerSearch, setHeaderSearch] = useState('');
  const [viewMode, setViewMode]         = useState('formatted'); // formatted | raw
  const [wrapLines, setWrapLines]       = useState(true);

  const entries = useMemo(() => Object.entries(headers || {}), [headers]);

  const filteredHeaders = useMemo(() => {
    if (!headerSearch) return entries;
    const q = headerSearch.toLowerCase();
    return entries.filter(([k, v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q));
  }, [entries, headerSearch]);

  const formattedBody = useMemo(() => {
    if (!body) return '';
    return viewMode === 'formatted' ? prettyJSON(body) : body;
  }, [body, viewMode]);

  return (
    <div className="headers-body-container animate-fade">
      {/* Headers Section */}
      <div className="detail-section">
        <div className="section-header-bar">
          <div className="section-title-wrap">
            <span className="section-heading">{label} Headers</span>
            <span className="count-badge">{entries.length}</span>
          </div>

          <div className="section-tools-wrap">
            <div className="header-search-wrap">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="input input-xs header-search-input font-mono"
                placeholder="Filter headers..."
                value={headerSearch}
                onChange={e => setHeaderSearch(e.target.value)}
              />
            </div>
            {entries.length > 0 && (
              <CopyBtn
                text={JSON.stringify(headers, null, 2)}
                label="Copy Headers"
                className="btn-xs"
              />
            )}
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="empty-panel-text">No {label.toLowerCase()} headers recorded.</div>
        ) : filteredHeaders.length === 0 ? (
          <div className="empty-panel-text">No headers matching "{headerSearch}"</div>
        ) : (
          <div className="table-responsive">
            <table className="kv-table">
              <thead>
                <tr>
                  <th style={{ width: '35%' }}>Header Key</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {filteredHeaders.map(([k, v]) => {
                  const isRedacted = v === '[REDACTED]' || String(v).includes('[REDACTED]');
                  return (
                    <tr key={k}>
                      <td className="kv-key" title={k}>{k}</td>
                      <td className={`kv-val font-mono ${isRedacted ? 'kv-redacted' : ''}`}>
                        <span>{String(v)}</span>
                        {isRedacted && <span className="redacted-shield-tag">🔒 MASKED</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Body Section */}
      <div className="detail-section">
        <div className="section-header-bar">
          <div className="section-title-wrap">
            <span className="section-heading">{label} Payload Body</span>
            {body && <span className="count-badge">{fmtBytes(body.length)}</span>}
          </div>

          {body && (
            <div className="section-tools-wrap">
              <div className="view-mode-toggle">
                <button
                  className={`toggle-btn ${viewMode === 'formatted' ? 'active' : ''}`}
                  onClick={() => setViewMode('formatted')}
                >
                  Formatted JSON
                </button>
                <button
                  className={`toggle-btn ${viewMode === 'raw' ? 'active' : ''}`}
                  onClick={() => setViewMode('raw')}
                >
                  Raw
                </button>
              </div>

              <button
                className={`btn btn-xs ${wrapLines ? 'btn-active' : 'btn-ghost'}`}
                onClick={() => setWrapLines(w => !w)}
                title="Toggle line wrapping"
              >
                Wrap
              </button>

              <CopyBtn text={body} label="Copy Body" className="btn-xs" />
            </div>
          )}
        </div>

        {body ? (
          <div className="code-viewer-container">
            <pre className={`code-block ${wrapLines ? 'wrap-lines' : ''}`}>
              <code>{formattedBody}</code>
            </pre>
          </div>
        ) : (
          <div className="empty-panel-text">No {label.toLowerCase()} payload body captured.</div>
        )}
      </div>
    </div>
  );
}

const LANG_TABS = [
  ['cURL',             'curl'],
  ['Python (HTTPX)',   'python_httpx'],
  ['Python (Requests)','python_requests'],
  ['JavaScript (Fetch)','js_fetch'],
  ['Axios',            'js_axios'],
];

function CodeGenTab({ codegen }) {
  const [lang, setLang] = useState('curl');

  if (!codegen) return (
    <div className="inspector-loading">
      <div className="cyber-scanner-loader">
        <div className="scanner-line" />
      </div>
      <span className="font-mono text-cyan">Generating code snippets...</span>
    </div>
  );

  if (codegen.error) {
    return (
      <div className="detail-section">
        <div className="error-banner">{codegen.error}</div>
      </div>
    );
  }

  const code = codegen[lang] || '';

  return (
    <div className="codegen-container animate-fade">
      <div className="detail-section">
        <div className="section-header-bar">
          <div className="lang-tab-bar">
            {LANG_TABS.map(([label, key]) => (
              <button
                key={key}
                className={`lang-pill ${lang === key ? 'active' : ''}`}
                onClick={() => setLang(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <CopyBtn text={code} label="Copy Snippet" className="btn-sm btn-primary" />
        </div>

        <div className="code-viewer-container">
          <pre className="code-block code-snippet-block">
            <code>{code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

function ReplayTab({ req }) {
  const [url, setUrl]         = useState(req.url || '');
  const [method, setMethod]   = useState(req.method || 'GET');
  const [body, setBody]       = useState(req.request_body ? (typeof req.request_body === 'string' ? req.request_body : JSON.stringify(req.request_body, null, 2)) : '');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);

  const handleReplay = async () => {
    if (!url) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await api.replay({ method, url, body: body || null });
      setResult(r);
    } catch (e) {
      setResult({ success: false, error: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleBeautify = () => {
    if (!body) return;
    try {
      setBody(JSON.stringify(JSON.parse(body), null, 2));
    } catch { /* not json */ }
  };

  const respBody = result?.response_body ? prettyJSON(result.response_body) : '';

  return (
    <div className="replay-container animate-fade">
      {/* Request Form */}
      <div className="replay-card">
        <div className="replay-url-bar">
          <select
            id="replay-method"
            className="input select-method font-mono"
            value={method}
            onChange={e => setMethod(e.target.value)}
          >
            {['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <input
            id="replay-url"
            className="input mono replay-url-input font-mono"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://api.example.com/endpoint"
          />

          <button
            id="replay-send-btn"
            className="btn btn-primary replay-send-btn"
            onClick={handleReplay}
            disabled={loading || !url}
          >
            {loading ? (
              <>
                <div className="spinner" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Send</span>
              </>
            )}
          </button>
        </div>

        {/* Request Payload Editor */}
        <div className="replay-body-editor">
          <div className="editor-header">
            <span className="editor-label">Request Body (JSON / Raw)</span>
            {body && (
              <button className="btn btn-xs btn-ghost" onClick={handleBeautify} title="Format JSON payload">
                ✨ Beautify JSON
              </button>
            )}
          </div>
          <textarea
            id="replay-body"
            className="input mono replay-textarea font-mono"
            rows={6}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder='{"key": "value"}'
          />
        </div>
      </div>

      {/* Response Display */}
      {result && (
        <div className="replay-result-card animate-fade">
          <div className="replay-result-header">
            <div className="result-header-left">
              <span className="result-label">Response:</span>
              {result.success ? (
                <span className={`badge ${statusClass(result.status_code)}`}>
                  {result.status_code} {result.status_text || ''}
                </span>
              ) : (
                <span className="badge badge-err">Network Fault</span>
              )}
              {result.duration_ms != null && (
                <span className="result-duration font-mono">
                  ⚡ {fmtMs(result.duration_ms)}
                </span>
              )}
            </div>

            {respBody && (
              <CopyBtn text={respBody} label="Copy Response" className="btn-xs" />
            )}
          </div>

          {result.error && (
            <div className="replay-error-msg font-mono">
              {result.error}
            </div>
          )}

          {respBody && (
            <div className="code-viewer-container" style={{ margin: 12 }}>
              <pre className="code-block font-mono" style={{ maxHeight: 320 }}>
                <code>{respBody}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="inspector inspector-empty">
      <div className="inspector-empty-icon-wrap">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ff6b8b" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <path d="M11 8v6M8 11h6" />
        </svg>
      </div>
      <div className="inspector-empty-title">Select a Traffic Capture to Inspect</div>
      <div className="inspector-empty-sub">
        Click any traffic row in the tactical stream to review headers, payload body, Sentinel vulnerability audit, code generation, and live replay.
      </div>
      <div className="inspector-empty-hint">
        💡 Tip: Use <kbd>/</kbd> to search or click on <kbd>🛡️ Risks</kbd> to inspect threat findings.
      </div>
    </div>
  );
}
