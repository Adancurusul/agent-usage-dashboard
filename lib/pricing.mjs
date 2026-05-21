import { lookup } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const MILLION = 1_000_000;
const DEFAULT_PRICING_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PRICING_URL_TIMEOUT_MS = 5_000;
const DEFAULT_PRICING_URL_MAX_BYTES = 1_000_000;
const PRICING_URL_CACHE = new Map();

let modelPricing = {};
let lastPricingStatus = {
  configuredModels: [],
  configuredModelCount: 0,
  loadedAt: null,
  ttlMs: DEFAULT_PRICING_TTL_MS,
  sources: [],
  errors: [],
};

export async function configureModelPricing(config = {}, options = {}) {
  const normalizedConfig = normalizePricingConfig(config);
  const nextPricing = {};
  const sources = [];
  const errors = [];

  if (normalizedConfig.path) {
    const result = await loadPricingPath(normalizedConfig.path, options.configPath);
    if (result.error) {
      errors.push(result.error);
    } else {
      Object.assign(nextPricing, result.models);
      sources.push(result.source);
    }
  }

  if (normalizedConfig.url) {
    const result = await loadPricingUrl(normalizedConfig.url, normalizedConfig);
    if (result.error) {
      errors.push(result.error);
    }
    if (result.models) {
      Object.assign(nextPricing, result.models);
      sources.push(result.source);
    }
  }

  const inlineModels = normalizePricing(normalizedConfig.models);
  if (Object.keys(inlineModels).length) {
    Object.assign(nextPricing, inlineModels);
    sources.push({
      type: "inline",
      modelCount: Object.keys(inlineModels).length,
    });
  }

  modelPricing = nextPricing;
  lastPricingStatus = {
    configuredModels: pricingModelNames(),
    configuredModelCount: pricingModelNames().length,
    loadedAt: new Date().toISOString(),
    ttlMs: normalizedConfig.ttlMs,
    sources,
    errors,
  };
}

export function pricingModelNames() {
  return Object.keys(modelPricing).sort();
}

export function pricingStatus() {
  return {
    ...lastPricingStatus,
    configuredModels: pricingModelNames(),
    configuredModelCount: pricingModelNames().length,
    sources: [...(lastPricingStatus.sources || [])],
    errors: [...(lastPricingStatus.errors || [])],
  };
}

export function cost(usage, model) {
  return estimateCost(usage, model).costUSD;
}

export function estimateCost(usage, model) {
  const match = pricingForModel(model);
  if (!match) {
    return {
      costUSD: 0,
      priced: false,
      pricingModel: null,
      costSource: "missing-pricing",
    };
  }
  const pricing = match.pricing;
  const { input, cached, cacheCreation } = splitInputTokens(usage);
  const costUSD = input / MILLION * pricing.input
    + cached / MILLION * pricing.cached
    + cacheCreation / MILLION * (pricing.cacheCreation ?? pricing.input)
    + usage.outputTokens / MILLION * pricing.output;
  return {
    costUSD,
    priced: true,
    pricingModel: match.model,
    costSource: "configured-pricing",
  };
}

export function hasPricingForModel(model) {
  return Boolean(pricingForModel(model));
}

function normalizePricing(overrides) {
  return Object.fromEntries(Object.entries(overrides || {}).flatMap(([model, pricing]) => {
    if (!model || !pricing || typeof pricing !== "object") {
      return [];
    }
    const input = priceRate(pricing.input ?? pricing.inputTokens ?? pricing.input_per_million);
    const output = priceRate(pricing.output ?? pricing.outputTokens ?? pricing.output_per_million);
    if (input == null || output == null || input <= 0 || output <= 0) {
      return [];
    }
    const cached = priceRate(pricing.cached ?? pricing.cacheRead ?? pricing.cache_read ?? pricing.cachedInput);
    const cacheCreation = priceRate(
      pricing.cacheCreation
        ?? pricing.cacheCreate
        ?? pricing.cache_creation
        ?? pricing.cacheCreationInput
        ?? pricing.cache_creation_input,
    );
    const normalized = {
      input,
      cached: cached ?? input,
      cacheCreation: cacheCreation ?? input,
      output,
    };
    return [[String(model), normalized]];
  }));
}

