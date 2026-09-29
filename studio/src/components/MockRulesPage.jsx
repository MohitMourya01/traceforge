import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

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

export function MockRulesPage() {
  const [rules, setRules]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState(null);

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
      if (editRule) {
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
  const openNew  = () => { setEditRule(null); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditRule(null); };

  return (
    <div className="panel-page">
      <div className="panel-page-header">
        <div>
          <div className="panel-page-title">Mock Rules</div>
          <div className="panel-page-sub">Intercept matching requests and return custom responses</div>
        </div>
        <button id="new-mock-rule-btn" className="btn btn-primary" onClick={openNew} style={{ marginLeft:'auto' }}>
          + New Rule
        </button>
      </div>

      {loading && <p style={{ color:'var(--text-muted)', fontSize:13 }}>Loading…</p>}

      {!loading && rules.length === 0 && (
        <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-muted)' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🚦</div>
          <div style={{ fontSize:14, fontWeight:500, color:'var(--text-secondary)', marginBottom:6 }}>No mock rules yet</div>
          <div style={{ fontSize:12 }}>Create a rule to intercept requests in your browser</div>
        </div>
      )}

      {rules.map(rule => (
        <RuleCard
          key={rule.id}
          rule={rule}
          onToggle={() => handleToggle(rule)}
          onEdit={() => openEdit(rule)}
          onDelete={() => handleDelete(rule.id)}
        />
      ))}

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
  const methodLabel = rule.match_method || '*';
  return (
    <div className={`rule-card ${rule.is_active ? '' : 'inactive'}`}>
      {/* Toggle */}
      <label className="rule-toggle" title={rule.is_active ? 'Disable' : 'Enable'}>
        <input type="checkbox" checked={rule.is_active} onChange={onToggle} />
        <span className="rule-toggle-track" />
      </label>

      {/* Info */}
      <div className="rule-info">
        <div className="rule-name">{rule.name}</div>
        <div className="rule-pattern">
          <span style={{ color:'var(--brand)' }}>{methodLabel}</span>
          {' '}
          {rule.match_url_pattern}
          {rule.simulated_delay_ms > 0 && (
            <span style={{ color:'var(--accent-yellow)', marginLeft:8 }}>+{rule.simulated_delay_ms}ms delay</span>
          )}
        </div>
      </div>

      {/* Status override badge */}
      <span
        className="rule-status-badge"
        style={{
          background: rule.override_status_code < 400
            ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
          color: rule.override_status_code < 400
            ? 'var(--accent-green)' : 'var(--accent-red)',
        }}
      >
        {rule.override_status_code}
      </span>

      {/* Actions */}
      <button className="btn btn-sm btn-icon" onClick={onEdit} title="Edit">✏️</button>
      <button className="btn btn-sm btn-icon btn-danger" onClick={onDelete} title="Delete">🗑</button>
    </div>
  );
}

/* ── Rule form modal ──────────────────────────────────────────────────────────── */
function RuleFormModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState({ ...initial });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({
      ...form,
      override_status_code: Number(form.override_status_code),
      simulated_delay_ms: Number(form.simulated_delay_ms),
    });
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{initial.id ? 'Edit Mock Rule' : 'New Mock Rule'}</span>
          <button className="btn btn-sm btn-icon" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid">
              <div className="form-field full">
                <label className="form-label">Rule Name *</label>
                <input id="rule-name" className="input" required value={form.name} onChange={set('name')} placeholder="e.g. Simulate 429 on /api/orders" />
              </div>

              <div className="form-field">
                <label className="form-label">Match Method</label>
                <select id="rule-method" className="input" value={form.match_method} onChange={set('match_method')}>
                  <option value="">Any (*)</option>
                  {['GET','POST','PUT','PATCH','DELETE'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">Override Status</label>
                <input id="rule-status" className="input" type="number" value={form.override_status_code} onChange={set('override_status_code')} min={100} max={599} />
              </div>

              <div className="form-field full">
                <label className="form-label">URL Pattern *</label>
                <input id="rule-pattern" className="input mono" required value={form.match_url_pattern} onChange={set('match_url_pattern')} placeholder="/api/orders or https://api.example.com/.*" />
              </div>

              <div className="form-field full">
                <label className="form-label">Override Body (JSON / text)</label>
                <textarea id="rule-body" className="input mono" rows={4} value={form.override_body} onChange={set('override_body')} style={{ resize:'vertical' }} />
              </div>

              <div className="form-field">
                <label className="form-label">Simulated Delay (ms)</label>
                <input id="rule-delay" className="input" type="number" min={0} value={form.simulated_delay_ms} onChange={set('simulated_delay_ms')} />
              </div>

              <div className="form-field" style={{ justifyContent:'flex-end', paddingTop:20 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:12, color:'var(--text-secondary)' }}>
                  <input type="checkbox" checked={form.match_url_is_regex} onChange={set('match_url_is_regex')} />
                  Treat pattern as regex
                </label>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button id="save-rule-btn" type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><div className="spinner" />Saving…</> : 'Save Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
