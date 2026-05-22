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
  console.log(`Agent Usage Dashboard

Local-first CLI and web dashboard for Codex and Claude Code usage across this
machine and optional SSH remotes. It reads agent JSONL logs, saves aggregate
daily history locally, and exposes JSON APIs for automation.

Quick start:
  npx -y agent-usage-dashboard init --app-dir ./agent-usage-dashboard
  npx -y agent-usage-dashboard serve --app-dir ./agent-usage-dashboard --port 8790
  open http://127.0.0.1:8790/

Commands:
  agent-usage-dashboard usage [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json]
  agent-usage-dashboard daily [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json] [--sessions]
  agent-usage-dashboard sessions [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json]
  agent-usage-dashboard projects [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json]
  agent-usage-dashboard sources [--json]
  agent-usage-dashboard chart [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--out report.html]
  agent-usage-dashboard history [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json]
  agent-usage-dashboard init [--app-dir ~/.agent-usage-dashboard] [--json]
  agent-usage-dashboard serve [--host 127.0.0.1] [--port 8787] [--app-dir ~/.agent-usage-dashboard]

Common queries:
  agent-usage-dashboard sources --app-dir ./agent-usage-dashboard --json
  agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since YYYY-MM-DD --until YYYY-MM-DD --json
  agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --source local-codex --json
  agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --refresh --json

Web API when serve is running:
  GET /api/usage?since=YYYY-MM-DD&until=YYYY-MM-DD&logic=ccusage&host=all&engine=all&source=all
  GET /api/sources
  GET /api/health

Important options:
  --app-dir DIR                 Keep config.json and db/ together in one app directory.
  --config FILE                 Use a specific JSON config file.
  --state-dir DIR               Store history DB somewhere else.
  --source ID[,ID]              Narrow to one or more source ids.
  --local-only                  Skip all SSH remotes.
  --no-aragorn                  Skip ~/.aragorn/resources/*.json discovery.
  --refresh                     Bypass saved historical snapshots and remote caches.
  --history-backfill-days N     Previous days to seed after a refreshed full scan.
  --redact-sensitive            Mask paths, hostnames, source labels, session ids, config paths, and health details.
  --logic raw                   Inspect raw Codex token-count events.

Configuration:
  Local Codex logs:       CODEX_HOME/sessions, default ~/.codex/sessions
  Local Claude Code logs: CLAUDE_HOME/projects, default ~/.claude/projects
  Default config:         ~/.config/agent-usage-dashboard/config.json
  Default history store:  ${DEFAULT_STATE_DIR}
  App directory mode:     --app-dir ./agent-usage-dashboard creates config.json and db/

Remote support:
  Add SSH machines in config.json resources, or enable Aragorn discovery from
  ~/.aragorn/resources/*.json. Use SSH aliases, ssh-agent, or normal SSH config;
  do not put passwords, private keys, API tokens, or .env content in config.

For AI assistants:
  Read docs/AI-QUICKSTART.md for install/query flows.
  Read docs/AI-HANDOFF.md when the user only wants to add SSH remotes.
  The npm package also includes skills/agent-usage-dashboard/SKILL.md.

Notes:
  npx serve is foreground-only; use tmux, launchd, systemd, pm2, Docker, or a
  similar process manager for long-running service mode.
  Use --host 0.0.0.0 only on a trusted network, VPN, SSH tunnel, or authenticated
  reverse proxy. The built-in server has no authentication.
  Counting follows ccusage-style corrected logic and skips common Codex fork
  replay rows that would otherwise over-count subagent sessions.
  `);
}
