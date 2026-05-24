import { createHash } from "node:crypto";

export function redactUsagePayload(payload) {
  return redactObject(payload, {
    host: redactHost,
    label: redactLabel,
    sourceLabel: redactLabel,
    sessionId: hashValue,
    originalSessionId: hashValue,
    sessionFile: () => "(redacted)",
    project: redactProject,
    reason: redactError,
    lastError: redactError,
    error: redactError,
    configPath: () => "(redacted)",
    appDir: () => "(redacted)",
    stateDir: () => "(redacted)",
    path: () => "(redacted)",
  });
}

export function redactSourcesPayload(payload) {
  return redactObject(payload, {
    host: redactHost,
    label: redactLabel,
    configPath: () => "(redacted)",
    appDir: () => "(redacted)",
    stateDir: () => "(redacted)",
    path: () => "(redacted)",
  });
}

export function redactHealthPayload(payload) {
  return {
    ok: payload.ok,
    serviceOk: payload.serviceOk,
    sourceOk: payload.sourceOk,
    state: payload.state,
    port: payload.port,
    startedAt: payload.startedAt,
    uptimeSec: payload.uptimeSec,
    servedPayloads: payload.servedPayloads,
    lastServedAt: payload.lastServedAt,
    lastGeneratedAt: payload.lastGeneratedAt,
    lastDurationMs: payload.lastDurationMs,
    lastStats: payload.lastStats,
    sourceAlerts: (payload.sourceAlerts || []).map((alert) => ({
      id: alert.id,
      engine: alert.engine,
      remote: alert.remote,
      level: alert.level,
      retryable: alert.retryable,
      events: alert.events,
      files: alert.files,
      totalFiles: alert.totalFiles,
      staleSnapshotEvents: alert.staleSnapshotEvents,
    })),
    configuredSourceCount: payload.configuredSources?.length || 0,
    lastError: payload.lastError ? "(redacted)" : null,
    lastErrorAt: payload.lastErrorAt,
    cache: {
      lastResponse: payload.cache?.lastResponse || null,
      usage: payload.cache?.usage ? {
        ttlMs: payload.cache.usage.ttlMs,
        size: payload.cache.usage.size,
        inflight: payload.cache.usage.inflight,
      } : null,
      remote: payload.cache?.remote ? {
        ttlMs: payload.cache.remote.ttlMs,
        size: payload.cache.remote.size,
      } : null,
    },
    config: {
      localOnly: payload.config?.localOnly,
      sourceFilterCount: payload.config?.sources?.length || 0,
      discoverAragornResources: payload.config?.discoverAragornResources,
      remoteTimeoutMs: payload.config?.remoteTimeoutMs,
      pricingModels: payload.config?.pricingModels || [],
      pricing: redactPricingStatus(payload.config?.pricing),
      historyEnabled: payload.config?.historyEnabled,
      historyRetentionDays: payload.config?.historyRetentionDays,
      historyBackfillDays: payload.config?.historyBackfillDays,
      redacted: true,
    },
  };
}

export function redactPricingStatus(status = {}) {
  return {
    configuredModels: status.configuredModels || [],
    configuredModelCount: status.configuredModelCount || 0,
    loadedAt: status.loadedAt || null,
    ttlMs: status.ttlMs || null,
    sources: (status.sources || []).map((source) => ({
      type: source.type,
      modelCount: source.modelCount,
      cacheHit: source.cacheHit,
      stale: source.stale,
      fetchedAt: source.fetchedAt,
      redacted: source.path || source.url ? true : undefined,
    })),
    errors: (status.errors || []).map(() => "(redacted pricing error)"),
  };
}

function redactObject(value, redactors) {
  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item, redactors));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => {
    const redactor = redactors[key];
    if (redactor) {
      return [key, redactor(entryValue)];
    }
    if (key === "hosts" && Array.isArray(entryValue) && entryValue.every((item) => typeof item === "string")) {
      return [key, entryValue.map(redactHost)];
    }
    if (key === "pricing") {
      return [key, redactPricingStatus(entryValue)];
    }
    return [key, redactObject(entryValue, redactors)];
  }));
}

function hashValue(value) {
  const input = String(value || "");
  if (!input || input === "(unknown)") {
    return input || "(unknown)";
  }
  return `redacted-${createHash("sha256").update(input).digest("hex").slice(0, 10)}`;
}

function redactProject(value) {
  return value && value !== "(unknown)" ? "(redacted project)" : "(unknown)";
}

function redactHost(value) {
  return value ? "(redacted host)" : value;
}

function redactLabel(value) {
  return value ? "(redacted source)" : value;
}

function redactError(value) {
  return value ? "(redacted)" : value;
}
