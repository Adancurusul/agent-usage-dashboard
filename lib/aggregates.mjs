import { dateKey, inRange, localTimeZone } from "./dates.mjs";
import { estimateCost, hasPricingForModel, pricingModelNames, pricingStatus } from "./pricing.mjs";
import { addUsage, emptyUsage, finiteNumber, normalizeProjectCwd, REPORTED_USAGE_FIELDS, USAGE_FIELDS } from "./usage-math.mjs";

const CLEAN_USAGE_FIELDS = [...USAGE_FIELDS, ...REPORTED_USAGE_FIELDS];

export function finalizeModelCosts(models) {
  return Object.entries(models).reduce((sum, [model, usage]) => {
    const unreportedUsage = usageForCostEstimate(usage);
    const estimate = hasTokenUsage(unreportedUsage) ? estimateCost(unreportedUsage, model) : {
      costUSD: 0,
      priced: true,
      pricingModel: null,
      costSource: "reported",
    };
    if (usage.eventCostUSD > 0) {
      usage.costUSD = usage.eventCostUSD + estimate.costUSD;
      usage.costSource = estimate.costUSD > 0 ? "reported+configured-pricing" : "reported";
      usage.pricingMissing = !estimate.priced && hasTokenUsage(unreportedUsage);
    } else {
      usage.costUSD = estimate.costUSD;
      usage.costSource = estimate.costSource;
      usage.pricingMissing = !estimate.priced && hasTokenUsage(usage);
    }
    if (estimate.pricingModel) {
      usage.pricingModel = estimate.pricingModel;
    } else {
      delete usage.pricingModel;
    }
    return sum + usage.costUSD;
  }, 0);
}

function hasTokenUsage(usage) {
  return CLEAN_USAGE_FIELDS
    .filter((field) => field !== "costUSD" && field !== "eventCostUSD")
    .some((field) => finiteNumber(usage?.[field]) > 0);
}

function usageForCostEstimate(usage) {
  const reportedCost = finiteNumber(usage?.eventCostUSD);
  if (reportedCost <= 0) {
    return usage;
  }
  const hasReportedBreakdown = REPORTED_USAGE_FIELDS.some((field) => finiteNumber(usage?.[field]) > 0);
  if (!hasReportedBreakdown) {
    return emptyUsage();
  }
  return {
    ...emptyUsage(),
    inputTokens: remaining(usage.inputTokens, usage.reportedInputTokens),
    cachedInputTokens: remaining(usage.cachedInputTokens, usage.reportedCachedInputTokens),
    cacheCreationInputTokens: remaining(usage.cacheCreationInputTokens, usage.reportedCacheCreationInputTokens),
    outputTokens: remaining(usage.outputTokens, usage.reportedOutputTokens),
    cachedOutputTokens: remaining(usage.cachedOutputTokens, usage.reportedCachedOutputTokens),
    reasoningOutputTokens: remaining(usage.reasoningOutputTokens, usage.reportedReasoningOutputTokens),
    totalTokens: remaining(usage.totalTokens, usage.reportedTotalTokens),
  };
}

function remaining(total, reported) {
  return Math.max(finiteNumber(total) - finiteNumber(reported), 0);
}

function finalizeBreakdownRows(rows) {
  return Object.values(rows).sort((left, right) => right.inputTokens - left.inputTokens).map((row) => {
    row.costUSD = finalizeModelCosts(row.models || {});
    return row;
  });
}

function addGroupedUsage(row, groupName, groupKey, event, makeGroup) {
  row[groupName][groupKey] ||= {
    ...makeGroup(event),
    models: {},
    ...emptyUsage(),
  };
  const group = row[groupName][groupKey];
  addUsage(group, event);
  group.models[event.model] ||= emptyUsage();
  addUsage(group.models[event.model], event);
}

