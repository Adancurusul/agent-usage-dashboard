import os from "node:os";
import path from "node:path";

import { normalizeDate, todayKey } from "./dates.mjs";

const DEFAULT_CODEX_HOME = path.join(os.homedir(), ".codex");
const DEFAULT_CLAUDE_HOME = path.join(os.homedir(), ".claude");
const REMOTE_SOURCE_TIMEOUT_MS = 45_000;
const DEFAULT_USAGE_CONFIG = path.join(os.homedir(), ".config", "agent-usage-dashboard", "config.json");
const DEFAULT_REPORT_PATH = path.join(os.tmpdir(), "agent-usage-dashboard-report.html");
export const DEFAULT_STATE_DIR = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "agent-usage-dashboard");
export const DEFAULT_HISTORY_BACKFILL_DAYS = 180;
const DEFAULT_APP_DIR = process.env.AGENT_USAGE_DASHBOARD_HOME
  ? expandHome(process.env.AGENT_USAGE_DASHBOARD_HOME)
  : null;

export function parseArgs(argv) {
  const configFromEnv = Boolean(process.env.AGENT_USAGE_DASHBOARD_CONFIG);
  const stateFromEnv = Boolean(process.env.AGENT_USAGE_DASHBOARD_STATE_DIR);
  const args = {
    command: "daily",
    codexHome: process.env.CODEX_HOME || DEFAULT_CODEX_HOME,
    claudeHome: process.env.CLAUDE_HOME || DEFAULT_CLAUDE_HOME,
    since: null,
    until: null,
    json: false,
    sessions: false,
    out: DEFAULT_REPORT_PATH,
    port: 8787,
    host: process.env.AGENT_USAGE_DASHBOARD_HOST || "127.0.0.1",
    logic: normalizeLogic(process.env.AGENT_USAGE_LOGIC),
    localOnly: process.env.CODEX_USAGE_LOCAL_ONLY === "1",
    sources: [],
    forceRefresh: false,
    appDir: DEFAULT_APP_DIR,
    configPath: process.env.AGENT_USAGE_DASHBOARD_CONFIG
      ? expandHome(process.env.AGENT_USAGE_DASHBOARD_CONFIG)
      : (DEFAULT_APP_DIR ? appConfigPath(DEFAULT_APP_DIR) : DEFAULT_USAGE_CONFIG),
    discoverAragornResources: process.env.AGENT_USAGE_DISCOVER_ARAGORN !== "0",
    remoteTimeoutMs: REMOTE_SOURCE_TIMEOUT_MS,
    redactSensitive: process.env.AGENT_USAGE_REDACT_SENSITIVE === "1"
      ? true
      : (process.env.AGENT_USAGE_REDACT_SENSITIVE === "0" ? false : null),
    stateDir: process.env.AGENT_USAGE_DASHBOARD_STATE_DIR
      ? expandHome(process.env.AGENT_USAGE_DASHBOARD_STATE_DIR)
      : (DEFAULT_APP_DIR ? appDbDir(DEFAULT_APP_DIR) : DEFAULT_STATE_DIR),
    historyEnabled: process.env.AGENT_USAGE_HISTORY !== "0",
    historyRetentionDays: 180,
    historyBackfillDays: DEFAULT_HISTORY_BACKFILL_DAYS,
  };
  let configPathExplicit = configFromEnv;
  let stateDirExplicit = stateFromEnv;

  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith("-")) {
    args.command = rest.shift();
  }

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--sessions") {
      args.sessions = true;
    } else if (arg === "--codex-home") {
      args.codexHome = rest[++index];
    } else if (arg === "--claude-home") {
      args.claudeHome = rest[++index];
    } else if (arg === "--since") {
      args.since = normalizeDate(rest[++index]);
    } else if (arg === "--until") {
      args.until = normalizeDate(rest[++index]);
    } else if (arg === "--out") {
      args.out = rest[++index];
    } else if (arg === "--port") {
      args.port = Number.parseInt(rest[++index], 10);
    } else if (arg === "--host") {
      args.host = rest[++index];
    } else if (arg === "--logic") {
      args.logic = normalizeLogic(rest[++index]);
    } else if (arg === "--source") {
      args.sources.push(...String(rest[++index] || "").split(",").map((item) => item.trim()).filter(Boolean));
    } else if (arg === "--refresh" || arg === "--force") {
      args.forceRefresh = true;
    } else if (arg === "--config") {
      args.configPath = expandHome(rest[++index]);
      configPathExplicit = true;
    } else if (arg === "--app-dir") {
      args.appDir = expandHome(rest[++index]);
      if (!configPathExplicit) {
        args.configPath = appConfigPath(args.appDir);
      }
      if (!stateDirExplicit) {
        args.stateDir = appDbDir(args.appDir);
      }
    } else if (arg === "--no-aragorn") {
      args.discoverAragornResources = false;
    } else if (arg === "--local-only") {
      args.localOnly = true;
    } else if (arg === "--redact-sensitive") {
      args.redactSensitive = true;
    } else if (arg === "--no-redact-sensitive") {
      args.redactSensitive = false;
    } else if (arg === "--remote-timeout-ms") {
      args.remoteTimeoutMs = Number.parseInt(rest[++index], 10);
    } else if (arg === "--state-dir") {
      args.stateDir = expandHome(rest[++index]);
      stateDirExplicit = true;
    } else if (arg === "--no-history") {
      args.historyEnabled = false;
    } else if (arg === "--history-retention-days") {
      args.historyRetentionDays = Number.parseInt(rest[++index], 10);
    } else if (arg === "--history-backfill-days") {
      args.historyBackfillDays = Number.parseInt(rest[++index], 10);
    } else if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!["usage", "daily", "sessions", "projects", "sources", "chart", "serve", "history", "init"].includes(args.command)) {
    throw new Error(`Unknown command: ${args.command}`);
  }

  if (["chart", "usage"].includes(args.command) && !args.since && !args.until) {
    const today = todayKey();
    args.since = today;
    args.until = today;
  }

  if (args.redactSensitive == null) {
    args.redactSensitive = args.command === "serve" && isExternalHost(args.host);
  }

  return args;
}

