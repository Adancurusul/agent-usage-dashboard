import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildDaily, buildHourly, buildPricingCoverage, cleanDailyRow, cleanHourlyRows, finalizeUsageRowCosts, hourlyRowsForDate, stripHourlyHistory, summarizeRows } from "./aggregates.mjs";
import { appConfigPath, appDbDir, DEFAULT_HISTORY_BACKFILL_DAYS, DEFAULT_STATE_DIR, expandHome } from "./cli-args.mjs";
import { printHistoryRows, publicSource } from "./cli-output.mjs";
import { dateDaysAgo, inRange, localTimeZone, shiftDateKey, todayKey } from "./dates.mjs";
import { emptyStats } from "./log-loaders.mjs";
import { configureModelPricing } from "./pricing.mjs";
import { buildAvailableFilters, buildSourceAlerts, decorateEvents, loadAllUsageEvents, readUsageConfig, resolveUsageSources, sourceStatus } from "./sources.mjs";
import { emptyUsage, finiteNumber, USAGE_FIELDS } from "./usage-math.mjs";

const HISTORY_BACKFILLS = new Map();

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function defaultHistoryOptions() {
  return {
    enabled: true,
    stateDir: DEFAULT_STATE_DIR,
    retentionDays: 180,
    backfillDays: DEFAULT_HISTORY_BACKFILL_DAYS,
  };
}

function defaultInitAppDir(args) {
  return expandHome(args.appDir || path.join(os.homedir(), ".agent-usage-dashboard"));
}

function defaultAppConfig() {
  return {
    discoverAragornResources: true,
    resourceOverrides: {},
    resources: [],
    dbDir: "./db",
    history: {
      enabled: true,
      dbDir: "./db",
      retentionDays: 180,
      backfillDays: DEFAULT_HISTORY_BACKFILL_DAYS,
    },
    pricing: {
      models: {},
      ttlMs: 24 * 60 * 60 * 1000,
    },
  };
}

export async function initAppDirectory(args) {
  const appDir = defaultInitAppDir(args);
  const configPath = appConfigPath(appDir);
  const dbDir = appDbDir(appDir);
  await mkdir(dbDir, { recursive: true });

  let createdConfig = false;
  try {
    await readFile(configPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    await writeJsonAtomic(configPath, defaultAppConfig());
    createdConfig = true;
  }

  const result = {
    appDir,
    configPath,
    dbDir,
    createdConfig,
    next: [
      `agent-usage-dashboard serve --app-dir ${appDir} --port 8790`,
      `agent-usage-dashboard usage --app-dir ${appDir} --json`,
      `agent-usage-dashboard sources --app-dir ${appDir} --json`,
    ],
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`app_dir=${appDir}`);
  console.log(`config=${configPath}${createdConfig ? " created" : " exists"}`);
  console.log(`db=${dbDir}`);
  console.log(`serve: ${result.next[0]}`);
}

export async function resolveHistoryOptions(args) {
  const config = await readUsageConfig(args.configPath);
  await configureModelPricing(config.pricing, { configPath: args.configPath });
  const configHistory = config.history || {};
  const retentionDays = Number.isFinite(args.historyRetentionDays)
    ? args.historyRetentionDays
    : defaultHistoryOptions().retentionDays;
  const backfillDays = Number.isFinite(args.historyBackfillDays)
    ? args.historyBackfillDays
    : defaultHistoryOptions().backfillDays;
  const configuredDbDir = configHistory.dbDir || configHistory.stateDir || config.dbDir;
  return {
    enabled: args.historyEnabled && configHistory.enabled !== false,
    stateDir: configuredDbDir
      ? resolvePathFromConfig(configuredDbDir, args.configPath)
      : expandHome(args.stateDir || defaultHistoryOptions().stateDir),
    retentionDays: Number.isFinite(Number(configHistory.retentionDays))
      ? Number(configHistory.retentionDays)
      : retentionDays,
    backfillDays: Number.isFinite(Number(configHistory.backfillDays))
      ? Number(configHistory.backfillDays)
      : backfillDays,
  };
}

function resolvePathFromConfig(value, configPath) {
  const expanded = expandHome(value);
  if (path.isAbsolute(expanded)) {
    return expanded;
  }
  return path.resolve(path.dirname(configPath || process.cwd()), expanded);
}

function historyDailyDir(options) {
  return path.join(options.stateDir, "history", "daily");
}

function snapshotPathForDate(options, date) {
  return path.join(historyDailyDir(options), `${date}.json`);
}

function sourceHistoryDir(options, sourceId) {
  return path.join(options.stateDir, "history", "sources", sourceId);
}

function sourceSnapshotPathForDate(options, sourceId, date) {
  return path.join(sourceHistoryDir(options, sourceId), `${date}.json`);
}

function historyBackfillDir(options) {
  return path.join(options.stateDir, "history", "backfills");
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

function backfillMarkerPath(options, key) {
  return path.join(historyBackfillDir(options), `${hashText(key)}.json`);
}

export function isCanonicalHistoryRequest(args, apiArgs, logic) {
  const filters = apiArgs.filters || {};
  return logic === "ccusage"
    && !args.localOnly
    && !args.sources?.length
    && (!filters.source || filters.source === "all")
    && (!filters.host || filters.host === "all")
    && (!filters.engine || filters.engine === "all");
}

async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmpFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpFile, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmpFile, file);
}

