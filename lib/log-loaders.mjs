import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { dateKey, inRange } from "./dates.mjs";
import { finiteNumber, normalizeProjectCwd, normalizeUsage } from "./usage-math.mjs";

async function listJsonlFiles(dir) {
  const result = [];
  await walk(dir, result);
  return result.sort();
}

async function walk(dir, result) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, result);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      result.push(fullPath);
    }
  }
}

function usageKey(lastUsage, totalUsage) {
  const last = lastUsage
    ? `${lastUsage.inputTokens}:${lastUsage.cachedInputTokens}:${lastUsage.cacheCreationInputTokens}:${lastUsage.outputTokens}:${lastUsage.cachedOutputTokens}:${lastUsage.reasoningOutputTokens}:${lastUsage.totalTokens}`
    : "no-last";
  const total = totalUsage
    ? `${totalUsage.inputTokens}:${totalUsage.cachedInputTokens}:${totalUsage.cacheCreationInputTokens}:${totalUsage.outputTokens}:${totalUsage.cachedOutputTokens}:${totalUsage.reasoningOutputTokens}:${totalUsage.totalTokens}`
    : "no-total";
  return `${last}|${total}`;
}

function codexUsageStateKey(timestamp, lastUsage, totalUsage, resetIndex = 0) {
  if (totalUsage) {
    return `total:${resetIndex}:${usageKey(null, totalUsage)}`;
  }
  return `${timestamp}|${usageKey(lastUsage, totalUsage)}`;
}

function codexEventKey(event) {
  return [
    event.timestamp,
    event.model || "",
    event.inputTokens || 0,
    event.cachedInputTokens || 0,
    event.outputTokens || 0,
    event.reasoningOutputTokens || 0,
    event.totalTokens || 0,
  ].join("|");
}

function dedupeCodexEvents(events, stats) {
  const seen = new Set();
  let writeIndex = 0;
  for (const event of events) {
    const key = codexEventKey(event);
    if (seen.has(key)) {
      stats.duplicateSkipped += 1;
      continue;
    }
    seen.add(key);
    events[writeIndex] = event;
    writeIndex += 1;
  }
  events.length = writeIndex;
}

function extractModel(payload, fallback) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const candidates = [
    payload.model,
    payload.model_name,
    payload.info?.model,
    payload.info?.model_name,
    payload.info?.metadata?.model,
    payload.metadata?.model,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return fallback;
}

function usageFromCodexResult(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value.usage
    || value.data?.usage
    || value.result?.usage
    || value.response?.usage
    || null;
}

function normalizeHeadlessCodexUsage(value) {
  const usage = usageFromCodexResult(value);
  if (!usage || typeof usage !== "object") {
    return null;
  }
  const raw = {
    input_tokens: firstFinite(usage.input_tokens, usage.prompt_tokens, usage.input),
    cached_input_tokens: firstFinite(
      usage.cached_input_tokens,
      usage.cache_read_input_tokens,
      usage.cached_tokens,
    ),
    output_tokens: firstFinite(usage.output_tokens, usage.completion_tokens, usage.output),
    reasoning_output_tokens: firstFinite(usage.reasoning_output_tokens, usage.reasoning_tokens),
    total_tokens: finiteNumber(usage.total_tokens),
  };
  if (
    raw.input_tokens === 0
    && raw.cached_input_tokens === 0
    && raw.output_tokens === 0
    && raw.reasoning_output_tokens === 0
    && raw.total_tokens === 0
  ) {
    return null;
  }
  if (raw.total_tokens === 0) {
    raw.total_tokens = raw.input_tokens + raw.output_tokens + raw.reasoning_output_tokens;
  }
  return normalizeUsage(raw, { fallbackTotalIncludesReasoning: true });
}

function firstFinite(...values) {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number > 0) {
      return number;
    }
  }
  return 0;
}

function extractCodexResultModel(value, fallback) {
  return extractModel(value, null)
    || extractModel(value?.data, null)
    || extractModel(value?.result, null)
    || extractModel(value?.response, null)
    || fallback;
}