function pricingForModel(model) {
  const modelName = String(model || "");
  const normalized = modelName.toLowerCase();
  const entries = Object.entries(modelPricing);
  const exactMatch = entries.find(([name]) => name === modelName || name.toLowerCase() === normalized);
  if (exactMatch) {
    return { model: exactMatch[0], pricing: exactMatch[1] };
  }
  const prefixMatch = Object.entries(modelPricing)
    .sort(([left], [right]) => right.length - left.length)
    .find(([prefix]) => normalized.startsWith(prefix.toLowerCase()));
  if (prefixMatch) {
    return { model: prefixMatch[0], pricing: prefixMatch[1] };
  }
  return null;
}

function normalizePricingConfig(config) {
  const value = config && typeof config === "object" ? config : {};
  const providerKeys = new Set([
    "models",
    "modelPricing",
    "path",
    "file",
    "pricingPath",
    "modelPricingPath",
    "url",
    "pricingUrl",
    "modelPricingUrl",
    "ttlMs",
    "cacheTtlMs",
    "ttlSeconds",
    "timeoutMs",
    "maxBytes",
    "allowPrivateUrl",
  ]);
  const hasProviderKeys = Object.keys(value).some((key) => providerKeys.has(key));
  const ttlSeconds = positiveNumber(value.ttlSeconds);
  return {
    models: hasProviderKeys ? (value.models || value.modelPricing || {}) : value,
    path: stringOrNull(value.path || value.file || value.pricingPath || value.modelPricingPath),
    url: stringOrNull(value.url || value.pricingUrl || value.modelPricingUrl),
    ttlMs: positiveNumber(value.ttlMs ?? value.cacheTtlMs)
      || (ttlSeconds ? ttlSeconds * 1000 : DEFAULT_PRICING_TTL_MS),
    timeoutMs: positiveNumber(value.timeoutMs) || DEFAULT_PRICING_URL_TIMEOUT_MS,
    maxBytes: positiveNumber(value.maxBytes) || DEFAULT_PRICING_URL_MAX_BYTES,
    allowPrivateUrl: value.allowPrivateUrl === true,
  };
}

async function loadPricingPath(file, configPath) {
  const resolvedPath = resolveConfigPath(file, configPath);
  try {
    const parsed = JSON.parse(await readFile(resolvedPath, "utf8"));
    const models = normalizePricing(pricingModelsFromDocument(parsed));
    return {
      models,
      source: {
        type: "path",
        path: resolvedPath,
        modelCount: Object.keys(models).length,
      },
    };
  } catch (error) {
    return { error: `pricing path ${resolvedPath}: ${error.message}` };
  }
}