async function readDailySnapshotRecord(options, date) {
  try {
    return safeParseJson(await readFile(snapshotPathForDate(options, date), "utf8"));
  } catch {
    return null;
  }
}

function cleanSourceAlerts(rows = []) {
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    host: row.host,
    engine: row.engine,
    remote: Boolean(row.remote),
    level: row.level || "error",
    retryable: row.retryable !== false,
    reason: String(row.reason || "").slice(0, 500),
    events: finiteNumber(row.events),
    files: finiteNumber(row.files),
    totalFiles: finiteNumber(row.totalFiles),
    cacheHit: Boolean(row.cacheHit),
    staleSnapshotEvents: finiteNumber(row.staleSnapshotEvents),
    staleSnapshotDates: Array.isArray(row.staleSnapshotDates) ? row.staleSnapshotDates.slice(0, 20) : [],
    staleSnapshotSavedAt: row.staleSnapshotSavedAt || null,
  }));
}

function cleanSourceStatusRows(rows = []) {
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    host: row.host,
    engine: row.engine,
    remote: Boolean(row.remote),
    ok: Boolean(row.ok),
    error: row.error ? String(row.error).slice(0, 500) : null,
    durationMs: finiteNumber(row.durationMs),
    cacheHit: Boolean(row.cacheHit),
    files: finiteNumber(row.files),
    totalFiles: finiteNumber(row.totalFiles),
    events: finiteNumber(row.events),
    staleSnapshotEvents: finiteNumber(row.staleSnapshotEvents),
    staleSnapshotDates: Array.isArray(row.staleSnapshotDates) ? row.staleSnapshotDates.slice(0, 20) : [],
    staleSnapshotSavedAt: row.staleSnapshotSavedAt || null,
  }));
}

export async function persistDailyHistory(options, payload, persistOptions = {}) {
  const savedDates = [];
  const sourceErrors = payload.stats?.sourceErrors || 0;
  const allowIncomplete = Boolean(persistOptions.allowIncomplete);
  if (!options.enabled) {
    return savedDates;
  }
  await mkdir(historyDailyDir(options), { recursive: true });
  for (const row of payload.daily || []) {
    if (!row.date) {
      continue;
    }
    const existing = await readDailySnapshotRecord(options, row.date);
    if (
      sourceErrors > 0
      && !allowIncomplete
      && (!existing || (existing.complete !== false && dailyRowHasDetailedBreakdowns(existing.row)))
    ) {
      continue;
    }
    const existingGeneratedAt = Date.parse(existing?.generatedAt || existing?.savedAt || "");
    const payloadGeneratedAt = Date.parse(payload.generatedAt || "");
    if (Number.isFinite(existingGeneratedAt) && Number.isFinite(payloadGeneratedAt) && existingGeneratedAt > payloadGeneratedAt) {
      continue;
    }
    const record = {
      schemaVersion: 2,
      kind: "daily-usage-snapshot",
      date: row.date,
      complete: sourceErrors === 0,
      savedAt: new Date().toISOString(),
      generatedAt: payload.generatedAt,
      timeZone: payload.timeZone,
      logic: payload.logic,
      row: cleanDailyRow(row),
      hourly: hourlyRowsForDate(payload.hourly || [], row.date),
      stats: {
        sourceCount: payload.stats?.sourceCount || 0,
        remoteSources: payload.stats?.remoteSources || 0,
        sourceErrors,
        sourceAlerts: cleanSourceAlerts(payload.sourceAlerts || []),
        sourceStatus: cleanSourceStatusRows(payload.sourceStatus || []),
      },
    };
    await writeJsonAtomic(snapshotPathForDate(options, row.date), record);
    savedDates.push(row.date);
  }
  await pruneHistory(options);
  return savedDates;
}