export function buildDaily(events, args) {
  const rows = new Map();

  for (const event of events) {
    const key = dateKey(event.timestamp);
    if (!inRange(key, args.since, args.until)) {
      continue;
    }

    const row = rows.get(key) || {
      date: key,
      ...emptyUsage(),
      models: {},
      sessions: {},
      projects: {},
      sources: {},
      engines: {},
      hosts: {},
    };
    rows.set(key, row);
    addUsage(row, event);

    row.models[event.model] ||= emptyUsage();
    addUsage(row.models[event.model], event);

    addGroupedUsage(row, "sources", event.sourceId, event, (item) => ({
      sourceId: item.sourceId,
      sourceLabel: item.sourceLabel,
      host: item.host,
      engine: item.engine,
    }));
    addGroupedUsage(row, "engines", event.engine, event, (item) => ({ engine: item.engine }));
    addGroupedUsage(row, "hosts", event.host, event, (item) => ({ host: item.host }));
    addDailyProjectUsage(row, event);

    row.sessions[event.sessionId] ||= {
      sessionId: event.sessionId,
      originalSessionId: event.originalSessionId,
      sessionFile: event.sessionFile,
      project: event.project,
      sourceId: event.sourceId,
      sourceLabel: event.sourceLabel,
      host: event.host,
      engine: event.engine,
      models: {},
      ...emptyUsage(),
    };
    addUsage(row.sessions[event.sessionId], event);
    row.sessions[event.sessionId].models[event.model] ||= emptyUsage();
    addUsage(row.sessions[event.sessionId].models[event.model], event);
  }

  return [...rows.values()].sort((left, right) => left.date.localeCompare(right.date)).map((row) => {
    row.costUSD = finalizeModelCosts(row.models);
    row.projects = finalizeProjectRows(row.projects);
    row.sessions = Object.values(row.sessions)
      .sort((left, right) => right.inputTokens - left.inputTokens)
      .map((session) => {
        session.costUSD = finalizeModelCosts(session.models || {});
        return session;
      });
    row.sources = finalizeBreakdownRows(row.sources);
    row.engines = finalizeBreakdownRows(row.engines);
    row.hosts = finalizeBreakdownRows(row.hosts);
    return row;
  });
}

function addDailyProjectUsage(row, event) {
  const project = normalizeProjectCwd(event.project);
  const projectKey = `${event.host}|${project}`;
  row.projects[projectKey] ||= {
    project,
    host: event.host,
    models: {},
    sessionIds: {},
    sourceIds: {},
    ...emptyUsage(),
  };
  const projectRow = row.projects[projectKey];
  projectRow.sessionIds[event.sessionId] = true;
  projectRow.sourceIds[event.sourceId] = true;
  addUsage(projectRow, event);
  projectRow.models[event.model] ||= emptyUsage();
  addUsage(projectRow.models[event.model], event);
}

function finalizeProjectRows(rows) {
  return Object.values(rows).sort((left, right) => right.inputTokens - left.inputTokens).map((row) => {
    row.costUSD = finalizeModelCosts(row.models || {});
    row.sessionCount = Object.keys(row.sessionIds || {}).length;
    row.sourceCount = Object.keys(row.sourceIds || {}).length;
    delete row.sessionIds;
    delete row.sourceIds;
    return row;
  });
}

export function buildSessions(events, args) {
  const rows = new Map();

  for (const event of events) {
    const key = dateKey(event.timestamp);
    if (!inRange(key, args.since, args.until)) {
      continue;
    }

    const row = rows.get(event.sessionId) || {
      sessionId: event.sessionId,
      originalSessionId: event.originalSessionId,
      sessionFile: event.sessionFile,
      project: event.project,
      sourceId: event.sourceId,
      sourceLabel: event.sourceLabel,
      host: event.host,
      engine: event.engine,
      lastActivity: event.timestamp,
      models: {},
      ...emptyUsage(),
    };
    rows.set(event.sessionId, row);
    row.lastActivity = event.timestamp > row.lastActivity ? event.timestamp : row.lastActivity;
    addUsage(row, event);
    row.models[event.model] ||= emptyUsage();
    addUsage(row.models[event.model], event);
  }

  return [...rows.values()].sort((left, right) => right.inputTokens - left.inputTokens).map((row) => {
    row.costUSD = finalizeModelCosts(row.models);
    return row;
  });
}

