/**
 * TraceForge - Popup Script
 * Communicates with background service worker and updates the popup UI.
 */

const STUDIO_URL = "http://127.0.0.1:5174"; // React dev server
const BACKEND_URL = "http://127.0.0.1:7890";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const backendDot     = document.getElementById("backendDot");
const wsDot          = document.getElementById("wsDot");
const statusBanner   = document.getElementById("statusBanner");
const bannerIcon     = document.getElementById("bannerIcon");
const bannerText     = document.getElementById("bannerText");
const recordingCb    = document.getElementById("recordingCheckbox");
const recordingLabel = document.getElementById("recordingSubLabel");
const statTotalVal   = document.getElementById("statTotalVal");
const statErrorsVal  = document.getElementById("statErrorsVal");
const statSlowVal    = document.getElementById("statSlowVal");
const openStudioBtn  = document.getElementById("openStudio");
const clearBtn       = document.getElementById("clearBtn");

// ── Update UI from status ─────────────────────────────────────────────────────

function applyStatus({ wsConnected, backendAlive, globalRecording }) {
  // Status dots
  backendDot.className = "status-dot " + (backendAlive ? "connected" : "error");
  wsDot.className      = "status-dot " + (wsConnected  ? "connected" : "error");

  // Banner
  if (backendAlive && wsConnected) {
    statusBanner.className = "banner connected";
    bannerIcon.textContent = "✅";
    bannerText.textContent = "Connected · TraceForge is recording";
  } else if (backendAlive) {
    statusBanner.className = "banner";
    bannerIcon.textContent = "🔄";
    bannerText.textContent = "Backend up · WebSocket reconnecting…";
  } else {
    statusBanner.className = "banner error";
    bannerIcon.textContent = "⚠️";
    bannerText.textContent = "Backend offline — start run.py";
  }

  // Recording toggle
  recordingCb.checked = globalRecording;
  recordingLabel.textContent = globalRecording ? "All tabs" : "Paused";
  if (!globalRecording) {
    document.body.classList.add("paused");
  } else {
    document.body.classList.remove("paused");
  }
}

// ── Fetch stats from backend ──────────────────────────────────────────────────

async function fetchStats() {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/stats`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!resp.ok) return;
    const data = await resp.json();
    statTotalVal.textContent  = data.total_requests ?? "—";
    statErrorsVal.textContent = data.error_requests ?? "—";
    statSlowVal.textContent   = data.slow_requests  ?? "—";
  } catch (_) {
    statTotalVal.textContent  = "—";
    statErrorsVal.textContent = "—";
    statSlowVal.textContent   = "—";
  }
}

// ── Query background for current status ──────────────────────────────────────

function refreshStatus() {
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    if (chrome.runtime.lastError) {
      applyStatus({ wsConnected: false, backendAlive: false, globalRecording: true });
      return;
    }
    applyStatus(response);
  });
}

// ── Event Listeners ───────────────────────────────────────────────────────────

recordingCb.addEventListener("change", () => {
  const recording = recordingCb.checked;
  chrome.runtime.sendMessage({ type: "SET_RECORDING", recording }, () => {
    recordingLabel.textContent = recording ? "All tabs" : "Paused";
    if (!recording) {
      document.body.classList.add("paused");
    } else {
      document.body.classList.remove("paused");
    }
  });
});

openStudioBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: STUDIO_URL });
  window.close();
});

clearBtn.addEventListener("click", async () => {
  try {
    clearBtn.textContent = "Clearing…";
    await fetch(`${BACKEND_URL}/api/requests`, {
      method: "DELETE",
      signal: AbortSignal.timeout(3000),
    });
    await fetchStats();
    clearBtn.innerHTML = "<span>🗑</span> Clear";
  } catch (_) {
    clearBtn.innerHTML = "<span>🗑</span> Clear";
  }
});

// ── Listen for background broadcasts ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATUS_UPDATE") {
    applyStatus(message);
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

refreshStatus();
fetchStats();

// Refresh stats every 5 seconds while popup is open
const statsInterval = setInterval(fetchStats, 5000);
window.addEventListener("unload", () => clearInterval(statsInterval));
