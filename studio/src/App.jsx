import { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';
import { Sidebar }               from './components/Sidebar';
import { Inspector }             from './components/Inspector';
import { MockRulesPage }         from './components/MockRulesPage';
import { SecurityPage }          from './components/SecurityPage';
import { AlertToastContainer }   from './components/AlertToast';
import { CyberBackground }       from './components/CyberBackground';
import { useWebSocket }          from './hooks/useWebSocket';
import { api }                   from './api';

const PAGES = [
  {
    id: 'requests',
    label: 'Live Traffic',
    shortcut: '1',
    icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z'
  },
  {
    id: 'security',
    label: 'Sentinel Security',
    shortcut: '2',
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'
  },
  {
    id: 'mocks',
    label: 'Mock Rules',
    shortcut: '3',
    icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'
  },
];

export default function App() {
  const [page, setPage]                 = useState('requests');
  const [selectedId, setSelectedId]     = useState(null);
  const [inspectorTab, setInspectorTab] = useState('overview');
  const [wsState, setWsState]           = useState('connecting'); // connecting | open | closed
  const [isRecording, setIsRecording]   = useState(true);
  const [liveRequests, setLiveRequests] = useState([]);
  const [alerts, setAlerts]             = useState([]);
  const [highAlertCount, setHighAlertCount] = useState(0);
  const toastCounter = useRef(0);

  const onMessage = useCallback((msg) => {
    if (msg.type === '__WS_OPEN__')  {
      setWsState('open');
      return;
    }
    if (msg.type === '__WS_CLOSE__') {
      setWsState('closed');
      return;
    }
    
    if (msg.type === 'CONNECTED') {
      if (typeof msg.is_recording === 'boolean') {
        setIsRecording(msg.is_recording);
      }
      return;
    }

    if (msg.type === 'RECORDING_STATE') {
      if (typeof msg.recording === 'boolean') {
        setIsRecording(msg.recording);
      }
      return;
    }

    if (msg.type === 'NEW_REQUEST') {
      setLiveRequests(prev => [...prev.slice(-99), msg.data]);
    }

    if (msg.type === 'SENTINEL_ALERT') {
      const toastId = ++toastCounter.current;
      const alertItem = { ...msg, toastId };
      setAlerts(prev => [alertItem, ...prev.slice(0, 4)]);
      if (msg.severity === 'HIGH') {
        setHighAlertCount(c => c + 1);
      }

      // Auto dismiss after 7 seconds
      setTimeout(() => {
        setAlerts(prev => prev.filter(a => a.toastId !== toastId));
      }, 7000);
    }

    if (msg.type === 'AUDIT_UPDATED') {
      setLiveRequests(prev => prev.map(r => r.id === msg.data?.id ? { ...r, ...msg.data } : r));
    }
  }, []);

  const { sendMessage } = useWebSocket(onMessage);

  // Toggle recording globally (synced with backend & Chrome extension)
  const handleToggleRecording = useCallback(async () => {
    const nextState = !isRecording;
    setIsRecording(nextState);
    sendMessage({ type: 'SET_RECORDING', recording: nextState });
    try {
      await api.setRecording(nextState);
    } catch (_) {}
  }, [isRecording, sendMessage]);

  // Initial fetch of recording state
  useEffect(() => {
    api.getRecording()
      .then(res => {
        if (res && typeof res.recording === 'boolean') {
          setIsRecording(res.recording);
        }
      })
      .catch(() => {});
  }, []);

  // Global hotkeys (1: Requests, 2: Security, 3: Mocks, P: Toggle Capturing)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key === '1') setPage('requests');
      if (e.key === '2') setPage('security');
      if (e.key === '3') setPage('mocks');
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handleToggleRecording();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleRecording]);

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

  const wsLabel = wsState === 'open' ? 'Sentinel Live' : wsState === 'connecting' ? 'Connecting...' : 'Offline (7890)';

  return (
    <div className="app-shell">
      {/* Three.js Animated Cyberpunk Background */}
      <CyberBackground />

      {/* Real-time Sentinel Alert Toasts */}
      <AlertToastContainer
        alerts={alerts}
        onDismiss={handleDismissAlert}
        onInspect={handleInspectAlert}
      />

      {/* Top Navigation Bar */}
      <header className="topbar">
        <div className="topbar-logo" onClick={() => setPage('requests')} style={{ cursor: 'pointer' }}>
          <div className="topbar-logo-icon">
            <img src="/logo.svg" alt="TraceForge" width="24" height="24" />
          </div>
          <div className="topbar-logo-text">
            <span className="brand-name">trace<span className="brand-accent">forge</span></span>
            <span className="topbar-logo-badge">SENTINEL</span>
          </div>
        </div>

        <div className="topbar-sep" />

        <nav className="topbar-nav">
          {PAGES.map(p => {
            const isActive = page === p.id;
            return (
              <button
                key={p.id}
                id={`nav-${p.id}`}
                className={`topbar-nav-btn ${isActive ? 'active' : ''}`}
                onClick={() => setPage(p.id)}
                title={`Press ${p.shortcut} to switch to ${p.label}`}
              >
                <svg className="nav-btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={p.icon} />
                </svg>
                <span className="nav-btn-text">{p.label}</span>
                {p.id === 'security' && highAlertCount > 0 && (
                  <span className="nav-alert-badge">{highAlertCount}</span>
                )}
                <span className="nav-shortcut-hint">{p.shortcut}</span>
              </button>
            );
          })}
        </nav>

        <div className="topbar-right">
          {/* Global Recording / Capture Pause Control */}
          <button
            type="button"
            id="toggle-capture-btn"
            className={`capture-toggle-btn ${isRecording ? 'recording' : 'paused'}`}
            onClick={handleToggleRecording}
            title={isRecording ? 'Click to stop capturing network traffic (HotKey: P)' : 'Click to resume capturing network traffic (HotKey: P)'}
          >
            <span className="capture-dot-indicator">
              <span className={`capture-pulse-dot ${isRecording ? 'live' : 'paused'}`} />
            </span>
            <span className="capture-toggle-text">
              {isRecording ? 'Capturing Live' : 'Capture Paused'}
            </span>
            <span className="capture-key-badge">P</span>
          </button>

          <div className={`ws-indicator ${wsState}`} title={`Proxy WebSocket stream: ${wsState}`}>
            <div className={`live-dot ${wsState !== 'open' ? 'off' : ''}`} />
            <span className="ws-label-text">{wsLabel}</span>
          </div>
        </div>
      </header>

      {/* Main Pages */}
      {page === 'requests' && (
        <div className="main-split animate-fade">
          <Sidebar
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setInspectorTab('overview');
            }}
            wsConnected={wsState === 'open'}
            liveRequests={liveRequests}
            isRecording={isRecording}
            onToggleRecording={handleToggleRecording}
          />
          <Inspector
            requestId={selectedId}
            initialTab={inspectorTab}
            isRecording={isRecording}
            onToggleRecording={handleToggleRecording}
          />
        </div>
      )}

      {page === 'security' && (
        <div className="page-full-container animate-fade">
          <SecurityPage onSelectRequest={handleSelectFromSecurity} />
        </div>
      )}

      {page === 'mocks' && (
        <div className="page-full-container animate-fade">
          <MockRulesPage />
        </div>
      )}
    </div>
  );
}