export async function persistSourceSnapshots(options, results, apiArgs, payload) {
  const saved = [];
  if (!options.enabled || payload.logic !== "ccusage") {
    return saved;
  }
  for (const result of results || []) {
    if (!result.ok || !result.source) {
      continue;
    }
    const events = decorateEvents(result.events || [], result.source);
    const rows = buildDaily(events, apiArgs);
    const hourly = buildHourly(events, apiArgs);
    for (const row of rows) {
      if (!row.date) {
        continue;
      }
      const existing = await readSourceSnapshotRecord(options, result.source.id, row.date);
      const existingGeneratedAt = Date.parse(existing?.generatedAt || existing?.savedAt || "");
      const payloadGeneratedAt = Date.parse(payload.generatedAt || "");
      if (Number.isFinite(existingGeneratedAt) && Number.isFinite(payloadGeneratedAt) && existingGeneratedAt > payloadGeneratedAt) {
        continue;
      }
      const record = {
        schemaVersion: 2,
        kind: "source-daily-usage-snapshot",
        source: publicSource(result.source),
        date: row.date,
        savedAt: new Date().toISOString(),
        generatedAt: payload.generatedAt,
        timeZone: payload.timeZone,
        logic: payload.logic,
        row: cleanDailyRow(row),
        hourly: hourlyRowsForDate(hourly, row.date),
      };
      await writeJsonAtomic(sourceSnapshotPathForDate(options, result.source.id, row.date), record);
      saved.push(`${result.source.id}:${row.date}`);
    }
  }
  await pruneSourceHistory(options);
  return saved;
}

async function readSourceSnapshotRecord(options, sourceId, date) {
  try {
    return safeParseJson(await readFile(sourceSnapshotPathForDate(options, sourceId, date), "utf8"));
  } catch {
    return null;
  }
}

async function readSourceSnapshots(options, source, since, until) {
  if (!options.enabled || !source?.id) {
    return [];
  }
  let files = [];
  try {
    files = await readdir(sourceHistoryDir(options, source.id));
  } catch {
    return [];
  }
  const records = [];
  for (const file of files.filter((entry) => entry.endsWith(".json")).sort()) {
    const date = file.slice(0, -5);
    if (!inRange(date, since, until)) {
      continue;
    }
    try {
      const record = safeParseJson(await readFile(path.join(sourceHistoryDir(options, source.id), file), "utf8"));
      if (record?.row?.date) {
        records.push(record);
      }
    } catch {
      // Ignore corrupt snapshots; the live source error is reported separately.
    }
  }
  return records;
}

function timestampForDateKey(date) {
  if (date >= todayKey()) {
    return new Date().toISOString();
  }
  const [year, month, day] = String(date).split("-").map((part) => Number.parseInt(part, 10));
  return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
}

function snapshotRecordToEvents(record, source) {
  const row = finalizeUsageRowCosts(record.row || {});
  const hourly = cleanHourlyRows(record.hourly || []);
  if (Array.isArray(row.sessions) && row.sessions.length > 0) {
    return snapshotGroupsToEvents(record, source, row, row.sessions, "session", hourly);
  }
  if (Array.isArray(row.projects) && row.projects.length > 0) {
    return snapshotGroupsToEvents(record, source, row, row.projects, "project", hourly);
  }
  return [snapshotGroupToEvent(record, source, row, row, "(saved snapshot)", "summary/0")];
}

function snapshotGroupsToEvents(record, source, row, groups, kind, hourly = []) {
  return groups.flatMap((group, index) => {
    const modelEntries = storedModelEntries(group.models);
    const suffix = `${kind}/${index}`;
    if (!modelEntries.length) {
      if (hourly.length > 0) {
        return distributeSnapshotGroupAcrossHours(record, source, row, group, "(saved snapshot)", suffix, hourly);
      }
      return [snapshotGroupToEvent(record, source, row, group, "(saved snapshot)", suffix)];
    }
    return modelEntries.flatMap(([model, usage], modelIndex) => {
      const modelGroup = { ...group, ...usage };
      if (hourly.length > 0) {
        return distributeSnapshotGroupAcrossHours(record, source, row, modelGroup, model, `${suffix}/model/${modelIndex}`, hourly);
      }
      return [snapshotGroupToEvent(record, source, row, modelGroup, model, `${suffix}/model/${modelIndex}`)];
    });
  });
}

const SNAPSHOT_EVENT_FIELDS = [
  "inputTokens",
  "cachedInputTokens",
  "cacheCreationInputTokens",
  "outputTokens",
  "cachedOutputTokens",
  "reasoningOutputTokens",
  "totalTokens",
  "costUSD",
  "eventCostUSD",
];

