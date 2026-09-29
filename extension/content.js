/**
 * TraceForge - Content Script
 *
 * Runs in the "ISOLATED" extension world (separate from page JS).
 * Acts as the bridge between:
 *   - inpage-interceptor.js (page context, via postMessage)
 *   - background.js (service worker, via chrome.runtime.sendMessage)
 *
 * Also injects the in-page interceptor script into the page's own
 * JavaScript context at document_start.
 */

// ── Inject In-Page Interceptor ────────────────────────────────────────────────

(function injectInterceptor() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("inpage-interceptor.js");
  script.dataset.extensionId = chrome.runtime.id;
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();
})();

// ── Listen for Captured Requests from Page Context ─────────────────────────────

window.addEventListener("message", (event) => {
  // Only accept messages from same window with TraceForge channel marker
  if (
    event.source !== window ||
    !event.data ||
    !event.data.__TRACEFORGE__
  ) {
    return;
  }

  const { type, data } = event.data;

  if (type === "CAPTURED_REQUEST") {
    // Enrich with tab metadata and forward to background service worker
    chrome.runtime.sendMessage({
      type: "CAPTURED_REQUEST",
      data: {
        ...data,
        tab_url: window.location.href,
        tab_title: document.title,
        timestamp: new Date().toISOString(),
      },
    }).catch(() => {
      // Background may not be ready yet — silently ignore
    });
  }
});

// ── Listen for Commands from Background ───────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SET_RECORDING") {
    // Forward to in-page interceptor via postMessage
    window.postMessage(
      { __TRACEFORGE__: true, type: "SET_RECORDING", data: { recording: message.recording } },
      "*"
    );
  }

  if (message.type === "MOCK_RULES_UPDATE") {
    window.postMessage(
      { __TRACEFORGE__: true, type: "MOCK_RULES_UPDATE", data: { rules: message.rules } },
      "*"
    );
  }
});
