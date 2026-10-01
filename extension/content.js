/**
 * TraceForge - Content Script
 *
 * Runs in the "ISOLATED" extension world.
 * Acts as the bridge between:
 *   - inpage-interceptor.js (page context, via postMessage)
 *   - background.js (service worker, via chrome.runtime.sendMessage)
 */

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
    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        chrome.runtime.id &&
        typeof chrome.runtime.sendMessage === "function"
      ) {
        chrome.runtime.sendMessage(
          {
            type: "CAPTURED_REQUEST",
            data: {
              ...data,
              tab_url: window.location.href,
              tab_title: document.title,
              timestamp: new Date().toISOString(),
            },
          },
          () => {
            // Check runtime.lastError to prevent uncaught runtime errors in console
            if (chrome.runtime.lastError) {
              // Service worker might be sleeping/restarting, safe to ignore
            }
          }
        );
      }
    } catch (_) {
      // Tab was opened before extension reload — user needs to refresh the tab
    }
  }
});

// ── Listen for Commands from Background ───────────────────────────────────────

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SET_RECORDING") {
      // Forward to in-page interceptor via postMessage
      window.postMessage(
        { __TRACEFORGE__: true, type: "SET_RECORDING", data: { recording: message.recording } },
        "*"
      );
      if (sendResponse) sendResponse({ ok: true });
      return false;
    }

    if (message.type === "MOCK_RULES_UPDATE") {
      window.postMessage(
        { __TRACEFORGE__: true, type: "MOCK_RULES_UPDATE", data: { rules: message.rules } },
        "*"
      );
      if (sendResponse) sendResponse({ ok: true });
      return false;
    }

    if (message.type === "PING_TAB") {
      if (sendResponse) sendResponse({ pong: true, url: window.location.href });
      return false;
    }

    return false;
  });
}
