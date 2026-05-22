import http from "node:http";

import { renderDashboardPage } from "./dashboard-page.mjs";
import { buildSourceAlerts, remoteCacheSnapshot, resolveUsageSources } from "./sources.mjs";
import { defaultHistoryOptions, isCanonicalHistoryRequest, isHistoricalSavedRange, resolveHistoryOptions } from "./history-store.mjs";
import { pricingModelNames, pricingStatus } from "./pricing.mjs";
import { redactHealthPayload, redactSourcesPayload, redactUsagePayload } from "./redaction.mjs";
import { apiQueryOptions, buildSourcesPayload, buildUsagePayloadForOptions } from "./usage-service.mjs";

const API_CACHE_TTL_MS = 15_000;
const SERVICE_STARTED_AT_MS = Date.now();
const SERVICE_STATE = {
  servedPayloads: 0,
  lastServedAt: null,
  lastGeneratedAt: null,
  lastDurationMs: null,
  lastStats: null,
  lastSourceStatus: [],
  lastFilters: null,
  lastCache: null,
  lastError: null,
  lastErrorAt: null,
};

export async function serveDashboard(args) {
  const getUsagePayload = createUsageCache(args);
  const requestBaseUrl = `http://${formatHostForUrl(args.host)}:${args.port}`;
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", requestBaseUrl);
      if (url.pathname === "/") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(renderDashboardPage());
        return;
      }
      if (url.pathname === "/api/usage") {
        const payload = await getUsagePayload(url);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify(args.redactSensitive ? redactUsagePayload(payload) : payload));
        return;
      }
      if (url.pathname === "/api/sources") {
        const payload = await buildSourcesPayload(args);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify(args.redactSensitive ? redactSourcesPayload(payload) : payload));
        return;
      }
      if (url.pathname === "/api/health") {
        const configuredSources = await resolveUsageSources(args);
        const historyOptions = await resolveHistoryOptions(args);
        const payload = buildHealthPayload(args, getUsagePayload.cacheSnapshot(), configuredSources, historyOptions);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify(args.redactSensitive ? redactHealthPayload(payload) : payload));
        return;
      }
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    } catch (error) {
      recordServiceError(error);
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }));
    }
  });

  await new Promise((resolve) => server.listen(args.port, args.host, resolve));
  console.log(requestBaseUrl);
  if (args.host === "0.0.0.0") {
    console.log(`local: http://127.0.0.1:${args.port}`);
  }
}

function formatHostForUrl(host) {
  const value = String(host || "127.0.0.1");
  return value.includes(":") && !value.startsWith("[") ? `[${value}]` : value;
}

