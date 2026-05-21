import { buildDaily, buildEngines, buildHosts, buildHourly, buildPricingCoverage, buildProjects, buildSessions, buildSources, summarizeRows } from "./aggregates.mjs";
import { normalizeLogic } from "./cli-args.mjs";
import { publicSource } from "./cli-output.mjs";
import { localTimeZone, normalizeDate, todayKey } from "./dates.mjs";
import { applyStaleSnapshotStatus, buildHistoryPayload, countSourceSnapshots, maybeBuildHistoryOnlyPayload, persistSourceSnapshots, resolveHistoryOptions, staleSnapshotEventsForFailedSources } from "./history-store.mjs";
import { pricingStatus } from "./pricing.mjs";
import { buildAvailableFilters, buildSourceAlerts, loadAllUsageEvents, resolveUsageSources, sourceStatus } from "./sources.mjs";

export function usageCommandOptions(args) {
  return {
    ...args,
    filters: {
      source: "all",
      host: "all",
      engine: "all",
    },
  };
}

export async function buildSourcesPayload(args) {
  const sources = await resolveUsageSources(args);
  const historyOptions = await resolveHistoryOptions(args);
  return {
    generatedAt: new Date().toISOString(),
    timeZone: localTimeZone(),
    sources: sources.map(publicSource),
    availableFilters: buildAvailableFilters(sources),
    config: {
      appDir: args.appDir,
      configPath: args.configPath,
      localOnly: args.localOnly,
      sourceFilter: args.sources,
      discoverAragornResources: args.discoverAragornResources,
      historyEnabled: historyOptions.enabled,
      stateDir: historyOptions.stateDir,
      historyRetentionDays: historyOptions.retentionDays,
      historyBackfillDays: historyOptions.backfillDays,
      pricing: pricingStatus(),
    },
  };
}

export function apiQueryOptions(args, query) {
  const today = todayKey();
  const apiArgs = {
    ...args,
    since: parseApiDate(query.searchParams.get("since"), today),
    until: parseApiDate(query.searchParams.get("until"), today),
    forceRefresh: query.searchParams.get("refresh") === "1" || query.searchParams.get("force") === "1",
    filters: {
      source: query.searchParams.get("source") || "all",
      host: query.searchParams.get("host") || "all",
      engine: query.searchParams.get("engine") || "all",
    },
  };
  const logic = normalizeLogic(query.searchParams.get("logic"));

  return { apiArgs, logic };
}

export async function buildUsagePayloadForOptions(args, apiArgs, logic) {
  const startedAt = Date.now();
  const historyOptions = await resolveHistoryOptions(args);
  const historyOnlyPayload = await maybeBuildHistoryOnlyPayload(args, apiArgs, logic, historyOptions, startedAt);
  if (historyOnlyPayload) {
    return decoratePricingPayload(historyOnlyPayload);
  }

  const loaded = await loadAllUsageEvents(args, apiArgs, logic);
  const staleSnapshots = logic === "ccusage"
    ? await staleSnapshotEventsForFailedSources(historyOptions, loaded.results, apiArgs)
    : { events: [], staleBySource: new Map() };
  applyStaleSnapshotStatus(loaded.results, staleSnapshots.staleBySource);
  const sourceStatusRows = loaded.results.map((result) => sourceStatus(result));
  const events = [...loaded.events, ...staleSnapshots.events]
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
  const daily = buildDaily(events, apiArgs);
  const sessions = buildSessions(events, apiArgs);
  const projects = buildProjects(events, apiArgs);
  const hourly = buildHourly(events, apiArgs);
  const sources = buildSources(events, apiArgs);
  const hosts = buildHosts(events, apiArgs);
  const engines = buildEngines(events, apiArgs);
  const payload = {
    logic,
    since: apiArgs.since,
    until: apiArgs.until,
    filters: apiArgs.filters,
    timeZone: localTimeZone(),
    generatedAt: new Date().toISOString(),
    durationMs: 0,
    summary: summarizeRows(daily),
    daily,
    hourly,
    projects,
    sessions,
    sources,
    hosts,
    engines,
    complete: (loaded.stats?.sourceErrors || 0) === 0,
    staleSnapshotEvents: staleSnapshots.events.length,
    sourceStatus: sourceStatusRows,
    sourceAlerts: buildSourceAlerts(sourceStatusRows),
    availableFilters: buildAvailableFilters(loaded.allSources || loaded.sources),
    stats: loaded.stats,
  };
  const sourceSnapshotSaved = await persistSourceSnapshots(historyOptions, loaded.results, apiArgs, payload);
  const history = await buildHistoryPayload(args, apiArgs, logic, payload, historyOptions);
  history.sourceSaved = [...sourceSnapshotSaved, ...(history.backfill?.sourceSaved || [])];
  history.sourceSnapshotCount = await countSourceSnapshots(historyOptions, history.trendSince || apiArgs.since, history.trendUntil || apiArgs.until);
  payload.history = history;
  payload.trendDaily = history.mergedDaily;
  payload.durationMs = Date.now() - startedAt;
  return decoratePricingPayload(payload);
}

function decoratePricingPayload(payload) {
  const rangeCoverage = buildPricingCoverage(payload.daily || []);
  const trendCoverage = buildPricingCoverage(payload.trendDaily || payload.daily || []);
  payload.pricing = {
    ...rangeCoverage,
    trendMissingModels: trendCoverage.missingModels,
    trendMissingModelCount: trendCoverage.missingModelCount,
  };
  return payload;
}

function parseApiDate(value, fallback) {
  if (!value) {
    return fallback;
  }
  try {
    return normalizeDate(value);
  } catch {
    return fallback;
  }
}
