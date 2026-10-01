/**
 * TraceForge - In-Page Interceptor
 *
 * Injected DIRECTLY into the page's JavaScript context (not the extension
 * sandbox), so it can hook window.fetch, XMLHttpRequest, and navigator.sendBeacon
 * before any application code runs.
 *
 * Captured data is sent to content.js via window.postMessage using the
 * channel "__TRACEFORGE__".
 *
 * Security: Only sends data to the extension origin. Never touches external
 * servers. Mock rules are received from the extension via the same channel.
 */

(function () {
  "use strict";

  if (window.__TRACEFORGE_INTERCEPTOR_ACTIVE__) {
    return;
  }
  window.__TRACEFORGE_INTERCEPTOR_ACTIVE__ = true;

  // ── State ────────────────────────────────────────────────────────────────────
  let isRecording = true;           // Controlled by popup toggle
  let activeMockRules = [];         // Pushed from background via content.js
  let domActionLabel = null;        // Label of the last DOM user action
  let domActionBatchId = null;      // UUID grouping a burst of calls
  let domActionTimeout = null;      // Timer to clear batch after idle window

  const DOM_ACTION_WINDOW_MS = 800; // Group calls within 800ms of DOM event

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function generateId() {
    return "tf-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function resolveFullUrl(rawUrl) {
    if (!rawUrl) return "";
    try {
      return new URL(rawUrl, window.location.href).href;
    } catch (_) {
      return String(rawUrl);
    }
  }

  function isTraceForgeInternalUrl(url) {
    if (!url) return false;
    return (
      url.includes(":7890/api/ingest") ||
      url.includes(":7890/api/stats") ||
      url.includes(":7890/health") ||
      url.includes(":7890/ws/") ||
      url.includes(":7890/api/requests") ||
      url.includes(":7890/api/mock-rules")
    );
  }

  function getCurrentActionContext() {
    return {
      action_label: domActionLabel,
      action_batch_id: domActionBatchId,
    };
  }

  function refreshActionBatch(label) {
    domActionLabel = label;
    if (!domActionBatchId) {
      domActionBatchId = generateId();
    }
    clearTimeout(domActionTimeout);
    domActionTimeout = setTimeout(() => {
      domActionLabel = null;
      domActionBatchId = null;
    }, DOM_ACTION_WINDOW_MS);
  }

  function postCapture(data) {
    if (!isRecording) return;
    try {
      window.postMessage({ __TRACEFORGE__: true, type: "CAPTURED_REQUEST", data }, "*");
    } catch (err) {
      console.warn("[TraceForge Interceptor] postMessage error:", err);
    }
  }

  // ── Mock Rule Matching ────────────────────────────────────────────────────────

  function findMatchingRule(method, url) {
    for (const rule of activeMockRules) {
      const methodMatch =
        !rule.match_method ||
        rule.match_method === "*" ||
        rule.match_method.toUpperCase() === method.toUpperCase();

      if (!methodMatch) continue;

      let urlMatch = false;
      if (rule.match_url_is_regex) {
        try {
          urlMatch = new RegExp(rule.match_url_pattern).test(url);
        } catch (_) {
          urlMatch = false;
        }
      } else {
        urlMatch = url.includes(rule.match_url_pattern);
      }

      if (urlMatch) return rule;
    }
    return null;
  }

  async function applyMockRule(rule) {
    if (rule.simulated_delay_ms > 0) {
      await new Promise((r) => setTimeout(r, rule.simulated_delay_ms));
    }

    let bodyText = rule.override_body || "";
    let headers = { "Content-Type": "application/json" };

    try {
      if (rule.override_headers) {
        const parsed = JSON.parse(rule.override_headers);
        headers = { ...headers, ...parsed };
      }
    } catch (_) {}

    return new Response(bodyText, {
      status: rule.override_status_code || 200,
      statusText: rule.override_status_text || "OK",
      headers,
    });
  }

  // ── Body Extraction Helpers ──────────────────────────────────────────────────

  async function extractBodyAsync(body) {
    if (body === null || body === undefined) return null;
    try {
      if (typeof body === "string") return body;
      if (body instanceof URLSearchParams) return body.toString();
      if (typeof FormData !== "undefined" && body instanceof FormData) {
        const entries = {};
        for (const [key, val] of body.entries()) {
          if (typeof File !== "undefined" && val instanceof File) {
            entries[key] = `[File: ${val.name} (${val.size} bytes, ${val.type || "unknown"})]`;
          } else if (typeof Blob !== "undefined" && val instanceof Blob) {
            entries[key] = `[Blob (${val.size} bytes, ${val.type || "unknown"})]`;
          } else {
            entries[key] = val;
          }
        }
        return JSON.stringify(entries, null, 2);
      }
      if (typeof Blob !== "undefined" && body instanceof Blob) {
        return await body.text();
      }
      if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) {
        return new TextDecoder().decode(body);
      }
      if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(body)) {
        return new TextDecoder().decode(body.buffer);
      }
      if (typeof Document !== "undefined" && body instanceof Document) {
        return new XMLSerializer().serializeToString(body);
      }
      if (typeof body === "object") {
        return JSON.stringify(body, null, 2);
      }
      return String(body);
    } catch (_) {
      return String(body);
    }
  }

  function extractBodySync(body) {
    if (body === null || body === undefined) return null;
    try {
      if (typeof body === "string") return body;
      if (body instanceof URLSearchParams) return body.toString();
      if (typeof FormData !== "undefined" && body instanceof FormData) {
        const entries = {};
        for (const [key, val] of body.entries()) {
          if (typeof File !== "undefined" && val instanceof File) {
            entries[key] = `[File: ${val.name} (${val.size} bytes, ${val.type || "unknown"})]`;
          } else if (typeof Blob !== "undefined" && val instanceof Blob) {
            entries[key] = `[Blob (${val.size} bytes, ${val.type || "unknown"})]`;
          } else {
            entries[key] = val;
          }
        }
        return JSON.stringify(entries, null, 2);
      }
      if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) {
        return new TextDecoder().decode(body);
      }
      if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(body)) {
        return new TextDecoder().decode(body.buffer);
      }
      if (typeof Document !== "undefined" && body instanceof Document) {
        return new XMLSerializer().serializeToString(body);
      }
      if (typeof body === "object") {
        return JSON.stringify(body, null, 2);
      }
      return String(body);
    } catch (_) {
      return String(body);
    }
  }

  // ── Fetch Interceptor ─────────────────────────────────────────────────────────

  const _originalFetch = window.fetch ? window.fetch.bind(window) : null;

  if (_originalFetch) {
    window.fetch = async function (input, init) {
      let rawUrl = "";
      if (typeof input === "string") {
        rawUrl = input;
      } else if (input instanceof URL) {
        rawUrl = input.href;
      } else if (typeof Request !== "undefined" && input instanceof Request) {
        rawUrl = input.url;
      } else {
        rawUrl = String(input || "");
      }

      const fullUrl = resolveFullUrl(rawUrl);
      const method = (
        (init && init.method) ||
        (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
      ).toUpperCase();

      // Skip non-http calls (chrome-extension://, data:, etc.) and internal TraceForge calls
      if (
        (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://")) ||
        isTraceForgeInternalUrl(fullUrl)
      ) {
        return init !== undefined ? _originalFetch(input, init) : _originalFetch(input);
      }

      const requestId = generateId();
      const actionCtx = getCurrentActionContext();
      const startTime = performance.now();

      // Read request body safely across all payload types
      let requestBody = null;
      try {
        if (init && init.body !== undefined && init.body !== null) {
          requestBody = await extractBodyAsync(init.body);
        } else if (typeof Request !== "undefined" && input instanceof Request) {
          try {
            const clonedReq = input.clone();
            requestBody = await clonedReq.text();
          } catch (_) {}
        }
      } catch (_) {}

      // Parse request headers
      let requestHeaders = {};
      try {
        const headers = (init && init.headers) || (typeof Request !== "undefined" && input instanceof Request ? input.headers : null);
        if (headers) {
          if (typeof Headers !== "undefined" && headers instanceof Headers) {
            headers.forEach((v, k) => { requestHeaders[k] = v; });
          } else if (Array.isArray(headers)) {
            headers.forEach(([k, v]) => { requestHeaders[k] = v; });
          } else if (typeof headers === "object") {
            requestHeaders = { ...headers };
          }
        }
      } catch (_) {}

      // Check for mock rule
      const mockRule = findMatchingRule(method, fullUrl) || findMatchingRule(method, rawUrl);
      if (mockRule) {
        const mockResponse = await applyMockRule(mockRule);
        const mockBody = await mockResponse.clone().text();
        const duration = performance.now() - startTime;

        postCapture({
          request_id: requestId,
          method,
          url: fullUrl,
          request_headers: requestHeaders,
          request_body: requestBody,
          status_code: mockResponse.status,
          status_text: mockResponse.statusText,
          response_body: mockBody,
          duration_ms: Math.round(duration),
          resource_type: "fetch",
          is_mocked: true,
          ...actionCtx,
        });

        return mockResponse;
      }

      // Real fetch
      let response;
      try {
        response = init !== undefined ? await _originalFetch(input, init) : await _originalFetch(input);
      } catch (err) {
        const duration = performance.now() - startTime;
        postCapture({
          request_id: requestId,
          method,
          url: fullUrl,
          request_headers: requestHeaders,
          request_body: requestBody,
          status_code: null,
          status_text: "Network Error",
          response_body: err.message,
          duration_ms: Math.round(duration),
          resource_type: "fetch",
          ...actionCtx,
        });
        throw err;
      }

      const duration = performance.now() - startTime;
      const responseHeaders = {};
      try {
        if (response.headers) {
          response.headers.forEach((v, k) => { responseHeaders[k] = v; });
        }
      } catch (_) {}

      // Read response body async without blocking the app
      try {
        const cloned = response.clone();
        cloned.text().then((responseBody) => {
          postCapture({
            request_id: requestId,
            method,
            url: fullUrl,
            request_headers: requestHeaders,
            request_body: requestBody,
            status_code: response.status,
            status_text: response.statusText,
            response_headers: responseHeaders,
            response_body: responseBody,
            duration_ms: Math.round(duration),
            resource_type: "fetch",
            ...actionCtx,
          });
        }).catch(() => {
          // Body reading failed (e.g. opaque or binary stream) — still report the request
          postCapture({
            request_id: requestId,
            method,
            url: fullUrl,
            request_headers: requestHeaders,
            request_body: requestBody,
            status_code: response.status,
            status_text: response.statusText,
            response_headers: responseHeaders,
            response_body: "[Response Body Not Decodable]",
            duration_ms: Math.round(duration),
            resource_type: "fetch",
            ...actionCtx,
          });
        });
      } catch (_) {
        // If clone() itself fails (e.g. body already used or locked)
        postCapture({
          request_id: requestId,
          method,
          url: fullUrl,
          request_headers: requestHeaders,
          request_body: requestBody,
          status_code: response.status,
          status_text: response.statusText,
          response_headers: responseHeaders,
          response_body: null,
          duration_ms: Math.round(duration),
          resource_type: "fetch",
          ...actionCtx,
        });
      }

      return response;
    };
  }

  // ── XMLHttpRequest Interceptor ─────────────────────────────────────────────────

  const _OriginalXHR = window.XMLHttpRequest;

  if (_OriginalXHR) {
    function TraceForgeXHR() {
      const xhr = new _OriginalXHR();
      const requestId = generateId();
      let method = "GET";
      let rawUrl = "";
      let fullUrl = "";
      let requestHeaders = {};
      let requestBody = null;
      let startTime = null;
      const actionCtx = getCurrentActionContext();

      const originalOpen = xhr.open.bind(xhr);
      xhr.open = function (m, u, ...rest) {
        method = (m || "GET").toUpperCase();
        rawUrl = u;
        fullUrl = resolveFullUrl(u);
        return originalOpen(m, u, ...rest);
      };

      const originalSetRequestHeader = xhr.setRequestHeader.bind(xhr);
      xhr.setRequestHeader = function (name, value) {
        requestHeaders[name] = value;
        return originalSetRequestHeader(name, value);
      };

      const originalSend = xhr.send.bind(xhr);
      xhr.send = function (body) {
        // Skip non-http calls and internal TraceForge calls
        if (
          (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://")) ||
          isTraceForgeInternalUrl(fullUrl)
        ) {
          return originalSend(body);
        }

        // Extract request body synchronously where possible, or read Blob asynchronously
        requestBody = extractBodySync(body);
        if (typeof Blob !== "undefined" && body instanceof Blob) {
          const reader = new FileReader();
          reader.onload = () => { requestBody = reader.result; };
          try { reader.readAsText(body); } catch (_) {}
        }

        // Check mock rule
        const mockRule = findMatchingRule(method, fullUrl) || findMatchingRule(method, rawUrl);
        if (mockRule) {
          setTimeout(async () => {
            if (mockRule.simulated_delay_ms > 0) {
              await new Promise((r) => setTimeout(r, mockRule.simulated_delay_ms));
            }

            Object.defineProperty(xhr, "status", { get: () => mockRule.override_status_code });
            Object.defineProperty(xhr, "statusText", { get: () => mockRule.override_status_text || "OK" });
            Object.defineProperty(xhr, "responseText", { get: () => mockRule.override_body || "" });
            Object.defineProperty(xhr, "response", { get: () => mockRule.override_body || "" });
            Object.defineProperty(xhr, "readyState", { get: () => 4 });

            postCapture({
              request_id: requestId,
              method,
              url: fullUrl,
              request_headers: requestHeaders,
              request_body: requestBody,
              status_code: mockRule.override_status_code,
              status_text: mockRule.override_status_text || "OK",
              response_body: mockRule.override_body || "",
              duration_ms: mockRule.simulated_delay_ms,
              resource_type: "xhr",
              is_mocked: true,
              ...actionCtx,
            });

            xhr.dispatchEvent(new Event("readystatechange"));
            xhr.dispatchEvent(new Event("load"));
          }, 0);

          return;
        }

        startTime = performance.now();

        xhr.addEventListener("loadend", () => {
          const duration = performance.now() - (startTime || performance.now());
          const responseHeaders = {};
          try {
            const rawHeaders = xhr.getAllResponseHeaders() || "";
            rawHeaders.trim().split(/[\r\n]+/).forEach((line) => {
              const [key, ...rest] = line.split(": ");
              if (key) responseHeaders[key.toLowerCase()] = rest.join(": ");
            });
          } catch (_) {}

          let responseBody = null;
          try {
            if (!xhr.responseType || xhr.responseType === "text") {
              responseBody = xhr.responseText;
            } else if (xhr.responseType === "json") {
              responseBody = typeof xhr.response === "object" ? JSON.stringify(xhr.response, null, 2) : String(xhr.response);
            } else if (xhr.response) {
              responseBody = `[Binary: ${xhr.responseType}]`;
            }
          } catch (_) {
            try { responseBody = String(xhr.response); } catch (_) {}
          }

          postCapture({
            request_id: requestId,
            method,
            url: fullUrl,
            request_headers: requestHeaders,
            request_body: requestBody,
            status_code: xhr.status || null,
            status_text: xhr.statusText || null,
            response_headers: responseHeaders,
            response_body: responseBody,
            duration_ms: Math.round(duration),
            resource_type: "xhr",
            ...actionCtx,
          });
        });

        return originalSend(body);
      };

      return xhr;
    }

    // Preserve all static properties (UNSENT, OPENED, HEADERS_RECEIVED, LOADING, DONE) and prototype
    TraceForgeXHR.prototype = _OriginalXHR.prototype;
    try {
      const descriptors = Object.getOwnPropertyDescriptors(_OriginalXHR);
      for (const key of Object.keys(descriptors)) {
        if (key !== "prototype" && key !== "length" && key !== "name") {
          try {
            Object.defineProperty(TraceForgeXHR, key, descriptors[key]);
          } catch (_) {
            try { TraceForgeXHR[key] = _OriginalXHR[key]; } catch (_) {}
          }
        }
      }
    } catch (_) {}

    TraceForgeXHR.UNSENT = 0;
    TraceForgeXHR.OPENED = 1;
    TraceForgeXHR.HEADERS_RECEIVED = 2;
    TraceForgeXHR.LOADING = 3;
    TraceForgeXHR.DONE = 4;

    window.XMLHttpRequest = TraceForgeXHR;
  }

  // ── Beacon Interceptor ────────────────────────────────────────────────────────

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const _originalSendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      const fullUrl = resolveFullUrl(url);
      if (
        (fullUrl.startsWith("http://") || fullUrl.startsWith("https://")) &&
        !isTraceForgeInternalUrl(fullUrl)
      ) {
        const requestId = generateId();
        const actionCtx = getCurrentActionContext();
        const bodyStr = extractBodySync(data);
        postCapture({
          request_id: requestId,
          method: "POST",
          url: fullUrl,
          request_headers: { "Content-Type": "text/plain;charset=UTF-8" },
          request_body: bodyStr,
          status_code: 200,
          status_text: "Beacon Queued",
          response_body: "[Beacon Dispatched]",
          duration_ms: 0,
          resource_type: "beacon",
          ...actionCtx,
        });
      }
      return _originalSendBeacon(url, data);
    };
  }

  // ── DOM Action Listener ───────────────────────────────────────────────────────
  // Intercepts user clicks and form submits to label subsequent API calls

  document.addEventListener(
    "click",
    (e) => {
      const target = e.target;
      if (!target) return;
      const label =
        target.getAttribute("data-action") ||
        target.getAttribute("aria-label") ||
        target.getAttribute("title") ||
        (target.textContent || "").trim().slice(0, 50) ||
        target.tagName.toLowerCase();

      refreshActionBatch(`click: ${label}`);
    },
    true
  );

  document.addEventListener(
    "submit",
    (e) => {
      const form = e.target;
      const label = form?.getAttribute("name") || form?.id || "form";
      refreshActionBatch(`submit: ${label}`);
    },
    true
  );

  // ── Control Channel ───────────────────────────────────────────────────────────
  // Listen for commands from content.js

  window.addEventListener("message", (event) => {
    if (!event.data || !event.data.__TRACEFORGE__) return;

    const { type, data } = event.data;

    if (type === "SET_RECORDING") {
      isRecording = data.recording;
    }

    if (type === "MOCK_RULES_UPDATE") {
      activeMockRules = data.rules || [];
    }
  });

  window.__traceforge_test__ = async function () {
    console.log("[TraceForge] 🧪 Sending test fetch request...");
    try {
      const res = await fetch("https://jsonplaceholder.typicode.com/todos/1");
      const json = await res.json();
      console.log("[TraceForge] 🧪 Test fetch response:", json);
      return json;
    } catch (err) {
      console.error("[TraceForge] 🧪 Test fetch error:", err);
    }
  };

  console.log("[TraceForge] Interceptor active 🔥 (Run window.__traceforge_test__() to send a test request)");
})();