function createUsageCache(args) {
  const cache = new Map();
  const inflight = new Map();

  function keyFor(apiArgs, logic) {
    return JSON.stringify({
      mode: isHistoryPreferredRequest(args, apiArgs, logic) ? "history-preferred" : "live",
      codexHome: args.codexHome,
      claudeHome: args.claudeHome,
      since: apiArgs.since,
      until: apiArgs.until,
      logic,
      filters: apiArgs.filters,
      sources: args.sources,
      localOnly: args.localOnly,
      configPath: args.configPath,
      discoverAragornResources: args.discoverAragornResources,
      appDir: args.appDir,
    });
  }

  function refresh(key, apiArgs, logic) {
    const existing = inflight.get(key);
    if (existing) {
      return existing;
    }

    const promise = buildUsagePayloadForOptions(args, apiArgs, logic)
      .then((payload) => {
        recordGeneratedPayload(payload);
        cache.set(key, { payload, storedAt: Date.now() });
        return payload;
      })
      .catch((error) => {
        recordServiceError(error);
        throw error;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, promise);
    return promise;
  }

  function snapshot() {
    const now = Date.now();
    return {
      ttlMs: API_CACHE_TTL_MS,
      size: cache.size,
      inflight: inflight.size,
      entries: [...cache.entries()].map(([key, value]) => ({
        ...summarizeUsageCacheKey(key),
        ageMs: now - value.storedAt,
        generatedAt: value.payload.generatedAt,
        durationMs: value.payload.durationMs,
        sourceErrors: value.payload.stats?.sourceErrors || 0,
      })),
    };
  }

  async function getUsagePayload(query) {
    const { apiArgs, logic } = apiQueryOptions(args, query);
    const key = keyFor(apiArgs, logic);
    const now = Date.now();
    const cached = cache.get(key);
    const ageMs = cached ? now - cached.storedAt : 0;
    const historyPreferred = isHistoryPreferredRequest(args, apiArgs, logic);

    if (!apiArgs.forceRefresh && cached && ageMs < API_CACHE_TTL_MS && (!historyPreferred || cached.payload.historyOnly)) {
      return withCacheInfo(cached.payload, { hit: true, stale: false, refreshing: false, ageMs });
    }

    if (!apiArgs.forceRefresh && cached && !historyPreferred) {
      refresh(key, apiArgs, logic).catch((error) => {
        console.error(`refresh failed: ${error.message}`);
      });
      return withCacheInfo(cached.payload, {
        hit: true,
        stale: true,
        refreshing: true,
        ageMs,
      });
    }

    const payload = await refresh(key, apiArgs, logic);
    return withCacheInfo(payload, {
      hit: false,
      stale: false,
      refreshing: false,
      forced: Boolean(apiArgs.forceRefresh),
      ageMs: apiArgs.forceRefresh ? 0 : ageMs,
    });
  }

  getUsagePayload.cacheSnapshot = snapshot;
  return getUsagePayload;
}

function buildHealthPayload(args, usageCache, configuredSources, historyOptions = defaultHistoryOptions()) {
  const sourceStatus = SERVICE_STATE.lastSourceStatus || [];
  const sourceErrors = sourceStatus.length
    ? sourceStatus.filter((source) => !source.ok).length
    : (SERVICE_STATE.lastStats?.sourceErrors || 0);
  const stats = SERVICE_STATE.lastStats ? { ...SERVICE_STATE.lastStats, sourceErrors } : null;
  const hasSnapshot = Boolean(SERVICE_STATE.lastGeneratedAt);
  const state = SERVICE_STATE.lastError
    ? "error"
    : (sourceErrors > 0 ? "degraded" : (hasSnapshot ? "ready" : "starting"));

  return {
    ok: state !== "error" && sourceErrors === 0,
    serviceOk: state !== "error",
    sourceOk: sourceErrors === 0,
    state,
    pid: process.pid,
    port: args.port,
    startedAt: new Date(SERVICE_STARTED_AT_MS).toISOString(),
    uptimeSec: Math.floor((Date.now() - SERVICE_STARTED_AT_MS) / 1000),
    servedPayloads: SERVICE_STATE.servedPayloads,
    lastServedAt: SERVICE_STATE.lastServedAt,
    lastGeneratedAt: SERVICE_STATE.lastGeneratedAt,
    lastDurationMs: SERVICE_STATE.lastDurationMs,
    lastFilters: SERVICE_STATE.lastFilters,
    lastStats: stats,
    sourceStatus,
    sourceAlerts: buildSourceAlerts(sourceStatus),
    configuredSources: configuredSources.map((source) => ({
      id: source.id,
      label: source.label,
      host: source.host,
      engine: source.engine,
      remote: Boolean(source.sshHost),
    })),
    lastError: SERVICE_STATE.lastError,
    lastErrorAt: SERVICE_STATE.lastErrorAt,
    cache: {
      lastResponse: SERVICE_STATE.lastCache,
      usage: usageCache,
      remote: remoteCacheSnapshot(),
    },
    config: {
      localOnly: args.localOnly,
      sources: args.sources,
      appDir: args.appDir,
      configPath: args.configPath,
      discoverAragornResources: args.discoverAragornResources,
      remoteTimeoutMs: args.remoteTimeoutMs,
      redactSensitive: args.redactSensitive,
      pricingModels: pricingModelNames(),
      pricing: pricingStatus(),
      historyEnabled: historyOptions.enabled,
      stateDir: historyOptions.stateDir,
      historyRetentionDays: historyOptions.retentionDays,
      historyBackfillDays: historyOptions.backfillDays,
    },
  };
}

function isHistoryPreferredRequest(args, apiArgs, logic) {
  return logic === "ccusage"
    && !apiArgs.forceRefresh
    && isHistoricalSavedRange(apiArgs)
    && isCanonicalHistoryRequest(args, apiArgs, logic);
}

function withCacheInfo(payload, cache) {
  const payloadWithCache = { ...payload, cache };
  recordServedPayload(payloadWithCache);
  return payloadWithCache;
}

function recordGeneratedPayload(payload) {
  SERVICE_STATE.lastGeneratedAt = payload.generatedAt;
  SERVICE_STATE.lastDurationMs = payload.durationMs;
  SERVICE_STATE.lastStats = payload.stats;
  SERVICE_STATE.lastSourceStatus = payload.sourceStatus || [];
  SERVICE_STATE.lastFilters = {
    since: payload.since,
    until: payload.until,
    logic: payload.logic,
    filters: payload.filters,
  };
  SERVICE_STATE.lastError = null;
  SERVICE_STATE.lastErrorAt = null;
}

function recordServedPayload(payload) {
  SERVICE_STATE.servedPayloads += 1;
  SERVICE_STATE.lastServedAt = new Date().toISOString();
  SERVICE_STATE.lastCache = payload.cache || null;
}

function recordServiceError(error) {
  SERVICE_STATE.lastError = String(error?.message || error || "unknown error").slice(0, 500);
  SERVICE_STATE.lastErrorAt = new Date().toISOString();
}

function summarizeUsageCacheKey(key) {
  const parsed = safeParseJson(key);
  if (!parsed) {
    return { key };
  }
  return {
    since: parsed.since,
    until: parsed.until,
    logic: parsed.logic,
    filters: parsed.filters,
    sources: parsed.sources,
    localOnly: parsed.localOnly,
  };
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
