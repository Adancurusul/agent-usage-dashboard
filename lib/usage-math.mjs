export const USAGE_FIELDS = [
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

export const REPORTED_USAGE_FIELDS = [
  "reportedInputTokens",
  "reportedCachedInputTokens",
  "reportedCacheCreationInputTokens",
  "reportedOutputTokens",
  "reportedCachedOutputTokens",
  "reportedReasoningOutputTokens",
  "reportedTotalTokens",
];

export function finiteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())) {
    return Number(value);
  }
  return 0;
}

export function normalizeUsage(value, options = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawInputTokens = finiteNumber(value.input_tokens);
  const cachedInputTokens = finiteNumber(value.cached_input_tokens ?? value.cache_read_input_tokens);
  const cacheCreationInputTokens = finiteNumber(value.cache_creation_input_tokens);
  const inputTokens = options.separateCache
    ? rawInputTokens + cachedInputTokens + cacheCreationInputTokens
    : rawInputTokens;
  const rawOutputTokens = finiteNumber(value.output_tokens);
  const cachedOutputTokens = 0;
  const outputTokens = rawOutputTokens;
  const reasoningOutputTokens = finiteNumber(value.reasoning_output_tokens);
  const totalTokens = (options.separateCache ? 0 : finiteNumber(value.total_tokens))
    || inputTokens + outputTokens + (options.fallbackTotalIncludesReasoning ? reasoningOutputTokens : 0);

  if (
    inputTokens === 0
    && cachedInputTokens === 0
    && cacheCreationInputTokens === 0
    && outputTokens === 0
    && cachedOutputTokens === 0
    && reasoningOutputTokens === 0
  ) {
    return null;
  }

  return {
    inputTokens,
    cachedInputTokens: Math.min(cachedInputTokens, inputTokens),
    cacheCreationInputTokens: Math.min(cacheCreationInputTokens, inputTokens),
    outputTokens,
    cachedOutputTokens: Math.min(cachedOutputTokens, outputTokens),
    reasoningOutputTokens,
    totalTokens,
  };
}

export function normalizeProjectCwd(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "(unknown)";
}

export function emptyUsage() {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    outputTokens: 0,
    cachedOutputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    costUSD: 0,
    eventCostUSD: 0,
    reportedInputTokens: 0,
    reportedCachedInputTokens: 0,
    reportedCacheCreationInputTokens: 0,
    reportedOutputTokens: 0,
    reportedCachedOutputTokens: 0,
    reportedReasoningOutputTokens: 0,
    reportedTotalTokens: 0,
  };
}

export function addUsage(target, event) {
  target.inputTokens += event.inputTokens;
  target.cachedInputTokens += event.cachedInputTokens;
  target.cacheCreationInputTokens += event.cacheCreationInputTokens || 0;
  target.outputTokens += event.outputTokens;
  target.cachedOutputTokens += event.cachedOutputTokens || 0;
  target.reasoningOutputTokens += event.reasoningOutputTokens;
  target.totalTokens += event.totalTokens;
  const reportedCost = finiteNumber(event.eventCostUSD ?? event.costUSD);
  target.eventCostUSD += reportedCost;
  addReportedUsage(target, event, reportedCost);
}

function addReportedUsage(target, event, reportedCost) {
  const hasReportedBreakdown = REPORTED_USAGE_FIELDS.some((field) => event[field] !== undefined);
  if (hasReportedBreakdown) {
    for (const field of REPORTED_USAGE_FIELDS) {
      target[field] += finiteNumber(event[field]);
    }
    return;
  }
  if (reportedCost <= 0) {
    return;
  }
  target.reportedInputTokens += event.inputTokens || 0;
  target.reportedCachedInputTokens += event.cachedInputTokens || 0;
  target.reportedCacheCreationInputTokens += event.cacheCreationInputTokens || 0;
  target.reportedOutputTokens += event.outputTokens || 0;
  target.reportedCachedOutputTokens += event.cachedOutputTokens || 0;
  target.reportedReasoningOutputTokens += event.reasoningOutputTokens || 0;
  target.reportedTotalTokens += event.totalTokens || 0;
}