export function normalizeLogic(value) {
  if (value == null || value === "" || value === "ccusage" || value === "corrected") {
    return "ccusage";
  }
  if (value === "raw") {
    return "raw";
  }
  throw new Error(`Invalid logic: ${value}. Expected ccusage or raw.`);
}

export function appConfigPath(appDir) {
  return path.join(appDir, "config.json");
}

export function appDbDir(appDir) {
  return path.join(appDir, "db");
}

export function expandHome(value) {
  if (!value) {
    return value;
  }
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function isExternalHost(host) {
  return !["127.0.0.1", "localhost", "::1"].includes(String(host || "").toLowerCase());
}

function printHelp() {
  console.log(`Usage:
  agent-usage-dashboard usage [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json]
  agent-usage-dashboard daily [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json] [--sessions]
  agent-usage-dashboard sessions [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json]
  agent-usage-dashboard projects [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json]
  agent-usage-dashboard sources [--json]
  agent-usage-dashboard chart [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--out report.html]
  agent-usage-dashboard history [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json]
  agent-usage-dashboard init [--app-dir ~/.agent-usage-dashboard] [--json]
  agent-usage-dashboard serve [--host 127.0.0.1] [--port 8787] [--app-dir ~/.agent-usage-dashboard]

Reads Codex JSONL logs from CODEX_HOME/sessions and Claude Code JSONL logs from CLAUDE_HOME/projects.
Remote sources are discovered from ~/.aragorn/resources/*.json plus the optional JSON config.
Use --local-only to skip remote SSH sources, --no-aragorn to skip Aragorn discovery, or --source local-codex,myhost-codex to narrow.
Use --logic raw to inspect raw Codex token-count events.
Use --app-dir to keep config.json and db/ together in one directory.
Usage history is saved under ${DEFAULT_STATE_DIR} unless --state-dir is provided.
Use --refresh to bypass saved historical snapshots and remote caches for usage scans.
Use --history-backfill-days to choose how many previous days a refreshed full ccusage scan should seed into local history.
Use --host 0.0.0.0 only when you intentionally want the web UI/API reachable from other machines.
Use --redact-sensitive to mask project paths, session ids, config paths, and detailed health metadata in API responses.
Dashboard mode exposes /api/usage for data, /api/sources for configured source ids, and /api/health for monitor probes.
Fixes common Codex fork over-counting by skipping replayed token events in forked subagent logs.
  `);
}
