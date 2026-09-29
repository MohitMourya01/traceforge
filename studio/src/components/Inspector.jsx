import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { CopyBtn } from './CopyBtn';
import { AuditTab } from './AuditTab';
import { statusClass, fmtMs, fmtBytes, prettyJSON } from '../utils';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'audit',    label: '🛡️ Audit' },
  { id: 'request',  label: 'Request' },
  { id: 'response', label: 'Response' },
  { id: 'codegen',  label: 'Code Gen' },
  { id: 'replay',   label: 'Replay' },
];

export function Inspector({ requestId, initialTab = 'overview' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [req, setReq]             = useState(null);
  const [codegen, setCodegen]     = useState(null);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, requestId]);

  useEffect(() => {
    if (!requestId) {
      setReq(null);
      setCodegen(null);
      return;
    }
    let cancelled = false;
    setLoading(true);

    api.getRequest(requestId)
      .then(data => {
        if (!cancelled) setReq(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [requestId]);

  useEffect(() => {
    if (activeTab === 'codegen' && requestId && !codegen) {
      api.codegen(requestId)
        .then(setCodegen)
        .catch(err => setCodegen({ error: err.message }));
    }
  }, [activeTab, requestId, codegen]);

  if (!requestId) return <EmptyState />;

  if (loading && !req) {
    return (
      <div className="inspector inspector-loading">
        <div className="spinner" />
        <span>Loading request #{requestId}...</span>
      </div>
    );
  }

  if (!req) return <EmptyState />;

  const reqHeaders  = req.request_headers  ? JSON.parse(req.request_headers)  : {};
  const respHeaders = req.response_headers ? JSON.parse(req.response_headers) : {};
  const reqBody     = req.request_body  ? prettyJSON(req.request_body)  : null;
  const respBody    = req.response_body ? prettyJSON(req.response_body) : null;

  const totalAuditFindings = (req.audit_high || 0) + (req.audit_medium || 0) + (req.audit_low || 0);
  const grade = req.audit_grade || 'A';
  const gradeClass = `grade-${grade.toLowerCase()}`;

  return (
    <div className="inspector">
      {/* Inspector header */}
      <div className="inspector-header">
        <div className="inspector-title-row">
          <span className={`badge badge-method ${req.method?.toLowerCase()}`}>{req.method}</span>
          <span className="inspector-url" title={req.url}>{req.url}</span>
          {req.status_code && (
            <span className={`badge ${statusClass(req.status_code)}`}>
              {req.status_code} {req.status_text}
            </span>
          )}
          {grade && (
            <span className={`badge badge-grade ${gradeClass}`} title={`Security Grade: ${grade}`}>
              Grade {grade}
            </span>
          )}
        </div>

        <div className="inspector-tabs">
          {TABS.map(t => {
            const isAudit = t.id === 'audit';
            return (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
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

      {/* Tab body */}
      <div className="inspector-body">
        {activeTab === 'overview' && <OverviewTab req={req} />}
        {activeTab === 'audit'    && <AuditTab requestId={req.id} />}
        {activeTab === 'request'  && <HeadersBodyTab headers={reqHeaders} body={reqBody} label="Request" />}
        {activeTab === 'response' && <HeadersBodyTab headers={respHeaders} body={respBody} label="Response" />}
        {activeTab === 'codegen'  && <CodeGenTab codegen={codegen} />}
        {activeTab === 'replay'   && <ReplayTab req={req} />}
      </div>
    </div>
  );
}

function OverviewTab({ req }) {
  const fields = [
    ['Method',        req.method],
    ['URL',           req.url],
    ['Domain',        req.domain],
    ['Path',          req.path],
    ['Status',        `${req.status_code ?? '—'} ${req.status_text ?? ''}`],
    ['Duration',      fmtMs(req.duration_ms)],
    ['Security Grade', req.audit_grade ? `Grade ${req.audit_grade} (${(req.audit_high || 0)} High, ${(req.audit_medium || 0)} Med, ${(req.audit_low || 0)} Low)` : 'Grade A'],
    ['Request Size',  fmtBytes(req.request_size)],
    ['Response Size', fmtBytes(req.response_size)],
    ['Resource Type', req.resource_type],
    ['Tab',           req.tab_title || req.tab_url],
    ['Action',        req.action_label],
    ['Batch ID',      req.action_batch_id],
    ['Timestamp',     req.timestamp ? new Date(req.timestamp).toLocaleString() : '—'],
    ['Was Redacted',  req.was_redacted ? '🛡️ Yes' : 'No'],
    ['Has Error',     req.has_error ? '⚠️ Yes' : 'No'],
    ['Is Slow',       req.is_slow ? '⏱️ Yes' : 'No'],
  ].filter(([, v]) => v != null && v !== '' && v !== '— ');

  return (
    <div className="detail-section">
      <div className="section-heading">General Information</div>
      <table className="kv-table">
        <tbody>
          {fields.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td className={k === 'Was Redacted' && req.was_redacted ? 'kv-redacted' : ''}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeadersBodyTab({ headers, body, label }) {
  const entries = Object.entries(headers);
  return (
    <>
      <div className="detail-section">
        <div className="section-heading">{label} Headers</div>
        {entries.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>No headers captured</p>
        ) : (
          <table className="kv-table">
            <tbody>
              {entries.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className={v === '[REDACTED]' ? 'kv-redacted' : ''}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="detail-section">
        <div className="section-heading">{label} Body</div>
        {body ? (
          <div className="copy-wrapper">
            <pre className="code-block">{body}</pre>
            <CopyBtn text={body} />
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>No {label.toLowerCase()} body</p>
        )}
      </div>
    </>
  );
}

const LANG_TABS = [
  ['cURL',     'curl'],
  ['Python',   'python_httpx'],
  ['Requests', 'python_requests'],
  ['JS Fetch', 'js_fetch'],
  ['Axios',    'js_axios'],
];

function CodeGenTab({ codegen }) {
  const [lang, setLang] = useState('curl');

  if (!codegen) return (
    <div style={{ display:'flex', alignItems:'center', gap:10, color:'var(--text-muted)', padding:'40px 0' }}>
      <div className="spinner" /> Generating code...
    </div>
  );
  if (codegen.error) return <p style={{ color:'var(--accent-red)', fontSize:12 }}>{codegen.error}</p>;

  const code = codegen[lang] || '';

  return (
    <div className="detail-section">
      <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
        {LANG_TABS.map(([label, key]) => (
          <button
            key={key}
            className={`filter-btn ${lang === key ? 'active' : ''}`}
            onClick={() => setLang(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="copy-wrapper">
        <pre className="code-block">{code}</pre>
        <CopyBtn text={code} />
      </div>
    </div>
  );
}

function ReplayTab({ req }) {
  const [url, setUrl]       = useState(req.url || '');
  const [method, setMethod] = useState(req.method || 'GET');
  const [body, setBody]     = useState(req.request_body || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleReplay = async () => {
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

  const respBody = result?.response_body ? prettyJSON(result.response_body) : '';

  return (
    <div className="detail-section" style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div className="form-field">
        <label className="form-label">URL</label>
        <input id="replay-url" className="input mono" value={url} onChange={e => setUrl(e.target.value)} />
      </div>

      <div className="form-field" style={{ width: 160 }}>
        <label className="form-label">Method</label>
        <select id="replay-method" className="input" value={method} onChange={e => setMethod(e.target.value)}>
          {['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(m => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label className="form-label">Body (optional)</label>
        <textarea
          id="replay-body"
          className="input mono"
          rows={5}
          value={body}
          onChange={e => setBody(e.target.value)}
          style={{ resize:'vertical' }}
        />
      </div>

      <button id="replay-send-btn" className="btn btn-primary" onClick={handleReplay} disabled={loading}>
        {loading ? <><div className="spinner" />Sending...</> : '▶ Send Request'}
      </button>

      {result && (
        <div className="replay-result">
          <div className="replay-result-header">
            {result.success
              ? <span className={`badge ${statusClass(result.status_code)}`}>{result.status_code} {result.status_text}</span>
              : <span className="badge badge-err">Error</span>}
            {result.duration_ms != null && <span style={{ fontSize:12, color:'var(--text-secondary)' }}>⚡ {fmtMs(result.duration_ms)}</span>}
            {result.error && <span style={{ fontSize:12, color:'var(--accent-red)' }}>{result.error}</span>}
          </div>
          {respBody && (
            <div style={{ padding:14 }}>
              <div className="copy-wrapper">
                <pre className="code-block" style={{ maxHeight:240 }}>{respBody}</pre>
                <CopyBtn text={respBody} />
              </div>
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
      <div className="inspector-empty-icon">🔍</div>
      <div className="inspector-empty-title">Select a request to inspect</div>
      <div className="inspector-empty-sub">Click any row in the sidebar to see details, headers, body & security audit</div>
    </div>
  );
}