export function buildProjects(events, args) {
  const rows = new Map();

  for (const event of events) {
    const key = dateKey(event.timestamp);
    if (!inRange(key, args.since, args.until)) {
      continue;
    }

    const project = normalizeProjectCwd(event.project);
    const projectKey = `${event.host}|${project}`;
    const row = rows.get(projectKey) || {
      project,
      host: event.host,
      lastActivity: event.timestamp,
      models: {},
      engines: {},
      sourceIds: {},
      sessionIds: {},
      ...emptyUsage(),
    };
    rows.set(projectKey, row);
    row.lastActivity = event.timestamp > row.lastActivity ? event.timestamp : row.lastActivity;
    row.sessionIds[event.sessionId] = true;
    row.sourceIds[event.sourceId] = true;
    addUsage(row, event);
    row.models[event.model] ||= emptyUsage();
    addUsage(row.models[event.model], event);
    row.engines[event.engine] ||= { engine: event.engine, ...emptyUsage() };
    addUsage(row.engines[event.engine], event);
  }

  return [...rows.values()].sort((left, right) => right.inputTokens - left.inputTokens).map((row) => {
    row.costUSD = finalizeModelCosts(row.models);
    row.sessionCount = Object.keys(row.sessionIds).length;
    row.sourceCount = Object.keys(row.sourceIds).length;
    row.engines = Object.values(row.engines).sort((left, right) => right.inputTokens - left.inputTokens);
    delete row.sessionIds;
    delete row.sourceIds;
    return row;
  });
}

function buildGroupedUsage(events, args, keyFn, makeRow) {
  const rows = new Map();

  for (const event of events) {
    const key = dateKey(event.timestamp);
    if (!inRange(key, args.since, args.until)) {
      continue;
    }

    const rowKey = keyFn(event);
    const row = rows.get(rowKey) || {
      ...makeRow(event),
      lastActivity: event.timestamp,
      models: {},
      sessionIds: {},
      projectIds: {},
      ...emptyUsage(),
    };
    rows.set(rowKey, row);
    row.lastActivity = event.timestamp > row.lastActivity ? event.timestamp : row.lastActivity;
    row.sessionIds[event.sessionId] = true;
    row.projectIds[normalizeProjectCwd(event.project)] = true;
    addUsage(row, event);
    row.models[event.model] ||= emptyUsage();
    addUsage(row.models[event.model], event);
  }

  return [...rows.values()].sort((left, right) => right.inputTokens - left.inputTokens).map((row) => {
    row.costUSD = finalizeModelCosts(row.models);
    row.sessionCount = Object.keys(row.sessionIds).length;
    row.projectCount = Object.keys(row.projectIds).length;
    delete row.sessionIds;
    delete row.projectIds;
    return row;
  });
}

export function buildSources(events, args) {
  return buildGroupedUsage(
    events,
    args,
    (event) => event.sourceId,
    (event) => ({
      sourceId: event.sourceId,
      sourceLabel: event.sourceLabel,
      host: event.host,
      engine: event.engine,
    }),
  );
}

export function buildHosts(events, args) {
  return buildGroupedUsage(
    events,
    args,
    (event) => event.host,
    (event) => ({ host: event.host }),
  );
}

export function buildEngines(events, args) {
  return buildGroupedUsage(
    events,
    args,
    (event) => event.engine,
    (event) => ({ engine: event.engine }),
  );
}

