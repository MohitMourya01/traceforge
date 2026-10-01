/**
 * TraceForge - Background Service Worker
 *
 * Responsibilities:
 *  1. Maintains a persistent WebSocket connection to the TraceForge backend
 *     (ws://127.0.0.1:7890/ws/extension)
 *  2. Receives captured requests from content scripts and POSTs them to
 *     the backend via REST (/api/ingest)
 *  3. Receives MOCK_RULES_UPDATE from backend and broadcasts to all active tabs
 *  4. Programmatically injects interceptor into existing tabs on startup/reload
 *  5. Maintains per-tab recording state and handles popup queries
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

// ── Programmatic Injection for Open / Existing Tabs ──────────────────────────

async function injectIntoAllTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      if (!tab.url.startsWith("http://") && !tab.url.startsWith("https://")) continue;

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ["inpage-interceptor.js"],
          world: "MAIN",
        });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ["content.js"],
          world: "ISOLATED",
        });
      } catch (_) {
        // Tab might be unloaded, discarded or restricted (chrome webstore, etc.)
      }
    }
  } catch (_) {}
}

// ── Safe Tab Message Broadcast ────────────────────────────────────────────────

async function broadcastToHttpTabs(msg) {
  try {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, msg, () => {
        if (chrome.runtime.lastError) {
          // Tab may not have content script yet or is navigating - safe to ignore
        }
      });
    }
  } catch (_) {}
}

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
        } else if (msg.type === "SET_RECORDING") {
          globalRecording = Boolean(msg.recording);
          broadcastToHttpTabs({
            type: "SET_RECORDING",
            recording: globalRecording,
          });
          broadcastStatus();
        }
      } catch (err) {
        console.warn("[TraceForge] WS message parse error:", err);
      }
    };

    ws.onclose = () => {
      wsConnected = false;
      ws = null;
      broadcastStatus();
      setTimeout(connectWebSocket, wsReconnectDelay);
      wsReconnectDelay = Math.min(wsReconnectDelay * 1.5, WS_RECONNECT_MAX_MS);
    };

    ws.onerror = () => {
      backendAlive = false;
    };
  } catch (err) {
    setTimeout(connectWebSocket, wsReconnectDelay);
  }
}

// ── Ingest Captured Request ────────────────────────────────────────────────────

async function ingestRequest(data, tabId) {
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
      const errText = await resp.text();
      console.warn(`[TraceForge] ❌ Ingest failed (HTTP ${resp.status}):`, errText);
    } else {
      backendAlive = true;
      console.log(`[TraceForge] 🟢 Ingested: ${data.method} ${data.url}`);
    }
  } catch (err) {
    backendAlive = false;
  }
}

// ── Mock Rules Broadcast ──────────────────────────────────────────────────────

async function handleMockRulesUpdate(rules) {
  try {
    if (chrome.storage && chrome.storage.session) {
      await chrome.storage.session.set({ mockRules: rules });
    }
  } catch (_) {}

  broadcastToHttpTabs({
    type: "MOCK_RULES_UPDATE",
    rules,
  });
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
  // Send to popup if open (callback suppresses unhandled lastError)
  chrome.runtime.sendMessage(status, () => {
    if (chrome.runtime.lastError) {
      // Popup is not open — normal
    }
  });
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
    if (sendResponse) sendResponse({ ok: true });
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
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "SET_RECORDING", recording: globalRecording }));
      } catch (_) {}
    }
    broadcastToHttpTabs({
      type: "SET_RECORDING",
      recording: globalRecording,
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
    }, () => {
      if (chrome.runtime.lastError) {}
    });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

// ── Tab Events ─────────────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabRecording[tabId];
});

// On tab navigation / completed loading, verify script injection
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    (tab.url.startsWith("http://") || tab.url.startsWith("https://"))
  ) {
    chrome.tabs.sendMessage(tabId, { type: "PING_TAB" }, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ["inpage-interceptor.js"],
          world: "MAIN",
        }).catch(() => {});
        chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ["content.js"],
          world: "ISOLATED",
        }).catch(() => {});
      }
    });
  }
});

// ── Lifecycle & Initialization ────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  injectIntoAllTabs();
  connectWebSocket();
});

// Connect WebSocket and inject into open tabs on service worker startup
connectWebSocket();
injectIntoAllTabs();

// Periodic health check every 15 seconds
setInterval(checkBackendHealth, 15000);
checkBackendHealth();

console.log("[TraceForge] Background service worker active 🔥");
