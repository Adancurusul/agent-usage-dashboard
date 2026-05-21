---
name: agent-usage-dashboard
description: Query Codex and Claude Code usage from Agent Usage Dashboard. Use when the user asks for AI agent token usage, per-source usage, local/remote Codex or Claude Code usage, cached input/output tokens, source health, or dashboard monitoring data.
---

# Agent Usage Dashboard

Use the JSON interfaces. Do not scrape the HTML UI.

## Install And Configure

When the user gives SSH login details and asks to add machines, create or edit the app config instead of hardcoding hosts in source code:

```bash
npx -y agent-usage-dashboard init --app-dir ./agent-usage-dashboard
```

Edit `./agent-usage-dashboard/config.json`:

```json
{
  "discoverAragornResources": true,
  "history": { "enabled": true, "dbDir": "./db", "retentionDays": 180, "backfillDays": 180 },
  "resources": [
    {
      "id": "remote-name",
      "label": "Remote Name",
      "sshHost": "user@host-or-ssh-alias",
      "enabled": true,
      "codexHome": "~/.codex",
      "claudeHome": "~/.claude"
    }
  ]
}
```

Validate before reporting success:

```bash
ssh user@host-or-ssh-alias 'python3 --version && ls -d ~/.codex ~/.claude 2>/dev/null || true'
npx -y agent-usage-dashboard sources --app-dir ./agent-usage-dashboard --json
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since YYYY-MM-DD --until YYYY-MM-DD --json
```

Use `--refresh` once when a previous day needs to be rebuilt from source logs. Historical views normally load from saved local snapshots.

## Quick Queries

List configured source ids:

```bash
npx -y agent-usage-dashboard sources --app-dir ./agent-usage-dashboard --json
```

Get the full usage payload:

```bash
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since YYYY-MM-DD --until YYYY-MM-DD --json
```

Narrow to one source:

```bash
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since YYYY-MM-DD --until YYYY-MM-DD --source <source-id> --json
```

If the local web service is already running:

```bash
curl -s "http://127.0.0.1:8790/api/usage?since=YYYY-MM-DD&until=YYYY-MM-DD&logic=ccusage&host=all&engine=all&source=all"
curl -s "http://127.0.0.1:8790/api/sources"
curl -s "http://127.0.0.1:8790/api/health"
```

Force a fresh scan:

```bash
curl -s "http://127.0.0.1:8790/api/usage?since=YYYY-MM-DD&until=YYYY-MM-DD&refresh=1"
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since YYYY-MM-DD --until YYYY-MM-DD --refresh --json
```

The web server is localhost-only by default. If the user intentionally exposes it with `serve --host 0.0.0.0`, use `http://<machine-ip>:8790/api/...`; mention that there is no built-in auth.

## Fields To Report

- `summary.inputTokens`: input tokens including cached input and cache creation.
- `summary.cachedInputTokens`: cached input tokens.
- `summary.cacheCreationInputTokens`: cache creation input tokens.
- `summary.outputTokens`: output tokens, following `ccusage` v20.
- `summary.cachedOutputTokens`: schema-stable field; currently 0 because `ccusage` v20 does not expose cached output.
- `summary.reasoningOutputTokens`: reasoning output tokens.
- `summary.totalTokens`: total tokens used for charts and rollups.
- `complete`: false means one or more selected sources failed.
- `staleSnapshotEvents`: saved source/day aggregates used because live reading failed.
- `history.trendSince` / `history.trendUntil`: saved daily history window used by `trendDaily`.
- `history.backfill`: explicit-refresh previous-day backfill status.
- `history.backfill.sourceErrorDetails`: failed sources during history backfill.
- `trendDaily`: saved daily snapshots merged with the current live scan for charting.
- `trendDaily[].partial`: incomplete saved history row; mention this when reporting historical totals.
- `historyOnly`: true means the historical response came from saved daily snapshots and did not scan sources.
- `sourceStatus`: per-source scan status.
- `sourceAlerts`: failed or empty sources that need attention.

For per-source, per-host, per-engine, per-project, or per-session answers, read the corresponding arrays in the `usage --json` payload: `sources`, `hosts`, `engines`, `projects`, and `sessions`.

## Safety

Do not store SSH secrets, API keys, private keys, or `.env` content in repo files. Treat project paths and session ids as potentially sensitive metadata.