function hourKey(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: localTimeZone(),
  }).formatToParts(date);
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:00`;
}

export function buildHourly(events, args) {
  const rows = new Map();

  for (const event of events) {
    const day = dateKey(event.timestamp);
    if (!inRange(day, args.since, args.until)) {
      continue;
    }

    const key = hourKey(event.timestamp);
    if (!key) {
      continue;
    }

    const row = rows.get(key) || {
      hour: key,
      models: {},
      sources: {},
      engines: {},
      hosts: {},
      ...emptyUsage(),
    };
    rows.set(key, row);
    addUsage(row, event);
    row.models[event.model] ||= emptyUsage();
    addUsage(row.models[event.model], event);
    addGroupedUsage(row, "sources", event.sourceId, event, (item) => ({
      sourceId: item.sourceId,
      sourceLabel: item.sourceLabel,
      host: item.host,
      engine: item.engine,
    }));
    addGroupedUsage(row, "engines", event.engine, event, (item) => ({ engine: item.engine }));
    addGroupedUsage(row, "hosts", event.host, event, (item) => ({ host: item.host }));
  }

  return [...rows.values()].sort((left, right) => left.hour.localeCompare(right.hour)).map((row) => {
    row.costUSD = finalizeModelCosts(row.models);
    row.sources = finalizeBreakdownRows(row.sources);
    row.engines = finalizeBreakdownRows(row.engines);
    row.hosts = finalizeBreakdownRows(row.hosts);
    return row;
  });
}

export function summarizeRows(rows) {
  const summary = emptyUsage();
  for (const row of rows) {
    addUsage(summary, row);
    summary.costUSD += row.costUSD || 0;
  }
  return summary;
}

function pickUsage(row) {
  return Object.fromEntries(CLEAN_USAGE_FIELDS.map((field) => [field, finiteNumber(row?.[field])]));
}

function cleanModelUsage(models = {}) {
  return Object.fromEntries(Object.entries(models || {}).map(([model, usage]) => {
    const clean = pickUsage(usage);
    if (usage?.costSource) {
      clean.costSource = usage.costSource;
    }
    if (usage?.pricingModel) {
      clean.pricingModel = usage.pricingModel;
    }
    if (usage?.pricingMissing) {
      clean.pricingMissing = true;
    }
    return [model, clean];
  }));
}

function cleanBreakdownRows(rows = [], keys = []) {
  return rows.map((row) => ({
    ...Object.fromEntries(keys.map((key) => [key, row[key]]).filter(([, value]) => value !== undefined)),
    ...pickUsage(row),
    models: cleanModelUsage(row.models),
    ...(row.sessionCount !== undefined ? { sessionCount: row.sessionCount } : {}),
    ...(row.projectCount !== undefined ? { projectCount: row.projectCount } : {}),
    ...(row.sourceCount !== undefined ? { sourceCount: row.sourceCount } : {}),
  }));
}

export function cleanDailyRow(row) {
  return {
    date: row.date,
    ...pickUsage(row),
    models: cleanModelUsage(row.models),
    sources: cleanBreakdownRows(row.sources, ["sourceId", "sourceLabel", "host", "engine"]),
    engines: cleanBreakdownRows(row.engines, ["engine"]),
    hosts: cleanBreakdownRows(row.hosts, ["host"]),
    projects: cleanBreakdownRows(row.projects, ["project", "host"]),
    sessions: cleanBreakdownRows(row.sessions, ["sessionId", "originalSessionId", "sessionFile", "project", "sourceId", "sourceLabel", "host", "engine"]),
  };
}

function dateFromHourKey(hour) {
  const value = String(hour || "");
  return /^\d{4}-\d{2}-\d{2} /.test(value) ? value.slice(0, 10) : null;
}

function cleanHourlyRow(row) {
  return {
    hour: row.hour,
    ...pickUsage(row),
    models: cleanModelUsage(row.models),
    sources: cleanBreakdownRows(row.sources, ["sourceId", "sourceLabel", "host", "engine"]),
    engines: cleanBreakdownRows(row.engines, ["engine"]),
    hosts: cleanBreakdownRows(row.hosts, ["host"]),
  };
}

export function cleanHourlyRows(rows = []) {
  return rows.filter((row) => row?.hour).map((row) => cleanHourlyRow(row));
}

export function hourlyRowsForDate(rows, date) {
  return cleanHourlyRows(rows).filter((row) => dateFromHourKey(row.hour) === date);
}

export function stripHourlyHistory(row) {
  const { hourly, hourlySaved, ...rest } = row;
  return rest;
}

export function finalizeUsageRowCosts(row) {
  if (!row || typeof row !== "object") {
    return row;
  }
  row.costUSD = finalizeModelCosts(row.models || {});
  for (const groupName of ["sources", "engines", "hosts", "projects", "sessions"]) {
    if (!Array.isArray(row[groupName])) {
      continue;
    }
    for (const group of row[groupName]) {
      group.costUSD = finalizeModelCosts(group.models || {});
    }
  }
  return row;
}

export function buildPricingCoverage(rows = []) {
  const models = aggregateModelUsage(rows);
  const missingModelUsage = [...models.entries()]
    .filter(([model, usage]) => hasTokenUsage(usage) && finiteNumber(usage.eventCostUSD) <= 0 && !hasPricingForModel(model))
    .map(([model, usage]) => ({
      model,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    }))
    .sort((left, right) => right.totalTokens - left.totalTokens);
  const status = pricingStatus();
  return {
    ...status,
    configuredModels: pricingModelNames(),
    configuredModelCount: pricingModelNames().length,
    usedModels: [...models.keys()].sort(),
    usedModelCount: models.size,
    missingModels: missingModelUsage.map((item) => item.model),
    missingModelCount: missingModelUsage.length,
    missingModelUsage: missingModelUsage.slice(0, 20),
  };
}

function aggregateModelUsage(rows = []) {
  const models = new Map();
  for (const row of rows || []) {
    collectModelUsage(models, row?.models);
  }
  return models;
}

function collectModelUsage(target, models = {}) {
  for (const [model, usage] of Object.entries(models || {})) {
    target.set(model, target.get(model) || emptyUsage());
    addUsage(target.get(model), usage);
  }
}
