import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { localTimeZone } from "./dates.mjs";
import { emptyStats, loadClaudeCodeEvents, loadEvents, loadRawEvents } from "./log-loaders.mjs";
import { configureModelPricing } from "./pricing.mjs";
import { REMOTE_USAGE_EXPORTER_PY } from "./remote-exporter.mjs";

const ARAGORN_RESOURCES_DIR = path.join(os.homedir(), ".aragorn", "resources");
const REMOTE_SOURCE_CACHE_TTL_MS = 90_000;
const REMOTE_SOURCE_CACHE = new Map();
const execFileAsync = promisify(execFile);

export async function resolveUsageSources(args) {
  const config = await readUsageConfig(args.configPath);
  await configureModelPricing(config.pricing, { configPath: args.configPath });
  const localSources = [
    {
      id: "local-codex",
      label: "local Codex",
      host: "local",
      engine: "codex",
      kind: "local-codex",
      root: args.codexHome,
    },
    {
      id: "local-claude-code",
      label: "local Claude Code",
      host: "local",
      engine: "claude-code",
      kind: "local-claude-code",
      root: args.claudeHome,
    },
  ];

  if (args.localOnly) {
    return filterSourceList(localSources, args.sources);
  }

  const remoteSources = [];
  for (const resource of await discoverRemoteResources(args, config)) {
    const resourceId = resource.id;
    const sshHost = resource.ssh?.host || resource.host;
    const resourceLabel = remoteResourceLabel(resource);
    const codexRoot = resource.usage?.codex_home || resource.usage?.codexHome || "~/.codex";
    const claudeRoot = resource.usage?.claude_home || resource.usage?.claudeHome || "~/.claude";
    if (!sshHost) {
      continue;
    }
    remoteSources.push(
      {
        id: `${resourceId}-codex`,
        label: `${resourceLabel} Codex`,
        host: resourceId,
        sshHost,
        engine: "codex",
        kind: "remote-codex",
        root: codexRoot,
      },
      {
        id: `${resourceId}-claude-code`,
        label: `${resourceLabel} Claude Code`,
        host: resourceId,
        sshHost,
        engine: "claude-code",
        kind: "remote-claude-code",
        root: claudeRoot,
      },
    );
  }

  return filterSourceList([...localSources, ...remoteSources], args.sources);
}

function filterSourceList(sources, sourceIds) {
  if (!sourceIds?.length) {
    return sources;
  }
  const allowed = new Set(sourceIds);
  return sources.filter((source) => allowed.has(source.id));
}

