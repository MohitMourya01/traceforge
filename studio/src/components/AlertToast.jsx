import React from 'react';

export function AlertToastContainer({ alerts, onDismiss, onInspect }) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="alert-toast-container" aria-live="polite">
      {alerts.map((alert) => (
        <AlertToastItem
          key={alert.toastId}
          alert={alert}
          onDismiss={() => onDismiss(alert.toastId)}
          onInspect={() => onInspect(alert)}
        />
      ))}
    </div>
  );
}

function AlertToastItem({ alert, onDismiss, onInspect }) {
  const isHigh = alert.severity === 'HIGH';
  const isMed = alert.severity === 'MEDIUM';

  return (
    <div className={`alert-toast ${isHigh ? 'toast-high' : isMed ? 'toast-med' : 'toast-low'}`}>
      <div className="toast-glow" />
      
      <div className="toast-header">
        <div className="toast-title-row">
          <span className={`toast-badge ${isHigh ? 'badge-high' : isMed ? 'badge-med' : 'badge-low'}`}>
            <span className="toast-pulse-dot" />
            {alert.severity} RISK
          </span>
          <span className="toast-category">{alert.category}</span>
          <span className="toast-rule-id">[{alert.rule_id}]</span>
        </div>
        <button className="toast-close-btn" onClick={onDismiss} title="Dismiss notification">
          ✕
        </button>
      </div>

      <div className="toast-body">
        <div className="toast-main-title">{alert.title}</div>
        <div className="toast-url-row">
          <span className="toast-method">{alert.request?.method || 'REQ'}</span>
          <span className="toast-url" title={alert.request?.url}>{alert.request?.url || 'API Request'}</span>
        </div>
      </div>

      <div className="toast-actions">
        <button className="toast-action-btn" onClick={onInspect}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Inspect Request
        </button>
        <span className="toast-time">Just now</span>
      </div>
    </div>
  );
}
