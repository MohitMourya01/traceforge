import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';
import { methodClass } from '../utils';

const EMPTY_RULE = {
  name: '',
  match_method: '',
  match_url_pattern: '',
  match_url_is_regex: false,
  override_status_code: 200,
  override_status_text: 'OK',
  override_body: '',
  simulated_delay_ms: 0,
  is_active: true,
};

const TEMPLATES = [
  {
    name: 'Simulate 500 Server Error',
    match_method: 'GET',
    match_url_pattern: '/api/.*',
    match_url_is_regex: true,
    override_status_code: 500,
    override_status_text: 'Internal Server Error',
    override_body: JSON.stringify({ error: 'Internal server error simulated by TraceForge' }, null, 2),
    simulated_delay_ms: 0,
    is_active: true,
  },
  {
    name: 'Simulate 429 Rate Limit',
    match_method: 'POST',
    match_url_pattern: '/api/.*',
    match_url_is_regex: true,
    override_status_code: 429,
    override_status_text: 'Too Many Requests',
    override_body: JSON.stringify({ error: 'Rate limit exceeded. Try again in 60s.', retry_after: 60 }, null, 2),
    simulated_delay_ms: 200,
    is_active: true,
  },
  {
    name: 'Simulate 2s Slow Network Delay',
    match_method: '',
    match_url_pattern: '/api/.*',
    match_url_is_regex: true,
    override_status_code: 200,
    override_status_text: 'OK',
    override_body: '',
    simulated_delay_ms: 2000,
    is_active: true,
  },
  {
    name: 'Mock User Profile JSON',
    match_method: 'GET',
    match_url_pattern: '/api/user/profile',
    match_url_is_regex: false,
    override_status_code: 200,
    override_status_text: 'OK',
    override_body: JSON.stringify({ id: 'usr_mock_123', name: 'Mock Developer', role: 'admin', verified: true }, null, 2),
    simulated_delay_ms: 50,
    is_active: true,
  },
];

export function MockRulesPage() {
  const [rules, setRules]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [search, setSearch]     = useState('');

  const load = useCallback(async () => {
    try { setRules(await api.listMockRules()); }
    catch { /* backend offline */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (rule) => {
    try {
      const updated = await api.updateMockRule(rule.id, { ...rule, is_active: !rule.is_active });
      setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
    } catch { /* ignore */ }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this mock rule?')) return;
    try {
      await api.deleteMockRule(id);
      setRules(prev => prev.filter(r => r.id !== id));
    } catch { /* ignore */ }
  };

  const handleSave = async (data) => {
    try {
      if (editRule?.id) {
        const updated = await api.updateMockRule(editRule.id, data);
        setRules(prev => prev.map(r => r.id === editRule.id ? updated : r));
      } else {
        const created = await api.createMockRule(data);
        setRules(prev => [created, ...prev]);
      }
      setShowForm(false);
      setEditRule(null);
    } catch (e) {
      alert(`Failed to save rule: ${e.message}`);
    }
  };

  const openEdit = (rule) => { setEditRule(rule); setShowForm(true); };
  const openNew  = (template = null) => {
    setEditRule(template ? { ...template } : null);
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditRule(null); };

  const filteredRules = useMemo(() => {
    if (!search) return rules;
    const q = search.toLowerCase();
    return rules.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.match_url_pattern || '').toLowerCase().includes(q) ||
      (r.match_method || '').toLowerCase().includes(q)
    );
  }, [rules, search]);

  return (
    <div className="panel-page animate-fade">
      {/* Page Header */}
      <div className="panel-page-header">
        <div className="panel-header-left">
          <div className="panel-header-icon-wrap">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
          </div>
          <div>
            <div className="panel-page-title">Mock & Interception Rules</div>
            <div className="panel-page-sub">
              Intercept outbound browser requests and return simulated payloads, status overrides, or latency
            </div>
          </div>
        </div>

        <div className="panel-header-actions">
          <button id="new-mock-rule-btn" className="btn btn-primary" onClick={() => openNew()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>New Mock Rule</span>
          </button>
        </div>
      </div>

      {/* Preset Quick Templates */}
      <div className="templates-section">
        <span className="templates-label">Quick Presets:</span>
        <div className="templates-row">
          {TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.name}
              className="btn btn-xs template-btn"
              onClick={() => openNew(tmpl)}
              title="Create rule from this template"
            >
              + {tmpl.name}
            </button>
          ))}
        </div>
      </div>

      {/* Search and count bar */}
      <div className="rules-search-bar">
        <div className="rules-search-input-wrap">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="input input-sm rules-search-input"
            placeholder="Search mock rules by name, pattern, or method..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear-btn" onClick={() => setSearch('')}>✕</button>
          )}
        </div>
        <span className="rules-count-badge">
          {filteredRules.length} of {rules.length} active rule{rules.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading && (
        <div className="inspector-loading">
          <div className="cyber-scanner-loader">
            <div className="scanner-line" />
          </div>
          <span>Loading mock rules...</span>
        </div>
      )}

      {!loading && rules.length === 0 && (
        <div className="mock-empty-state">
          <div className="mock-empty-icon-wrap">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <div className="mock-empty-title">No Mock Rules Configured</div>
          <div className="mock-empty-sub">
            Intercept API calls from the browser extension and mock responses, test error handling, or inject latency.
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => openNew()} style={{ marginTop: 16 }}>
            Create First Mock Rule
          </button>
        </div>
      )}

      <div className="rules-list">
        {filteredRules.map(rule => (
          <RuleCard
            key={rule.id}
            rule={rule}
            onToggle={() => handleToggle(rule)}
            onEdit={() => openEdit(rule)}
            onDelete={() => handleDelete(rule.id)}
          />
        ))}
      </div>

      {showForm && (
        <RuleFormModal
          initial={editRule || EMPTY_RULE}
          onSave={handleSave}
          onClose={closeForm}
        />
      )}
    </div>
  );
}