async function discoverRemoteResources(args, config = null) {
  const resources = new Map();
  config ||= await readUsageConfig(args.configPath);
  const overrides = normalizeResourceOverrides(config.resourceOverrides);

  for (const resource of config.resources) {
    if (isUsageRemoteResource(resource)) {
      resources.set(resource.id, resource);
    }
  }

  if (args.discoverAragornResources && (config.discoverAragornResources ?? true)) {
    for (const resource of await discoverAragornRemoteResources()) {
      const mergedResource = applyResourceOverride(resource, overrides);
      const existing = resources.get(mergedResource.id);
      resources.set(mergedResource.id, existing ? mergeResource(mergedResource, existing) : mergedResource);
    }
  }

  return [...resources.values()]
    .filter(isUsageRemoteResource)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function mergeResource(base, override) {
  return {
    ...base,
    ...override,
    ssh: { ...(base.ssh || {}), ...(override.ssh || {}) },
    usage: { ...(base.usage || {}), ...(override.usage || {}) },
  };
}

function normalizeResourceOverrides(overrides) {
  return new Map(Object.entries(overrides || {}).map(([id, override]) => [
    normalizeResourceId(id),
    normalizeConfigOverride(override),
  ]));
}

function normalizeConfigOverride(override) {
  if (!override || typeof override !== "object") {
    return {};
  }
  const sshHost = override.sshHost || override.ssh?.host || override.host;
  const usage = compactObject({
    ...(override.usage || {}),
    codex_home: override.codexHome || override.codex_home || override.usage?.codex_home || override.usage?.codexHome,
    claude_home: override.claudeHome || override.claude_home || override.usage?.claude_home || override.usage?.claudeHome,
  });
  return {
    ...override,
    ...(sshHost ? { host: sshHost, ssh: { ...(override.ssh || {}), host: sshHost } } : {}),
    ...(override.label || override.displayName || override.display_name
      ? { label: override.label || override.displayName || override.display_name }
      : {}),
    ...(Object.keys(usage).length ? { usage } : {}),
  };
}

function applyResourceOverride(resource, overrides) {
  return mergeResource(resource, overrides.get(normalizeResourceId(resource.id)) || {});
}

async function discoverAragornRemoteResources() {
  const resources = new Map();
  let files = [];
  try {
    files = await readdir(ARAGORN_RESOURCES_DIR);
  } catch {
    return [];
  }

  await Promise.all(files.filter((file) => file.endsWith(".json") && file !== "index.json").map(async (file) => {
    const resource = await readAragornResource(path.basename(file, ".json"));
    if (!isUsageRemoteResource(resource)) {
      return;
    }
    resources.set(resource.id, resource);
  }));

  return [...resources.values()]
    .filter(isUsageRemoteResource)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export async function readUsageConfig(configPath) {
  const empty = { resources: [], resourceOverrides: {}, history: {} };
  if (!configPath) {
    return empty;
  }
  let parsed;
  try {
    parsed = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return empty;
    }
    throw new Error(`Failed to read usage config ${configPath}: ${error.message}`);
  }
  const resources = [...(parsed.resources || []), ...(parsed.remoteSources || []), ...(parsed.sources || [])]
    .map(normalizeConfigResource)
    .filter(Boolean);
  return {
    discoverAragornResources: typeof parsed.discoverAragornResources === "boolean"
      ? parsed.discoverAragornResources
      : undefined,
    resources,
    resourceOverrides: parsed.resourceOverrides || parsed.overrides || {},
    pricing: readPricingConfig(parsed),
    history: parsed.history || {},
    dbDir: parsed.dbDir,
  };
}

function readPricingConfig(parsed) {
  const pricing = parsed.pricing || parsed.modelPricing || {};
  const providerKeys = [
    "pricingPath",
    "modelPricingPath",
    "pricingUrl",
    "modelPricingUrl",
    "pricingTtlMs",
    "pricingCacheTtlMs",
  ];
  if (!providerKeys.some((key) => parsed[key] !== undefined)) {
    return pricing;
  }
  if (pricing?.models || pricing?.path || pricing?.url) {
    return {
      ...pricing,
      path: pricing.path || parsed.pricingPath || parsed.modelPricingPath,
      url: pricing.url || parsed.pricingUrl || parsed.modelPricingUrl,
      ttlMs: pricing.ttlMs || parsed.pricingTtlMs || parsed.pricingCacheTtlMs,
    };
  }
  return {
    models: pricing,
    path: parsed.pricingPath || parsed.modelPricingPath,
    url: parsed.pricingUrl || parsed.modelPricingUrl,
    ttlMs: parsed.pricingTtlMs || parsed.pricingCacheTtlMs,
  };
}

function normalizeConfigResource(resource) {
  if (!resource || resource.enabled === false || resource.usage?.enabled === false) {
    return null;
  }
  const id = resource.id || resource.name || resource.host;
  const sshHost = resource.sshHost || resource.ssh?.host || resource.host;
  if (!id || !sshHost) {
    return null;
  }
  const usage = compactObject({
    ...(resource.usage || {}),
    enabled: true,
    codex_home: resource.codexHome || resource.codex_home || resource.usage?.codex_home || resource.usage?.codexHome,
    claude_home: resource.claudeHome || resource.claude_home || resource.usage?.claude_home || resource.usage?.claudeHome,
  });
  return {
    ...resource,
    id: normalizeResourceId(id),
    label: resource.label || resource.displayName || resource.display_name || id,
    host: sshHost,
    ssh: { ...(resource.ssh || {}), host: sshHost },
    usage,
  };
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== null && entryValue !== ""),
  );
}

