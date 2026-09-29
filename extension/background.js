/**
 * TraceForge - Background Service Worker
 *
 * Responsibilities:
 *  1. Maintains a persistent WebSocket connection to the TraceForge backend
 *     (ws://127.0.0.1:7890/ws/extension)
 *  2. Receives captured requests from content scripts and POSTs them to
 *     the backend via REST (/api/ingest)
 *  3. Receives MOCK_RULES_UPDATE from backend and broadcasts to all tabs
 *  4. Maintains per-tab recording state
 *  5. Handles popup communication (status queries, toggle recording)
 */

// ── Config ────────────────────────────────────────────────────────────────────

const BACKEND_URL = "http://127.0.0.1:7890";
const BACKEND_WS  = "ws://127.0.0.1:7890/ws/extension";
const INGEST_URL  = `${BACKEND_URL}/api/ingest`;
const HEALTH_URL  = `${BACKEND_URL}/health`;

const WS_RECONNECT_BASE_MS = 2000;
const WS_RECONNECT_MAX_MS  = 30000;

// ── State ─────────────────────────────────────────────────────────────────────

let ws = null;
let wsReconnectDelay = WS_RECONNECT_BASE_MS;
let wsConnected = false;
let backendAlive = false;

// Per-tab recording state: tabId → boolean
const tabRecording = {};

// Global recording default
let globalRecording = true;

// ── WebSocket Connection ──────────────────────────────────────────────────────

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  try {
    ws = new WebSocket(BACKEND_WS);

    ws.onopen = () => {
      wsConnected = true;
      backendAlive = true;
      wsReconnectDelay = WS_RECONNECT_BASE_MS;
      console.log("[TraceForge] WebSocket connected to backend");
      broadcastStatus();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "MOCK_RULES_UPDATE") {
          handleMockRulesUpdate(msg.rules || []);
        }
      } catch (err) {
        console.warn("[TraceForge] WS message parse error:", err);
      }
    };

    ws.onclose = () => {
      wsConnected = false;
      ws = null;
      console.log(`[TraceForge] WS disconnected. Reconnecting in ${wsReconnectDelay}ms...`);
      broadcastStatus();
      setTimeout(connectWebSocket, wsReconnectDelay);
      wsReconnectDelay = Math.min(wsReconnectDelay * 1.5, WS_RECONNECT_MAX_MS);
    };

    ws.onerror = (err) => {
      console.warn("[TraceForge] WS error:", err);
      backendAlive = false;
    };
  } catch (err) {
    console.warn("[TraceForge] Failed to create WebSocket:", err);
    setTimeout(connectWebSocket, wsReconnectDelay);
  }
}

// ── Ingest Captured Request ────────────────────────────────────────────────────

async function ingestRequest(data, tabId) {
  // Attach tab info
  const payload = {
    ...data,
    tab_id: tabId,
  };

  try {
    const resp = await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      console.warn("[TraceForge] Ingest failed:", resp.status);
    } else {
      backendAlive = true;
    }
  } catch (err) {
    backendAlive = false;
    console.warn("[TraceForge] Backend unreachable:", err.message);
  }
}

// ── Mock Rules Broadcast ──────────────────────────────────────────────────────

async function handleMockRulesUpdate(rules) {
  // Store rules in chrome.storage for content scripts that connect late
  await chrome.storage.session.set({ mockRules: rules });

  // Broadcast to all active tabs
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "MOCK_RULES_UPDATE",
        rules,
      }).catch(() => {
        // Tab may not have content script — ignore
      });
    }
  }
}

// ── Health Check ──────────────────────────────────────────────────────────────

async function checkBackendHealth() {
  try {
    const resp = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) });
    backendAlive = resp.ok;
  } catch (_) {
    backendAlive = false;
  }
  broadcastStatus();
}

// ── Status Broadcast to Popup ─────────────────────────────────────────────────

function broadcastStatus() {
  const status = {
    type: "STATUS_UPDATE",
    wsConnected,
    backendAlive,
    globalRecording,
  };
  // Send to popup if open (will fail silently if popup is closed)
  chrome.runtime.sendMessage(status).catch(() => {});
}

// ── Message Handler ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ── Captured request from content script
  if (message.type === "CAPTURED_REQUEST") {
    const tabId = sender.tab?.id ?? null;
    const isTabRecording = tabId !== null
      ? (tabRecording[tabId] ?? globalRecording)
      : globalRecording;

    if (isTabRecording) {
      ingestRequest(message.data, tabId);
    }
    return false;
  }

  // ── Popup queries current status
  if (message.type === "GET_STATUS") {
    sendResponse({
      wsConnected,
      backendAlive,
      globalRecording,
    });
    return false;
  }

  // ── Popup toggles recording
  if (message.type === "SET_RECORDING") {
    globalRecording = message.recording;
    // Broadcast to all content scripts
    chrome.tabs.query({}).then((tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: "SET_RECORDING",
            recording: globalRecording,
          }).catch(() => {});
        }
      }
    });
    broadcastStatus();
    sendResponse({ ok: true });
    return false;
  }

  // ── Per-tab recording toggle
  if (message.type === "SET_TAB_RECORDING") {
    const { tabId, recording } = message;
    tabRecording[tabId] = recording;
    chrome.tabs.sendMessage(tabId, {
      type: "SET_RECORDING",
      recording,
    }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

// ── Tab Events ─────────────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabRecording[tabId];
});

// ── Initialization ─────────────────────────────────────────────────────────────

// Connect WebSocket on service worker startup
connectWebSocket();

// Periodic health check every 15 seconds
setInterval(checkBackendHealth, 15000);
checkBackendHealth();

console.log("[TraceForge] Background service worker started 🔥");