/* ── Rule card ────────────────────────────────────────────────────────────────── */
function RuleCard({ rule, onToggle, onEdit, onDelete }) {
  const methodLabel = rule.match_method || 'ANY';
  const statusCode = rule.override_status_code || 200;

  return (
    <div className={`rule-card ${rule.is_active ? '' : 'inactive'}`}>
      {/* Toggle switch */}
      <label className="rule-toggle" title={rule.is_active ? 'Rule is active (Click to pause)' : 'Rule is paused (Click to activate)'}>
        <input type="checkbox" checked={rule.is_active} onChange={onToggle} />
        <span className="rule-toggle-track" />
      </label>

      {/* Info */}
      <div className="rule-info">
        <div className="rule-header-row">
          <span className="rule-name">{rule.name}</span>
          {rule.match_url_is_regex && <span className="regex-badge">REGEX</span>}
        </div>

        <div className="rule-pattern-row">
          <span className={`badge badge-method ${methodClass(rule.match_method)}`}>
            {methodLabel}
          </span>
          <span className="rule-pattern-text font-mono" title={rule.match_url_pattern}>
            {rule.match_url_pattern}
          </span>
          {rule.simulated_delay_ms > 0 && (
            <span className="rule-delay-badge">
              ⚡ +{rule.simulated_delay_ms}ms latency
            </span>
          )}
        </div>
      </div>

      {/* Status override badge */}
      <span
        className="rule-status-badge"
        style={{
          background: statusCode < 400 ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
          color: statusCode < 400 ? 'var(--accent-green)' : 'var(--accent-red)',
          border: `1px solid ${statusCode < 400 ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`
        }}
      >
        HTTP {statusCode} {rule.override_status_text || ''}
      </span>

      {/* Actions */}
      <div className="rule-actions-group">
        <button className="btn btn-xs btn-ghost" onClick={onEdit} title="Edit Rule">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button className="btn btn-xs btn-danger-subtle" onClick={onDelete} title="Delete Rule">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ── Rule form modal ──────────────────────────────────────────────────────────── */
function RuleFormModal({ initial, onSave, onClose }) {
  const [form, setForm]     = useState({ ...initial });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [k]: val }));
  };

  const handleBeautify = () => {
    if (!form.override_body) return;
    try {
      setForm(f => ({ ...f, override_body: JSON.stringify(JSON.parse(f.override_body), null, 2) }));
    } catch { /* not json */ }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({
      ...form,
      override_status_code: Number(form.override_status_code) || 200,
      simulated_delay_ms: Number(form.simulated_delay_ms) || 0,
    });
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-md animate-fade" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-title-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.5">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            </svg>
            <span className="modal-title">{initial.id ? 'Edit Mock Rule' : 'New Mock & Intercept Rule'}</span>
          </div>
          <button className="btn btn-xs btn-icon" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid">
              <div className="form-field full">
                <label className="form-label">Rule Name *</label>
                <input
                  id="rule-name"
                  className="input"
                  required
                  value={form.name}
                  onChange={set('name')}
                  placeholder="e.g. Mock /api/orders with 429 Rate Limit"
                />
              </div>

              <div className="form-field">
                <label className="form-label">Match HTTP Method</label>
                <select id="rule-method" className="input" value={form.match_method} onChange={set('match_method')}>
                  <option value="">Any Method (*)</option>
                  {['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">Override Status Code</label>
                <input
                  id="rule-status"
                  className="input"
                  type="number"
                  value={form.override_status_code}
                  onChange={set('override_status_code')}
                  min={100}
                  max={599}
                />
              </div>

              <div className="form-field full">
                <div className="field-label-row">
                  <label className="form-label">Match URL Pattern *</label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.match_url_is_regex}
                      onChange={set('match_url_is_regex')}
                    />
                    <span>Treat as Regex Pattern</span>
                  </label>
                </div>
                <input
                  id="rule-pattern"
                  className="input mono"
                  required
                  value={form.match_url_pattern}
                  onChange={set('match_url_pattern')}
                  placeholder={form.match_url_is_regex ? '^https://api\\.example\\.com/v1/orders/.*' : '/api/orders'}
                />
              </div>

              <div className="form-field full">
                <div className="field-label-row">
                  <label className="form-label">Override Response Body (JSON / Raw)</label>
                  {form.override_body && (
                    <button type="button" className="btn btn-xs btn-ghost" onClick={handleBeautify}>
                      ✨ Format JSON
                    </button>
                  )}
                </div>
                <textarea
                  id="rule-body"
                  className="input mono"
                  rows={5}
                  value={form.override_body}
                  onChange={set('override_body')}
                  placeholder='{"success": false, "error": "Simulated error"}'
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="form-field">
                <label className="form-label">Simulated Delay (ms)</label>
                <input
                  id="rule-delay"
                  className="input"
                  type="number"
                  min={0}
                  step={50}
                  value={form.simulated_delay_ms}
                  onChange={set('simulated_delay_ms')}
                  placeholder="0"
                />
              </div>

              <div className="form-field">
                <label className="form-label">Status Text (Optional)</label>
                <input
                  id="rule-status-text"
                  className="input"
                  value={form.override_status_text || ''}
                  onChange={set('override_status_text')}
                  placeholder="e.g. OK, Bad Request, Rate Limited"
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-sm" onClick={onClose}>Cancel</button>
            <button id="save-rule-btn" type="submit" className="btn btn-sm btn-primary" disabled={saving}>
              {saving ? (
                <>
                  <div className="spinner" />
                  <span>Saving...</span>
                </>
              ) : 'Save Mock Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