function normalizeCodexTimestamp(value) {
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const number = finiteNumber(value);
  if (number > 0) {
    const millis = number > 10_000_000_000 ? number : number * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function codexTimestampFromResult(value) {
  return normalizeCodexTimestamp(value?.timestamp)
    || normalizeCodexTimestamp(value?.created_at)
    || normalizeCodexTimestamp(value?.createdAt)
    || normalizeCodexTimestamp(value?.data?.timestamp)
    || normalizeCodexTimestamp(value?.result?.timestamp)
    || normalizeCodexTimestamp(value?.response?.timestamp);
}

function isForkedSessionPayload(payload) {
  return Boolean(
    payload?.forked_from_id
    || payload?.thread_source === "subagent"
    || payload?.source?.subagent?.thread_spawn?.parent_thread_id
  );
}

export function emptyStats() {
  return {
    files: 0,
    totalFiles: 0,
    skippedFiles: 0,
    tokenEvents: 0,
    keptEvents: 0,
    outOfRangeSkipped: 0,
    replaySkipped: 0,
    duplicateSkipped: 0,
    resetCount: 0,
    forkedFiles: 0,
  };
}

function eventMayBeReturned(timestamp, options = {}) {
  if (!options.since && !options.until) {
    return true;
  }

  return inRange(dateKey(timestamp), options.since, options.until);
}

export async function loadEvents(codexHome, options = {}) {
  const sessionsDir = path.join(codexHome, "sessions");
  const files = await listJsonlFiles(sessionsDir);
  const events = [];
  const stats = emptyStats();
  stats.totalFiles = files.length;

  for (const file of files) {
    const fileStat = await stat(file);
    if (!fileStat.isFile()) {
      continue;
    }
    stats.files += 1;

    const content = await readFile(file, "utf8");
    const parsed = parseSessionFile(file, sessionsDir, content, stats, options);
    events.push(...parsed);
  }

  dedupeCodexEvents(events, stats);
  events.sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
  return { events, stats };
}

export async function loadRawEvents(codexHome, options = {}) {
  const sessionsDir = path.join(codexHome, "sessions");
  const files = await listJsonlFiles(sessionsDir);
  const events = [];
  const stats = emptyStats();
  stats.totalFiles = files.length;

  for (const file of files) {
    const fileStat = await stat(file);
    if (!fileStat.isFile()) {
      continue;
    }
    stats.files += 1;

    const content = await readFile(file, "utf8");
    const parsed = parseRawSessionFile(file, sessionsDir, content, stats, options);
    events.push(...parsed);
  }

  dedupeCodexEvents(events, stats);
  events.sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
  return { events, stats };
}

export async function loadClaudeCodeEvents(claudeHome, options = {}) {
  const projectsDir = path.join(claudeHome, "projects");
  const files = await listJsonlFiles(projectsDir);
  const events = [];
  const stats = emptyStats();
  stats.totalFiles = files.length;

  for (const file of files) {
    const fileStat = await stat(file);
    if (!fileStat.isFile()) {
      continue;
    }
    stats.files += 1;

    const content = await readFile(file, "utf8");
    const parsed = parseClaudeCodeFile(file, projectsDir, content, stats, options);
    events.push(...parsed);
  }

  events.sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
  return { events, stats };
}

function parseClaudeCodeFile(file, projectsDir, content, stats, options = {}) {
  const eventsByKey = new Map();
  const sessionId = path.relative(projectsDir, file).replace(/\.jsonl$/i, "").split(path.sep).join("/");
  const lines = content.split(/\r?\n/);
  let currentProject = "(unknown)";
  let currentModel = "claude-code";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (!trimmed.includes('"usage"') || hasUnsupportedClaudeNullField(trimmed)) {
      continue;
    }

    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const data = claudeUsageEntry(entry);
    if (!data) {
      continue;
    }
    currentProject = normalizeProjectCwd(entry.cwd || currentProject);
    const timestamp = data.timestamp;

    if (!isValidClaudeUsageEntry(data)) {
      continue;
    }

    stats.tokenEvents += 1;
    const usagePayload = data.message.usage;
    const usage = normalizeUsage(usagePayload, { separateCache: true });
    if (!usage) {
      continue;
    }
    const requestId = data.requestId || data.request_id || null;
    const messageId = data.message.id || entry.uuid || "";
    const key = messageId ? `${messageId}|${requestId || ""}` : usageKey(usage, null);

    if (!eventMayBeReturned(timestamp, options)) {
      stats.outOfRangeSkipped += 1;
      continue;
    }

    const messageModel = data.message.model === "<synthetic>" ? null : data.message.model;
    currentModel = messageModel || currentModel;
    const model = usagePayload.speed === "fast" && currentModel ? `${currentModel}-fast` : currentModel;
    const reportedCostUSD = finiteNumber(data.costUSD ?? data.cost_usd);
    const event = {
      sessionId,
      sessionFile: path.basename(file),
      project: currentProject,
      timestamp,
      model,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
      outputTokens: usage.outputTokens,
      cachedOutputTokens: usage.cachedOutputTokens,
      reasoningOutputTokens: usage.reasoningOutputTokens,
      totalTokens: usage.totalTokens,
      costUSD: reportedCostUSD,
      costSource: reportedCostUSD > 0 ? "reported" : "estimate",
    };
    const existing = eventsByKey.get(key);
    if (existing) {
      stats.duplicateSkipped += 1;
      if (shouldReplaceClaudeEvent(event, existing)) {
        eventsByKey.set(key, event);
      }
      continue;
    }
    stats.keptEvents += 1;
    eventsByKey.set(key, event);
  }

  return [...eventsByKey.values()];
}

const CLAUDE_UNSUPPORTED_NULL_FIELDS = [
  "id",
  "cwd",
  "model",
  "speed",
  "costUSD",
  "version",
  "sessionId",
  "requestId",
  "isApiErrorMessage",
  "cache_read_input_tokens",
  "cache_creation_input_tokens",
];

function hasUnsupportedClaudeNullField(line) {
  return CLAUDE_UNSUPPORTED_NULL_FIELDS.some((field) => (
    new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*null`).test(line)
  ));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function claudeUsageEntry(entry) {
  if (entry?.message?.usage && entry.timestamp) {
    return entry;
  }
  const agentMessage = entry?.data?.message;
  if (agentMessage?.message?.usage && agentMessage.timestamp) {
    return {
      timestamp: agentMessage.timestamp,
      message: agentMessage.message,
      costUSD: agentMessage.costUSD,
      cost_usd: agentMessage.cost_usd,
      requestId: agentMessage.requestId,
      request_id: agentMessage.request_id,
    };
  }
  return null;
}

function isValidClaudeUsageEntry(data) {
  return Boolean(
    data.timestamp
    && data.message?.usage
    && !isEmptyIfPresent(data.version)
    && !isEmptyIfPresent(data.sessionId ?? data.session_id)
    && !isEmptyIfPresent(data.requestId ?? data.request_id)
    && !isEmptyIfPresent(data.message.id)
    && !isEmptyIfPresent(data.message.model)
  );
}

function isEmptyIfPresent(value) {
  return value !== undefined && value !== null && String(value).length === 0;
}

function eventComparableTotal(event) {
  return (event.inputTokens || 0)
    + (event.outputTokens || 0)
    + (event.cacheCreationInputTokens || 0)
    + (event.cachedInputTokens || 0);
}

function shouldReplaceClaudeEvent(candidate, existing) {
  const candidateTotal = eventComparableTotal(candidate);
  const existingTotal = eventComparableTotal(existing);
  if (candidateTotal !== existingTotal) {
    return candidateTotal > existingTotal;
  }
  return (candidate.costUSD || 0) > (existing.costUSD || 0);
}


function parseSessionFile(file, sessionsDir, content, stats, options = {}) {
  const events = [];
  const sessionId = path.relative(sessionsDir, file).replace(/\.jsonl$/i, "").split(path.sep).join("/");
  const lines = content.split(/\r?\n/);
  let currentModel = null;
  let isForkedSession = false;
  let firstSessionMetaSeen = false;
  let firstTurnContextSeen = false;
  let previousTotalUsage = null;
  let usageResetIndex = 0;
  let currentProject = "(unknown)";
  const seenUsageEvents = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (entry.type === "session_meta" && !firstSessionMetaSeen) {
      firstSessionMetaSeen = true;
      const payload = entry.payload || {};
      currentProject = normalizeProjectCwd(payload.cwd);
      isForkedSession = isForkedSessionPayload(payload);
      if (isForkedSession) {
        stats.forkedFiles += 1;
      }
      continue;
    }

    if (entry.type === "turn_context") {
      const wasBeforeFirstTurnContext = !firstTurnContextSeen;
      firstTurnContextSeen = true;
      currentModel = extractModel(entry.payload, currentModel);
      if (isForkedSession && wasBeforeFirstTurnContext) {
        previousTotalUsage = null;
      }
      continue;
    }

    if (entry.type !== "event_msg") {
      const usage = normalizeHeadlessCodexUsage(entry);
      if (!usage) {
        continue;
      }
      const timestamp = codexTimestampFromResult(entry);
      if (!timestamp) {
        continue;
      }
      stats.tokenEvents += 1;
      currentModel = extractCodexResultModel(entry, currentModel) || currentModel || "gpt-5";
      if (!eventMayBeReturned(timestamp, options)) {
        stats.outOfRangeSkipped += 1;
        continue;
      }
      stats.keptEvents += 1;
      events.push({
        sessionId,
        sessionFile: path.basename(file),
        project: currentProject,
        timestamp,
        model: currentModel,
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        cacheCreationInputTokens: usage.cacheCreationInputTokens,
        outputTokens: usage.outputTokens,
        cachedOutputTokens: usage.cachedOutputTokens,
        reasoningOutputTokens: usage.reasoningOutputTokens,
        totalTokens: usage.totalTokens,
      });
      continue;
    }

    if (entry.payload?.type !== "token_count" || !entry.timestamp) {
      continue;
    }

    if (isForkedSession && !firstTurnContextSeen) {
      stats.replaySkipped += 1;
      continue;
    }

    stats.tokenEvents += 1;

    const info = entry.payload.info;
    const lastUsage = normalizeUsage(info?.last_token_usage, { fallbackTotalIncludesReasoning: true });
    const totalUsage = normalizeUsage(info?.total_token_usage, { fallbackTotalIncludesReasoning: true });
    const usageReset = totalUsage && previousTotalUsage && isUsageReset(totalUsage, previousTotalUsage);
    if (usageReset) {
      usageResetIndex += 1;
      stats.resetCount += 1;
    }
    let usage = lastUsage;
    if (!usage && totalUsage) {
      usage = previousTotalUsage && !usageReset ? subtractUsage(totalUsage, previousTotalUsage) : totalUsage;
    }
    if (totalUsage) {
      previousTotalUsage = totalUsage;
    }
    if (!usage) {
      continue;
    }
    const eventKey = codexUsageStateKey(entry.timestamp, lastUsage, totalUsage, usageResetIndex);
    if (seenUsageEvents.has(eventKey)) {
      stats.duplicateSkipped += 1;
      continue;
    }
    seenUsageEvents.add(eventKey);
    if (
      usage.inputTokens === 0
      && usage.cachedInputTokens === 0
      && usage.outputTokens === 0
      && usage.cachedOutputTokens === 0
      && usage.reasoningOutputTokens === 0
    ) {
      continue;
    }

    currentModel = extractModel({ ...entry.payload, info }, currentModel) || currentModel || "gpt-5";

    if (!eventMayBeReturned(entry.timestamp, options)) {
      stats.outOfRangeSkipped += 1;
      continue;
    }

    stats.keptEvents += 1;
    events.push({
      sessionId,
      sessionFile: path.basename(file),
      project: currentProject,
      timestamp: entry.timestamp,
      model: currentModel,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
      outputTokens: usage.outputTokens,
      cachedOutputTokens: usage.cachedOutputTokens,
      reasoningOutputTokens: usage.reasoningOutputTokens,
      totalTokens: usage.totalTokens,
    });
  }

  return events;
}

function parseRawSessionFile(file, sessionsDir, content, stats, options = {}) {
  const events = [];
  const sessionId = path.relative(sessionsDir, file).replace(/\.jsonl$/i, "").split(path.sep).join("/");
  const lines = content.split(/\r?\n/);
  let currentModel = null;
  let previousTotalUsage = null;
  let usageResetIndex = 0;
  let currentModelIsFallback = false;
  let currentProject = "(unknown)";
  let isForkedSession = false;
  let firstTurnContextSeen = false;
  const seenUsageEvents = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (entry.type === "session_meta") {
      currentProject = normalizeProjectCwd(entry.payload?.cwd);
      if (isForkedSessionPayload(entry.payload)) {
        isForkedSession = true;
        stats.forkedFiles += 1;
      }
    }

    if (entry.type === "turn_context") {
      firstTurnContextSeen = true;
      currentModel = extractModel(entry.payload, currentModel);
      currentModelIsFallback = false;
      continue;
    }

    if (entry.type !== "event_msg") {
      const usage = normalizeHeadlessCodexUsage(entry);
      if (!usage) {
        continue;
      }
      const timestamp = codexTimestampFromResult(entry);
      if (!timestamp) {
        continue;
      }
      stats.tokenEvents += 1;
      currentModel = extractCodexResultModel(entry, currentModel);
      let model = currentModel;
      if (!model) {
        model = "gpt-5";
        currentModel = model;
        currentModelIsFallback = true;
      }
      if (!eventMayBeReturned(timestamp, options)) {
        stats.outOfRangeSkipped += 1;
        continue;
      }
      stats.keptEvents += 1;
      events.push({
        sessionId,
        sessionFile: path.basename(file),
        project: currentProject,
        timestamp,
        model,
        isFallbackModel: currentModelIsFallback,
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        cacheCreationInputTokens: usage.cacheCreationInputTokens,
        outputTokens: usage.outputTokens,
        cachedOutputTokens: usage.cachedOutputTokens,
        reasoningOutputTokens: usage.reasoningOutputTokens,
        totalTokens: usage.totalTokens,
      });
      continue;
    }

    if (entry.payload?.type !== "token_count" || !entry.timestamp) {
      continue;
    }

    if (isForkedSession && !firstTurnContextSeen) {
      stats.replaySkipped += 1;
      continue;
    }

    stats.tokenEvents += 1;
    const info = entry.payload.info;
    const lastUsage = normalizeUsage(info?.last_token_usage, { fallbackTotalIncludesReasoning: true });
    const totalUsage = normalizeUsage(info?.total_token_usage, { fallbackTotalIncludesReasoning: true });
    const usageReset = totalUsage && previousTotalUsage && isUsageReset(totalUsage, previousTotalUsage);
    if (usageReset) {
      usageResetIndex += 1;
    }
    let usage = lastUsage;

    if (!usage && totalUsage) {
      if (!previousTotalUsage || usageReset) {
        usage = totalUsage;
        if (previousTotalUsage) {
          stats.resetCount += 1;
        }
      } else {
        usage = subtractUsage(totalUsage, previousTotalUsage);
      }
    }

    if (totalUsage) {
      previousTotalUsage = totalUsage;
    }
    if (!usage) {
      continue;
    }
    const eventKey = codexUsageStateKey(entry.timestamp, lastUsage, totalUsage, usageResetIndex);
    if (seenUsageEvents.has(eventKey)) {
      stats.duplicateSkipped += 1;
      continue;
    }
    seenUsageEvents.add(eventKey);
    if (
      usage.inputTokens === 0
      && usage.cachedInputTokens === 0
      && usage.outputTokens === 0
      && usage.cachedOutputTokens === 0
      && usage.reasoningOutputTokens === 0
    ) {
      continue;
    }

    currentModel = extractModel({ ...entry.payload, info }, currentModel);
    let model = currentModel;
    if (!model) {
      model = "gpt-5";
      currentModel = model;
      currentModelIsFallback = true;
    }

    if (!eventMayBeReturned(entry.timestamp, options)) {
      stats.outOfRangeSkipped += 1;
      continue;
    }

    stats.keptEvents += 1;
    events.push({
      sessionId,
      sessionFile: path.basename(file),
      project: currentProject,
      timestamp: entry.timestamp,
      model,
      isFallbackModel: currentModelIsFallback,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
      outputTokens: usage.outputTokens,
      cachedOutputTokens: usage.cachedOutputTokens,
      reasoningOutputTokens: usage.reasoningOutputTokens,
      totalTokens: usage.totalTokens,
    });
  }

  return events;
}

function isUsageReset(current, previous) {
  return current.inputTokens < previous.inputTokens
    || current.cachedInputTokens < previous.cachedInputTokens
    || current.cacheCreationInputTokens < previous.cacheCreationInputTokens
    || current.outputTokens < previous.outputTokens
    || current.cachedOutputTokens < previous.cachedOutputTokens
    || current.reasoningOutputTokens < previous.reasoningOutputTokens
    || current.totalTokens < previous.totalTokens;
}

function subtractUsage(current, previous) {
  return {
    inputTokens: Math.max(current.inputTokens - previous.inputTokens, 0),
    cachedInputTokens: Math.max(current.cachedInputTokens - previous.cachedInputTokens, 0),
    cacheCreationInputTokens: Math.max(current.cacheCreationInputTokens - previous.cacheCreationInputTokens, 0),
    outputTokens: Math.max(current.outputTokens - previous.outputTokens, 0),
    cachedOutputTokens: Math.max(current.cachedOutputTokens - previous.cachedOutputTokens, 0),
    reasoningOutputTokens: Math.max(current.reasoningOutputTokens - previous.reasoningOutputTokens, 0),
    totalTokens: Math.max(current.totalTokens - previous.totalTokens, 0),
  };
}
