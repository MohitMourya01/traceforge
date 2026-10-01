const BASE = 'http://127.0.0.1:7890/api';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  // Requests
  listRequests: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return req(`/requests${qs ? '?' + qs : ''}`);
  },
  getRequest:    (id)     => req(`/requests/${id}`),
  clearRequests: ()       => req('/requests', { method: 'DELETE' }),
  codegen:       (id)     => req(`/requests/${id}/codegen`, { method: 'POST' }),

  // Replay
  replay: (payload) => req('/replay', { method: 'POST', body: JSON.stringify(payload) }),

  // Audit (Sentinel)
  getRequestAudit:  (id)    => req(`/requests/${id}/audit`),
  rerunAudit:       (id)    => req(`/requests/${id}/audit/rerun`, { method: 'POST' }),
  globalAuditStats: ()      => req('/audit/summary'),
  listFindings: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return req(`/audit/findings${qs ? '?' + qs : ''}`);
  },

  // Mock rules
  listMockRules:  ()         => req('/mock-rules'),
  createMockRule: (data)     => req('/mock-rules', { method: 'POST', body: JSON.stringify(data) }),
  updateMockRule: (id, data) => req(`/mock-rules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteMockRule: (id)       => req(`/mock-rules/${id}`, { method: 'DELETE' }),

  // Stats
  stats: () => req('/stats'),

  // Recording
  getRecording: () => req('/recording'),
  setRecording: (recording) => req('/recording', { method: 'POST', body: JSON.stringify({ recording }) }),
};

