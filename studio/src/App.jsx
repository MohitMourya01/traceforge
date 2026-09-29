import React, { useState, useCallback, useRef } from 'react';
import './App.css';
import { Sidebar }               from './components/Sidebar';
import { Inspector }             from './components/Inspector';
import { MockRulesPage }         from './components/MockRulesPage';
import { SecurityPage }          from './components/SecurityPage';
import { AlertToastContainer }   from './components/AlertToast';
import { useWebSocket }          from './hooks/useWebSocket';

const PAGES = [
  { id: 'requests', label: '⚡ Requests', icon: '⚡' },
  { id: 'security', label: '🛡️ Security & Sentinel', icon: '🛡️' },
  { id: 'mocks',    label: '🎭 Mock Rules', icon: '🎭' },
];

export default function App() {
  const [page, setPage]                 = useState('requests');
  const [selectedId, setSelectedId]     = useState(null);
  const [inspectorTab, setInspectorTab] = useState('overview');
  const [wsState, setWsState]           = useState('connecting'); // connecting | open | closed
  const [liveRequests, setLiveRequests] = useState([]);
  const [alerts, setAlerts]             = useState([]);
  const toastCounter = useRef(0);

  const onMessage = useCallback((msg) => {
    if (msg.type === '__WS_OPEN__')  { setWsState('open');  return; }
    if (msg.type === '__WS_CLOSE__') { setWsState('closed'); return; }
    
    if (msg.type === 'NEW_REQUEST') {
      setLiveRequests(prev => [...prev.slice(-99), msg.data]);
    }

    if (msg.type === 'SENTINEL_ALERT') {
      const toastId = ++toastCounter.current;
      const alertItem = { ...msg, toastId };
      setAlerts(prev => [alertItem, ...prev.slice(0, 4)]);

      // Auto dismiss after 7 seconds
      setTimeout(() => {
        setAlerts(prev => prev.filter(a => a.toastId !== toastId));
      }, 7000);
    }

    if (msg.type === 'AUDIT_UPDATED') {
      setLiveRequests(prev => prev.map(r => r.id === msg.data?.id ? { ...r, ...msg.data } : r));
    }
  }, []);

  useWebSocket(onMessage);

  const handleDismissAlert = useCallback((toastId) => {
    setAlerts(prev => prev.filter(a => a.toastId !== toastId));
  }, []);

  const handleInspectAlert = useCallback((alert) => {
    if (alert.request?.id) {
      setSelectedId(alert.request.id);
      setInspectorTab('audit');
      setPage('requests');
    }
  }, []);

  const handleSelectFromSecurity = useCallback((requestId) => {
    setSelectedId(requestId);
    setInspectorTab('audit');
    setPage('requests');
  }, []);

  const wsLabel = wsState === 'open' ? 'Live Sentinel' : wsState === 'connecting' ? 'Connecting' : 'Offline';

  return (
    <div className="app-shell">
      {/* Real-time Sentinel Alert Toasts */}
      <AlertToastContainer
        alerts={alerts}
        onDismiss={handleDismissAlert}
        onInspect={handleInspectAlert}
      />

      {/* Top Navigation Bar */}
      <header className="topbar">
        <div className="topbar-logo" onClick={() => setPage('requests')} style={{ cursor: 'pointer' }}>
          <div className="topbar-logo-icon">🛡️</div>
          <div className="topbar-logo-text">
            <span>traceforge</span>
            <span className="topbar-logo-badge">SENTINEL</span>
          </div>
        </div>

        <div className="topbar-sep" />

        <nav className="topbar-nav">
          {PAGES.map(p => (
            <button
              key={p.id}
              id={`nav-${p.id}`}
              className={`topbar-nav-btn ${page === p.id ? 'active' : ''}`}
              onClick={() => setPage(p.id)}
            >
              <span className="nav-btn-text">{p.label}</span>
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          <div className="ws-indicator" title={`WebSocket Status: ${wsState}`}>
            <div className={`live-dot ${wsState !== 'open' ? 'off' : ''}`} />
            <span className="ws-label-text">{wsLabel}</span>
          </div>
        </div>
      </header>

      {/* Main Pages */}
      {page === 'requests' && (
        <div className="main-split">
          <Sidebar
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setInspectorTab('overview');
            }}
            wsConnected={wsState === 'open'}
            liveRequests={liveRequests}
          />
          <Inspector
            requestId={selectedId}
            initialTab={inspectorTab}
          />
        </div>
      )}

      {page === 'security' && (
        <div className="page-full-container">
          <SecurityPage onSelectRequest={handleSelectFromSecurity} />
        </div>
      )}

      {page === 'mocks' && (
        <div className="page-full-container">
          <MockRulesPage />
        </div>
      )}
    </div>
  );
}