function distributeSnapshotGroupAcrossHours(record, source, row, group, model, suffix, hourly) {
  const total = finiteNumber(row.totalTokens);
  if (total <= 0) {
    return [snapshotGroupToEvent(record, source, row, group, model, suffix)];
  }
  const remaining = Object.fromEntries(SNAPSHOT_EVENT_FIELDS.map((field) => [field, finiteNumber(group[field])]));
  return hourly.map((hourRow, index) => {
    const last = index === hourly.length - 1;
    const ratio = finiteNumber(hourRow.totalTokens) / total;
    const usage = {};
    for (const field of SNAPSHOT_EVENT_FIELDS) {
      usage[field] = last ? remaining[field] : Math.max(0, Math.round(finiteNumber(group[field]) * ratio));
      remaining[field] = Math.max(0, remaining[field] - usage[field]);
    }
    return snapshotGroupToEvent(record, source, row, usage, model, `${suffix}/hour/${index}`, hourTimestamp(hourRow.hour), group);
  }).filter((event) => finiteNumber(event.totalTokens) > 0);
}

function hourTimestamp(hour) {
  const match = String(hour || "").match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):/);
  if (!match) {
    return null;
  }
  const [, year, month, day, hourPart] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hourPart), 0, 0, 0).toISOString();
}

function storedModelEntries(models = {}) {
  return Object.entries(models || {}).filter(([, usage]) => (
    finiteNumber(usage.inputTokens) > 0
    || finiteNumber(usage.cachedInputTokens) > 0
    || finiteNumber(usage.cacheCreationInputTokens) > 0
    || finiteNumber(usage.outputTokens) > 0
    || finiteNumber(usage.cachedOutputTokens) > 0
    || finiteNumber(usage.reasoningOutputTokens) > 0
    || finiteNumber(usage.totalTokens) > 0
  ));
}

function snapshotGroupToEvent(record, source, row, group, model, suffix, timestamp = null, meta = group) {
  return {
    sessionId: meta.sessionId || `${source.id}/saved-snapshot/${row.date}/${suffix}`,
    originalSessionId: meta.originalSessionId || `saved-snapshot/${row.date}/${suffix}`,
    sessionFile: meta.sessionFile || `${row.date}.json`,
    project: meta.project || "(saved source snapshot)",
    sourceId: source.id,
    sourceLabel: source.label,
    host: meta.host || source.host,
    engine: meta.engine || source.engine,
    timestamp: timestamp || timestampForDateKey(row.date),
    model,
    inputTokens: finiteNumber(group.inputTokens),
    cachedInputTokens: finiteNumber(group.cachedInputTokens),
    cacheCreationInputTokens: finiteNumber(group.cacheCreationInputTokens),
    outputTokens: finiteNumber(group.outputTokens),
    cachedOutputTokens: finiteNumber(group.cachedOutputTokens),
    reasoningOutputTokens: finiteNumber(group.reasoningOutputTokens),
    totalTokens: finiteNumber(group.totalTokens),
    costUSD: finiteNumber(group.costUSD),
    eventCostUSD: finiteNumber(group.eventCostUSD || group.costUSD),
    fromSourceSnapshot: true,
    snapshotSavedAt: record.savedAt || null,
  };
}

export async function staleSnapshotEventsForFailedSources(options, results, apiArgs) {
  const events = [];
  const staleBySource = new Map();
  for (const result of results || []) {
    if (result.ok || !result.source) {
      continue;
    }
    const records = await readSourceSnapshots(options, result.source, apiArgs.since, apiArgs.until);
    if (!records.length) {
      continue;
    }
    const snapshotEvents = records.flatMap((record) => snapshotRecordToEvents(record, result.source));
    events.push(...snapshotEvents);
    staleBySource.set(result.source.id, {
      events: snapshotEvents.length,
      dates: records.map((record) => record.date),
      savedAt: records.at(-1)?.savedAt || null,
    });
  }
  return { events, staleBySource };
}

export function applyStaleSnapshotStatus(results, staleBySource) {
  for (const result of results || []) {
    const stale = staleBySource.get(result.source?.id);
    if (!stale) {
      continue;
    }
    result.staleSnapshotEvents = stale.events;
    result.staleSnapshotDates = stale.dates;
    result.staleSnapshotSavedAt = stale.savedAt;
  }
}

function historyTrendRange(options, apiArgs) {
  const until = apiArgs.until || todayKey();
  const backfillDays = Math.max(1, Math.min(options.backfillDays || 1, options.retentionDays || options.backfillDays || 1));
  const trendSince = shiftDateKey(until, -(backfillDays - 1));
  return {
    since: trendSince,
    until,
  };
}

