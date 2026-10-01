import { useState, useCallback } from 'react';
import { copyToClipboard } from '../utils';

export function CopyBtn({ text, label = 'Copy', copiedLabel = 'Copied', className = '', iconOnly = false, title = 'Copy to clipboard' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e) => {
    e.stopPropagation();
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }, [text]);

  return (
    <button
      type="button"
      className={`copy-btn ${copied ? 'copied' : ''} ${className}`}
      onClick={handleCopy}
      title={copied ? 'Copied to clipboard!' : title}
      aria-label={copied ? 'Copied' : title}
    >
      {copied ? (
        <svg className="copy-icon checkmark-anim" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg className="copy-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {!iconOnly && <span className="copy-text">{copied ? copiedLabel : label}</span>}
    </button>
  );
}