function normalizeResourceId(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

async function readAragornResource(resourceId) {
  const file = path.join(ARAGORN_RESOURCES_DIR, `${resourceId}.json`);
  try {
    const resource = JSON.parse(await readFile(file, "utf8"));
    return { ...resource, id: resource.id || resourceId };
  } catch {
    return null;
  }
}

function isUsageRemoteResource(resource) {
  if (!resource?.id || resource.usage?.enabled === false || resource.redacted) {
    return false;
  }
  if (resource.type && resource.type !== "machine") {
    return false;
  }
  if (resource.health?.status === "unavailable" && resource.usage?.enabled !== true) {
    return false;
  }
  return Boolean(resource.ssh?.host || resource.host);
}

function remoteResourceLabel(resource) {
  if (typeof resource.label === "string" && resource.label.trim()) {
    return resource.label.trim();
  }
  if (typeof resource.display_name === "string" && resource.display_name.trim()) {
    return resource.display_name.trim();
  }
  return resource.id;
}

function sourceMatchesFilters(source, filters = {}) {
  return (!filters.source || filters.source === "all" || source.id === filters.source)
    && (!filters.host || filters.host === "all" || source.host === filters.host)
    && (!filters.engine || filters.engine === "all" || source.engine === filters.engine);
}

export function decorateEvents(events, source) {
  return events.map((event) => ({
    ...event,
    sourceId: source.id,
    sourceLabel: source.label,
    host: source.host,
    engine: source.engine,
    originalSessionId: event.sessionId,
    sessionId: `${source.id}/${event.sessionId}`,
    costUSD: event.costUSD || 0,
  }));
}

function combineStats(results) {
  const stats = emptyStats();
  stats.sourceCount = results.length;
  stats.sourceErrors = 0;
  stats.remoteSources = 0;

  for (const result of results) {
    const sourceStats = result.stats || emptyStats();
    stats.files += sourceStats.files || 0;
    stats.totalFiles += sourceStats.totalFiles || 0;
    stats.skippedFiles += sourceStats.skippedFiles || 0;
    stats.tokenEvents += sourceStats.tokenEvents || 0;
    stats.keptEvents += sourceStats.keptEvents || 0;
    stats.outOfRangeSkipped += sourceStats.outOfRangeSkipped || 0;
    stats.replaySkipped += sourceStats.replaySkipped || 0;
    stats.duplicateSkipped += sourceStats.duplicateSkipped || 0;
    stats.resetCount += sourceStats.resetCount || 0;
    stats.forkedFiles += sourceStats.forkedFiles || 0;
    if (result.source?.sshHost) {
      stats.remoteSources += 1;
    }
    if (!result.ok) {
      stats.sourceErrors += 1;
    }
  }

  return stats;
}

export async function loadAllUsageEvents(args, options = {}, logic = "ccusage") {
  const allSources = await resolveUsageSources(args);
  const sources = allSources.filter((source) => sourceMatchesFilters(source, options.filters));
  const results = await Promise.all(sources.map((source) => loadUsageSource(source, args, options, logic)));
  const events = results.flatMap((result) => decorateEvents(result.events || [], result.source));
  events.sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
  return {
    events,
    stats: combineStats(results),
    sources,
    allSources,
    results,
    sourceStatus: results.map((result) => sourceStatus(result)),
  };
}

async function loadUsageSource(source, args, options, logic) {
  const startedAt = Date.now();
  try {
    let loaded;
    if (source.kind === "local-codex") {
      loaded = logic === "raw" ? await loadRawEvents(source.root, options) : await loadEvents(source.root, options);
    } else if (source.kind === "local-claude-code") {
      loaded = await loadClaudeCodeEvents(source.root, options);
    } else {
      loaded = await loadRemoteUsageSource(source, args, options, logic);
    }
    return {
      ok: true,
      source,
      events: loaded.events,
      stats: loaded.stats,
      durationMs: Date.now() - startedAt,
      cacheHit: Boolean(loaded.cacheHit),
    };
  } catch (error) {
    return {
      ok: false,
      source,
      events: [],
      stats: emptyStats(),
      durationMs: Date.now() - startedAt,
      error: error.message,
    };
  }
}

export function sourceStatus(result) {
  return {
    id: result.source.id,
    label: result.source.label,
    host: result.source.host,
    engine: result.source.engine,
    remote: Boolean(result.source.sshHost),
    ok: result.ok,
    error: result.error || null,
    durationMs: result.durationMs || 0,
    cacheHit: Boolean(result.cacheHit),
    files: result.stats?.files || 0,
    totalFiles: result.stats?.totalFiles || 0,
    events: result.events?.length || 0,
    staleSnapshotEvents: result.staleSnapshotEvents || 0,
    staleSnapshotDates: result.staleSnapshotDates || [],
    staleSnapshotSavedAt: result.staleSnapshotSavedAt || null,
  };
}

function sourceStatusReason(row) {
  if (!row.ok) {
    if ((row.staleSnapshotEvents || 0) > 0) {
      return `${row.error || "Source failed during scan."}. Using saved ${row.staleSnapshotDates?.join(", ") || "snapshot"} data until the source is readable again.`;
    }
    return row.error || "Source failed during scan.";
  }
  if ((row.events || 0) > 0) {
    return null;
  }
  if ((row.totalFiles || 0) === 0) {
    return "No JSONL log files were found for this source path.";
  }
  if ((row.files || 0) === 0) {
    return "No log files matched the selected date range.";
  }
  return "Log files were read, but no usage events matched this view.";
}

export function buildSourceAlerts(sourceStatusRows = []) {
  return sourceStatusRows.flatMap((row) => {
    const reason = sourceStatusReason(row);
    if (!reason) {
      return [];
    }
    return [{
      id: row.id,
      label: row.label,
      host: row.host,
      engine: row.engine,
      remote: row.remote,
      level: row.ok ? "empty" : "error",
      retryable: row.remote || !row.ok,
      reason,
      events: row.events || 0,
      files: row.files || 0,
      totalFiles: row.totalFiles || 0,
      cacheHit: Boolean(row.cacheHit),
      staleSnapshotEvents: row.staleSnapshotEvents || 0,
      staleSnapshotDates: row.staleSnapshotDates || [],
      staleSnapshotSavedAt: row.staleSnapshotSavedAt || null,
    }];
  });
}

async function loadRemoteUsageSource(source, args, options, logic) {
  const cacheKey = JSON.stringify({
    id: source.id,
    sshHost: source.sshHost,
    root: source.root,
    since: options.since,
    until: options.until,
    logic,
  });
  const cached = REMOTE_SOURCE_CACHE.get(cacheKey);
  const ageMs = cached ? Date.now() - cached.storedAt : 0;
  if (!options.forceRefresh && cached && ageMs < REMOTE_SOURCE_CACHE_TTL_MS) {
    return { ...cached.loaded, cacheHit: true };
  }

  const loaded = await exportRemoteUsageSource(source, args, options, logic);
  REMOTE_SOURCE_CACHE.set(cacheKey, { loaded, storedAt: Date.now() });
  return loaded;
}

async function exportRemoteUsageSource(source, args, options, logic) {
  const payload = {
    kind: source.kind === "remote-codex" ? "codex" : "claude-code",
    root: source.root,
    since: options.since || null,
    until: options.until || null,
    logic,
    timeZone: localTimeZone(),
  };
  const scriptB64 = Buffer.from(REMOTE_USAGE_EXPORTER_PY, "utf8").toString("base64");
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const runner = `python3 -c "import base64,sys;exec(base64.b64decode(sys.argv[1]).decode())" ${scriptB64} ${payloadB64}`;
  const connectTimeout = Math.max(5, Math.min(30, Math.ceil(args.remoteTimeoutMs / 1000)));
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      "ssh",
      ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${connectTimeout}`, source.sshHost, runner],
      {
        timeout: args.remoteTimeoutMs,
        maxBuffer: 64 * 1024 * 1024,
      },
    ));
  } catch (error) {
    if (error.killed || error.signal === "SIGTERM") {
      throw new Error(`remote exporter timed out after ${args.remoteTimeoutMs}ms`);
    }
    const stderr = String(error.stderr || "").trim();
    const message = stderr || String(error.message || "remote exporter failed").split("\n")[0];
    throw new Error(message.slice(0, 400));
  }
  const parsed = JSON.parse(stdout);
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  return parsed;
}

export function buildAvailableFilters(sources) {
  return {
    sources: sources.map((source) => ({ id: source.id, label: source.label })),
    hosts: [...new Set(sources.map((source) => source.host))].sort(),
    engines: [...new Set(sources.map((source) => source.engine))].sort(),
  };
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function summarizeRemoteCacheKey(key) {
  const parsed = safeParseJson(key);
  if (!parsed) {
    return { key };
  }
  return {
    id: parsed.id,
    root: parsed.root,
    since: parsed.since,
    until: parsed.until,
    logic: parsed.logic,
  };
}

export function remoteCacheSnapshot() {
  const now = Date.now();
  return {
    ttlMs: REMOTE_SOURCE_CACHE_TTL_MS,
    size: REMOTE_SOURCE_CACHE.size,
    entries: [...REMOTE_SOURCE_CACHE.entries()].map(([key, entry]) => ({
      ...summarizeRemoteCacheKey(key),
      ageMs: now - entry.storedAt,
      events: entry.loaded?.events?.length || 0,
      files: entry.loaded?.stats?.files || 0,
      totalFiles: entry.loaded?.stats?.totalFiles || 0,
    })),
  };
}