async function pruneHistory(options) {
  if (!options.enabled || !Number.isFinite(options.retentionDays) || options.retentionDays <= 0) {
    return;
  }
  const cutoff = dateDaysAgo(options.retentionDays);
  let files = [];
  try {
    files = await readdir(historyDailyDir(options));
  } catch {
    return;
  }
  await Promise.all(files.filter((file) => file.endsWith(".json") && file.slice(0, 10) < cutoff).map((file) => (
    rm(path.join(historyDailyDir(options), file), { force: true })
  )));
}

async function pruneSourceHistory(options) {
  if (!options.enabled || !Number.isFinite(options.retentionDays) || options.retentionDays <= 0) {
    return;
  }
  const cutoff = dateDaysAgo(options.retentionDays);
  let sourceIds = [];
  const root = path.join(options.stateDir, "history", "sources");
  try {
    sourceIds = await readdir(root);
  } catch {
    return;
  }
  await Promise.all(sourceIds.map(async (sourceId) => {
    let files = [];
    try {
      files = await readdir(path.join(root, sourceId));
    } catch {
      return;
    }
    await Promise.all(files.filter((file) => file.endsWith(".json") && file.slice(0, 10) < cutoff).map((file) => (
      rm(path.join(root, sourceId, file), { force: true })
    )));
  }));
}

export async function countSourceSnapshots(options, since, until) {
  if (!options.enabled) {
    return 0;
  }
  const root = path.join(options.stateDir, "history", "sources");
  let sourceIds = [];
  try {
    sourceIds = await readdir(root);
  } catch {
    return 0;
  }
  let count = 0;
  for (const sourceId of sourceIds) {
    let files = [];
    try {
      files = await readdir(path.join(root, sourceId));
    } catch {
      continue;
    }
    count += files.filter((file) => file.endsWith(".json") && inRange(file.slice(0, -5), since, until)).length;
  }
  return count;
}

export async function readDailyHistory(options, since, until, readOptions = {}) {
  if (!options.enabled) {
    return [];
  }
  const includeHourly = Boolean(readOptions.includeHourly);
  let files = [];
  try {
    files = await readdir(historyDailyDir(options));
  } catch {
    return [];
  }
  const rows = [];
  for (const file of files.filter((entry) => entry.endsWith(".json")).sort()) {
    const date = file.slice(0, -5);
    if (!inRange(date, since, until)) {
      continue;
    }
    let record = null;
    try {
      record = safeParseJson(await readFile(path.join(historyDailyDir(options), file), "utf8"));
    } catch {
      continue;
    }
    if (record?.row?.date) {
      const sourceErrors = record.stats?.sourceErrors || 0;
      const row = finalizeUsageRowCosts(record.row);
      const hourly = includeHourly
        ? cleanHourlyRows(record.hourly || record.row.hourly || []).map((hourlyRow) => finalizeUsageRowCosts(hourlyRow))
        : [];
      rows.push({
        ...row,
        fromHistory: true,
        complete: record.complete !== false,
        partial: record.complete === false || sourceErrors > 0,
        sourceErrors,
        sourceAlerts: record.stats?.sourceAlerts || [],
        sourceStatus: record.stats?.sourceStatus || [],
        savedAt: record.savedAt,
        generatedAt: record.generatedAt,
        ...(includeHourly ? {
          hourly,
          hourlySaved: Array.isArray(record.hourly) || Array.isArray(record.row.hourly),
        } : {}),
      });
    }
  }
  return rows;
}