async function loadPricingUrl(url, config) {
  const ttlMs = config.ttlMs;
  const cached = PRICING_URL_CACHE.get(url);
  const now = Date.now();
  if (cached && now - cached.storedAt < ttlMs) {
    return {
      models: cached.models,
      source: {
        type: "url",
        url,
        modelCount: Object.keys(cached.models).length,
        cacheHit: true,
        fetchedAt: cached.fetchedAt,
      },
    };
  }

  try {
    const safeUrl = await validatePricingUrl(url, config.allowPrivateUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    const response = await fetch(safeUrl, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const parsed = JSON.parse(await readResponseText(response, config.maxBytes));
    const models = normalizePricing(pricingModelsFromDocument(parsed));
    const fetchedAt = new Date().toISOString();
    PRICING_URL_CACHE.set(url, { models, storedAt: now, fetchedAt });
    return {
      models,
      source: {
        type: "url",
        url,
        modelCount: Object.keys(models).length,
        cacheHit: false,
        fetchedAt,
      },
    };
  } catch (error) {
    if (cached) {
      return {
        models: cached.models,
        error: `pricing url ${url}: ${error.message}; using stale cached pricing`,
        source: {
          type: "url",
          url,
          modelCount: Object.keys(cached.models).length,
          cacheHit: true,
          stale: true,
          fetchedAt: cached.fetchedAt,
        },
      };
    }
    return { error: `pricing url ${url}: ${error.message}` };
  }
}

function splitInputTokens(usage) {
  const inputTokens = finitePriceNumber(usage.inputTokens);
  const cacheCreation = Math.min(finitePriceNumber(usage.cacheCreationInputTokens), inputTokens);
  const cached = Math.min(finitePriceNumber(usage.cachedInputTokens), Math.max(inputTokens - cacheCreation, 0));
  return {
    input: Math.max(inputTokens - cached - cacheCreation, 0),
    cached,
    cacheCreation,
  };
}

async function validatePricingUrl(value, allowPrivateUrl) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("invalid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("only http and https pricing URLs are supported");
  }
  if (parsed.username || parsed.password) {
    throw new Error("pricing URL credentials are not allowed");
  }
  if (!allowPrivateUrl) {
    await assertPublicHostname(parsed.hostname);
  }
  return parsed.toString();
}

async function assertPublicHostname(hostname) {
  const cleanHost = String(hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
  if (!cleanHost || cleanHost === "localhost" || cleanHost.endsWith(".localhost")) {
    throw new Error("private pricing URL host is blocked; set allowPrivateUrl only for trusted local configs");
  }
  const directIp = net.isIP(cleanHost) ? [cleanHost] : [];
  const resolvedIps = directIp.length
    ? directIp
    : (await lookup(cleanHost, { all: true })).map((item) => item.address);
  if (!resolvedIps.length || resolvedIps.some(isPrivateIp)) {
    throw new Error("private pricing URL address is blocked; set allowPrivateUrl only for trusted local configs");
  }
}

function isPrivateIp(value) {
  const ip = String(value || "").toLowerCase();
  if (net.isIP(ip) === 4) {
    const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
    return parts[0] === 10
      || parts[0] === 127
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
      || parts[0] === 0;
  }
  if (net.isIP(ip) === 6) {
    return ip === "::1"
      || ip.startsWith("fc")
      || ip.startsWith("fd")
      || ip.startsWith("fe80:")
      || ip === "::"
      || ip.startsWith("::ffff:127.")
      || ip.startsWith("::ffff:10.")
      || ip.startsWith("::ffff:192.168.")
      || ip.startsWith("::ffff:169.254.");
  }
  return true;
}

async function readResponseText(response, maxBytes) {
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new Error(`pricing response exceeds ${maxBytes} bytes`);
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > maxBytes) {
      throw new Error(`pricing response exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function pricingModelsFromDocument(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  if (parsed.models && typeof parsed.models === "object") {
    return parsed.models;
  }
  if (parsed.pricing && typeof parsed.pricing === "object") {
    return normalizePricingConfig(parsed.pricing).models;
  }
  if (parsed.modelPricing && typeof parsed.modelPricing === "object") {
    return parsed.modelPricing;
  }
  return parsed;
}

function resolveConfigPath(value, configPath) {
  const expanded = expandHome(String(value || ""));
  if (path.isAbsolute(expanded)) {
    return expanded;
  }
  return path.resolve(path.dirname(configPath || process.cwd()), expanded);
}

function expandHome(value) {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function priceRate(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())) {
    return Number(value);
  }
  return null;
}

function finitePriceNumber(value) {
  const parsed = priceRate(value);
  return parsed ?? 0;
}

function positiveNumber(value) {
  const parsed = priceRate(value);
  return parsed && parsed > 0 ? parsed : null;
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