function backfillSourceFingerprint(sources) {
  return (sources || [])
    .map((source) => ({
      id: source.id,
      kind: source.kind,
      root: source.root,
      remote: Boolean(source.sshHost),
      sshHost: source.sshHost || null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function backfillCacheKey(args, range, sources) {
  return JSON.stringify({
    configPath: args.configPath,
    stateDir: args.stateDir,
    since: range.since,
    until: range.until,
    sources: args.sources,
    localOnly: args.localOnly,
    discoveredSources: backfillSourceFingerprint(sources),
  });
}

async function readBackfillMarker(options, key) {
  try {
    return safeParseJson(await readFile(backfillMarkerPath(options, key), "utf8"));
  } catch {
    return null;
  }
}

async function writeBackfillMarker(options, key, result) {
  const record = {
    schemaVersion: 1,
    kind: "history-backfill-marker",
    keyHash: hashText(key),
    savedAt: new Date().toISOString(),
    since: result.since,
    until: result.until,
    savedDates: result.savedDates,
    sourceSavedCount: result.sourceSaved?.length || 0,
    sourceErrors: result.sourceErrors || 0,
  };
  await writeJsonAtomic(backfillMarkerPath(options, key), record);
}

function sourceErrorDetails(results) {
  return (results || [])
    .filter((result) => !result.ok && result.source)
    .map((result) => ({
      id: result.source.id,
      label: result.source.label,
      host: result.source.host,
      engine: result.source.engine,
      error: String(result.error || "unknown error").slice(0, 500),
    }));
}

async function maybeBackfillHistory(args, apiArgs, logic, options, canonical) {
  const empty = {
    ran: false,
    skipped: true,
    savedDates: [],
    sourceSaved: [],
    reason: null,
    sourceErrors: 0,
    sourceErrorDetails: [],
  };
  if (!canonical || logic !== "ccusage" || !options.enabled || (options.backfillDays || 0) <= 1) {
    return empty;
  }
  if (!apiArgs.forceRefresh) {
    return { ...empty, reason: "history backfill deferred until manual refresh" };
  }
  const range = historyTrendRange(options, apiArgs);
  const sources = await resolveUsageSources(args);
  const key = backfillCacheKey(args, range, sources);
  const previous = HISTORY_BACKFILLS.get(key);
  if (previous && Date.now() - previous.ranAt < 60 * 60 * 1000) {
    return { ...empty, reason: "recently backfilled" };
  }
  const marker = await readBackfillMarker(options, key);
  if (marker?.kind === "history-backfill-marker" && marker.sourceErrors === 0) {
    return {
      ...empty,
      reason: "history backfill already completed",
      since: marker.since,
      until: marker.until,
      savedDates: marker.savedDates || [],
    };
  }

  const backfillArgs = {
    ...apiArgs,
    since: range.since,
    until: range.until,
    forceRefresh: false,
    filters: {
      source: "all",
      host: "all",
      engine: "all",
    },
  };
  const loaded = await loadAllUsageEvents(args, backfillArgs, logic);
  const staleSnapshots = await staleSnapshotEventsForFailedSources(options, loaded.results, backfillArgs);
  applyStaleSnapshotStatus(loaded.results, staleSnapshots.staleBySource);
  const sourceStatusRows = loaded.results.map((result) => sourceStatus(result));
  const events = [...loaded.events, ...staleSnapshots.events]
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
  const daily = buildDaily(events, backfillArgs);
  const hourly = buildHourly(events, backfillArgs);
  const payload = {
    logic,
    since: backfillArgs.since,
    until: backfillArgs.until,
    filters: backfillArgs.filters,
    timeZone: localTimeZone(),
    generatedAt: new Date().toISOString(),
    daily,
    hourly,
    sourceStatus: sourceStatusRows,
    sourceAlerts: buildSourceAlerts(sourceStatusRows),
    staleSnapshotEvents: staleSnapshots.events.length,
    stats: loaded.stats,
  };
  const savedDates = await persistDailyHistory(options, payload, { allowIncomplete: true });
  const sourceSaved = await persistSourceSnapshots(options, loaded.results, backfillArgs, payload);
  const result = {
    ran: true,
    skipped: false,
    since: range.since,
    until: range.until,
    savedDates,
    sourceSaved,
    sourceErrors: loaded.stats?.sourceErrors || 0,
    sourceErrorDetails: sourceErrorDetails(loaded.results),
  };
  HISTORY_BACKFILLS.set(key, { ...result, ranAt: Date.now() });
  if (result.sourceErrors === 0) {
    await writeBackfillMarker(options, key, result);
  }
  return result;
}

function mergeDailyRows(historyRows, liveRows) {
  const rows = new Map();
  for (const row of historyRows || []) {
    rows.set(row.date, row);
  }
  for (const row of liveRows || []) {
    rows.set(row.date, { ...row, fromHistory: false });
  }
  return [...rows.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function addStoredUsage(target, row) {
  for (const field of USAGE_FIELDS) {
    target[field] += finiteNumber(row?.[field]);
  }
}

function aggregateStoredBreakdowns(dailyRows, groupName, keyFields) {
  const rows = new Map();
  for (const day of dailyRows || []) {
    for (const group of day[groupName] || []) {
      const key = keyFields.map((field) => group[field] || "").join("\u0000");
      const row = rows.get(key) || {
        ...Object.fromEntries(keyFields.map((field) => [field, group[field]])),
        models: {},
        ...emptyUsage(),
      };
      rows.set(key, row);
      addStoredUsage(row, group);
      for (const [model, usage] of Object.entries(group.models || {})) {
        row.models[model] ||= emptyUsage();
        addStoredUsage(row.models[model], usage);
      }
      if (group.sessionCount !== undefined) {
        row.sessionCount = finiteNumber(row.sessionCount) + finiteNumber(group.sessionCount);
      }
      if (group.projectCount !== undefined) {
        row.projectCount = finiteNumber(row.projectCount) + finiteNumber(group.projectCount);
      }
      if (group.sourceCount !== undefined) {
        row.sourceCount = finiteNumber(row.sourceCount) + finiteNumber(group.sourceCount);
      }
    }
  }
  return [...rows.values()]
    .map((row) => finalizeUsageRowCosts(row))
    .sort((left, right) => right.totalTokens - left.totalTokens);
}

function aggregateStoredSourceAlerts(dailyRows) {
  const rows = new Map();
  for (const day of dailyRows || []) {
    for (const alert of day.sourceAlerts || []) {
      const key = [alert.id, alert.level, alert.reason].join("\u0000");
      rows.set(key, {
        ...alert,
        fromHistory: true,
      });
    }
  }
  return [...rows.values()];
}

function aggregateStoredSourceStatus(dailyRows) {
  const rows = new Map();
  for (const day of dailyRows || []) {
    for (const status of day.sourceStatus || []) {
      const key = status.id || `${status.host}\u0000${status.engine}`;
      const row = rows.get(key) || {
        ...status,
        ok: true,
        files: 0,
        totalFiles: 0,
        events: 0,
        staleSnapshotEvents: 0,
        staleSnapshotDates: [],
      };
      row.ok = row.ok && Boolean(status.ok);
      row.error = status.error || row.error || null;
      row.files += finiteNumber(status.files);
      row.totalFiles += finiteNumber(status.totalFiles);
      row.events += finiteNumber(status.events);
      row.staleSnapshotEvents += finiteNumber(status.staleSnapshotEvents);
      row.staleSnapshotDates = [...new Set([...(row.staleSnapshotDates || []), ...(status.staleSnapshotDates || [])])];
      row.cacheHit = row.cacheHit || Boolean(status.cacheHit);
      rows.set(key, row);
    }
  }
  return [...rows.values()];
}

export function isHistoricalSavedRange(apiArgs) {
  return Boolean(apiArgs.until && apiArgs.until < todayKey());
}

function dateKeysInRange(since, until) {
  if (!since || !until) {
    return [];
  }
  const keys = [];
  let cursor = since;
  while (cursor <= until) {
    keys.push(cursor);
    cursor = shiftDateKey(cursor, 1);
  }
  return keys;
}

async function hasCompleteBackfillCoverage(args, apiArgs, historyOptions) {
  const sources = await resolveUsageSources(args);
  const key = backfillCacheKey(args, historyTrendRange(historyOptions, apiArgs), sources);
  const marker = await readBackfillMarker(historyOptions, key);
  return Boolean(
    marker?.kind === "history-backfill-marker"
    && marker.sourceErrors === 0
    && marker.since <= apiArgs.since
    && marker.until >= apiArgs.until
  );
}

export async function maybeBuildHistoryOnlyPayload(args, apiArgs, logic, historyOptions, startedAt) {
  const canonical = isCanonicalHistoryRequest(args, apiArgs, logic);
  if (!canonical || logic !== "ccusage" || apiArgs.forceRefresh || !historyOptions.enabled || !isHistoricalSavedRange(apiArgs)) {
    return null;
  }

  const storedDaily = await readDailyHistory(historyOptions, apiArgs.since, apiArgs.until, { includeHourly: true });
  if (!storedDaily.length) {
    return null;
  }
  const requestedDates = dateKeysInRange(apiArgs.since, apiArgs.until);
  const singleDay = requestedDates.length === 1;
  const daily = storedDaily.map((row) => stripHourlyHistory(row));
  if (!storedDailyHasDetailedBreakdowns(daily)) {
    return null;
  }
  const savedDates = new Set(daily.map((row) => row.date));
  const everyRequestedDateSaved = requestedDates.every((date) => savedDates.has(date));
  if (!singleDay && !everyRequestedDateSaved && !await hasCompleteBackfillCoverage(args, apiArgs, historyOptions)) {
    return null;
  }

  const hourly = storedDaily.flatMap((row) => row.hourly || []);
  const hourlyMissingDates = storedDaily
    .filter((row) => row.totalTokens > 0 && (!row.hourlySaved || (row.hourly || []).length === 0))
    .map((row) => row.date);
  const trendRange = historyTrendRange(historyOptions, apiArgs);
  const trendDaily = await readDailyHistory(historyOptions, trendRange.since, trendRange.until);
  const configuredSources = await resolveUsageSources(args);
  const complete = daily.every((row) => !row.partial);
  const sourceErrors = daily.reduce((sum, row) => sum + finiteNumber(row.sourceErrors), 0);
  const stats = {
    ...emptyStats(),
    sourceCount: configuredSources.length,
    sourceErrors,
    remoteSources: configuredSources.filter((source) => source.sshHost).length,
    historyOnly: true,
  };
  const history = {
    enabled: historyOptions.enabled,
    canonical,
    stateDir: historyOptions.stateDir,
    retentionDays: historyOptions.retentionDays,
    backfillDays: historyOptions.backfillDays,
    trendSince: trendRange.since,
    trendUntil: trendRange.until,
    backfill: {
      ran: false,
      skipped: true,
      savedDates: [],
      sourceSaved: [],
      reason: "served from saved daily history",
      sourceErrors: 0,
      sourceErrorDetails: [],
    },
    savedDates: [],
    snapshotCount: trendDaily.length,
    latestDate: trendDaily.at(-1)?.date || null,
    latestSavedAt: trendDaily.at(-1)?.savedAt || null,
    daily: trendDaily,
    mergedDaily: trendDaily,
    hourlySnapshotCount: hourly.length,
    hourlyMissingDates,
    sourceSaved: [],
    sourceSnapshotCount: await countSourceSnapshots(historyOptions, trendRange.since, trendRange.until),
  };
  const payload = {
    logic,
    since: apiArgs.since,
    until: apiArgs.until,
    filters: apiArgs.filters,
    timeZone: localTimeZone(),
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    historyOnly: true,
    historySource: "saved-daily-snapshots",
    summary: summarizeRows(daily),
    daily,
    hourly,
    historyHourlyMissingDates: hourlyMissingDates,
    projects: aggregateStoredBreakdowns(daily, "projects", ["project", "host"]),
    sessions: aggregateStoredBreakdowns(daily, "sessions", ["sessionId", "originalSessionId", "sessionFile", "project", "sourceId", "sourceLabel", "host", "engine"]),
    sources: aggregateStoredBreakdowns(daily, "sources", ["sourceId", "sourceLabel", "host", "engine"]),
    hosts: aggregateStoredBreakdowns(daily, "hosts", ["host"]),
    engines: aggregateStoredBreakdowns(daily, "engines", ["engine"]),
    complete,
    staleSnapshotEvents: 0,
    sourceStatus: aggregateStoredSourceStatus(daily),
    sourceAlerts: aggregateStoredSourceAlerts(daily),
    availableFilters: buildAvailableFilters(configuredSources),
    pricing: buildPricingCoverage(daily),
    stats,
    history,
    trendDaily,
  };
  return payload;
}

function storedDailyHasDetailedBreakdowns(rows) {
  return (rows || []).every((row) => dailyRowHasDetailedBreakdowns(row));
}

function dailyRowHasDetailedBreakdowns(row) {
  return finiteNumber(row?.totalTokens) === 0
    || (Array.isArray(row?.projects) && Array.isArray(row?.sessions));
}

export async function buildHistoryPayload(args, apiArgs, logic, payload, resolvedOptions = null) {
  const options = resolvedOptions || await resolveHistoryOptions(args);
  const canonical = isCanonicalHistoryRequest(args, apiArgs, logic);
  const savedDates = canonical ? await persistDailyHistory(options, payload) : [];
  const trendRange = canonical ? historyTrendRange(options, apiArgs) : { since: apiArgs.since, until: apiArgs.until };
  let daily = canonical ? await readDailyHistory(options, trendRange.since, trendRange.until) : [];
  const backfill = await maybeBackfillHistory(args, apiArgs, logic, options, canonical);
  if (backfill.ran) {
    daily = await readDailyHistory(options, trendRange.since, trendRange.until);
  }
  const mergedDaily = canonical ? mergeDailyRows(daily, payload.daily) : payload.daily;
  return {
    enabled: options.enabled,
    canonical,
    stateDir: options.stateDir,
    retentionDays: options.retentionDays,
    backfillDays: options.backfillDays,
    trendSince: trendRange.since,
    trendUntil: trendRange.until,
    backfill,
    savedDates,
    snapshotCount: daily.length,
    latestDate: daily.at(-1)?.date || null,
    latestSavedAt: daily.at(-1)?.savedAt || null,
    daily,
    mergedDaily,
    hourlySnapshotCount: payload.hourly?.length || 0,
  };
}

export async function printHistory(args) {
  const today = todayKey();
  const options = await resolveHistoryOptions(args);
  const rows = await readDailyHistory(options, args.since, args.until || today, { includeHourly: true });
  if (args.json) {
    console.log(JSON.stringify({ history: rows, stateDir: options.stateDir }, null, 2));
    return;
  }
  printHistoryRows(rows, options.stateDir);
}
