# Agent Usage Dashboard

Agent Usage Dashboard is a local web UI and CLI for viewing Codex and Claude Code usage across your laptop and SSH-accessible remote machines.

It is designed for a small team or a single power user who runs agents on multiple hosts and wants one place to answer:

- How many tokens did each agent source use today?
- Which remote machine, engine, project, or session used the most?
- Are all configured remotes reachable?
- What changed when looking at one source versus all sources?

## Features

- Local Codex usage from `CODEX_HOME/sessions`, default `~/.codex/sessions`
- Local Claude Code usage from `CLAUDE_HOME/projects`, default `~/.claude/projects`
- Remote Codex and Claude Code usage over SSH
- Aragorn resource discovery from `~/.aragorn/resources/*.json`
- JSON config for additional remotes, labels, and paths
- AI-friendly JSON output from `npx -y agent-usage-dashboard usage --json`
- Bundled `agent-usage-dashboard` skill for AI assistants that need usage data
- Source, host, and engine filters
- Source health alerts for failed or empty scans, with forced re-read from the UI
- Daily overview, hourly trend, and daily detail chart tabs
- Local daily snapshot history for previous-day and longer-range trend views
- Per-source daily snapshots; failed sources can show the last saved aggregate while clearly marking the view as incomplete
- Codex counting follows the current `ccusage` token-count semantics
- `/api/usage` for dashboard data
- `/api/sources` for configured source ids
- `/api/health` for monitoring

Remote collection runs a small Python exporter over SSH and returns usage metadata only: timestamps, model, token counts, project or cwd, session id, and file stats. It does not copy full conversation transcripts.

## Quick Start

Lowest-friction app directory setup:

```bash
npx -y agent-usage-dashboard init --app-dir ./agent-usage-dashboard
npx -y agent-usage-dashboard serve --app-dir ./agent-usage-dashboard --port 8790
```

That keeps user config and local aggregate DB together:

```text
./agent-usage-dashboard/config.json
./agent-usage-dashboard/db/
```

Run from this checkout:

```bash
npm run serve
```

Open:

```text
http://127.0.0.1:8790/
```

`npx ... serve` is not a permanent daemon. It runs while that process is alive. For long-running use, run it under tmux, launchd, systemd, pm2, Docker, or another process manager. See [docs/RUNNING.md](docs/RUNNING.md).

## AI Setup Checklist

Give this section to an AI assistant together with the SSH login names or aliases for each machine.

1. Install or run the app:

```bash
npx -y agent-usage-dashboard init --app-dir ./agent-usage-dashboard
npx -y agent-usage-dashboard serve --app-dir ./agent-usage-dashboard --port 8790
```

2. Edit `./agent-usage-dashboard/config.json`. Add one `resources` entry per remote machine. The app scans `codexHome` and `claudeHome` on that host; omit a path or set `enabled: false` if that engine is not used.

```json
{
  "discoverAragornResources": true,
  "history": { "enabled": true, "dbDir": "./db", "retentionDays": 180, "backfillDays": 180 },
  "resources": [
    {
      "id": "hongdachen",
      "label": "hongdachen",
      "sshHost": "hongdachen",
      "enabled": true,
      "codexHome": "~/.codex",
      "claudeHome": "~/.claude"
    },
    {
      "id": "volcengine",
      "label": "Volcengine server",
      "sshHost": "root@1.2.3.4",
      "enabled": true,
      "codexHome": "~/.codex",
      "claudeHome": "~/.claude"
    }
  ]
}
```

3. Verify SSH first, then verify sources:

```bash
ssh hongdachen 'python3 --version && ls -d ~/.codex ~/.claude 2>/dev/null || true'
npx -y agent-usage-dashboard sources --app-dir ./agent-usage-dashboard --json
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since 2026-05-19 --until 2026-05-19 --json
```

4. If a historical day looks stale or incomplete, force a scan once:

```bash
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since 2026-05-19 --until 2026-05-19 --refresh --json
```

Config tips:

- macOS/Linux defaults are usually `~/.codex` and `~/.claude`.
- Windows via WSL should use Linux paths inside WSL.
- SSH must be non-interactive; set up keys before running the dashboard.
- The dashboard shows source health alerts when a machine, path, or engine cannot be read.

Run the CLI directly:

```bash
node bin/agent-usage-dashboard.mjs daily --since 2026-05-19 --until 2026-05-19 --json
node bin/agent-usage-dashboard.mjs usage --since 2026-05-19 --until 2026-05-19 --json
node bin/agent-usage-dashboard.mjs serve --port 8790
```

After publishing to npm, the intended one-off usage is:

```bash
npx -y agent-usage-dashboard serve --port 8790
npx -y agent-usage-dashboard usage --since 2026-05-19 --json
```

Create a self-contained app directory with config and DB together:

```bash
npx -y agent-usage-dashboard init --app-dir ./agent-usage-dashboard
npx -y agent-usage-dashboard serve --app-dir ./agent-usage-dashboard --port 8790
npx -y agent-usage-dashboard sources --app-dir ./agent-usage-dashboard --json
```

That creates:

```text
./agent-usage-dashboard/config.json
./agent-usage-dashboard/db/
```

## Configuration

Default config path:

```text
~/.config/agent-usage-dashboard/config.json
```

For npm/npx installs, start from `init` instead of copying checkout files:

```bash
agent-usage-dashboard init --app-dir ~/.agent-usage-dashboard
```

When working from this source checkout, you can also copy [examples/config.example.json](examples/config.example.json).

Minimal config:

```json
{
  "discoverAragornResources": true,
  "history": {
    "enabled": true,
    "dbDir": "./db",
    "retentionDays": 180,
    "backfillDays": 180
  },
  "resources": [
    {
      "id": "team-mac",
      "label": "Team Mac",
      "sshHost": "team-mac",
      "enabled": true,
      "codexHome": "~/.codex",
      "claudeHome": "~/.claude"
    }
  ]
}
```

Use a custom config file:

```bash
agent-usage-dashboard serve --port 8790 --config ./agent-usage-dashboard.config.json
```

Disable Aragorn resource discovery:

```bash
agent-usage-dashboard serve --port 8790 --no-aragorn --config ./agent-usage-dashboard.config.json
```

More details: [docs/CONFIG.md](docs/CONFIG.md).

For suspicious totals or hourly buckets, see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md). In particular, Codex forked/subagent sessions can contain replayed parent-thread token counts; the dashboard skips those replay rows and reports them as `stats.replaySkipped`.

## Optional Pricing Fields

The default dashboard and human-readable CLI output are token-first and do not show price estimates. The JSON API keeps optional cost fields for teams that want to configure them later. There is no hardcoded provider price table; estimated JSON cost fields only use:

- `costUSD` reported by source logs, when present
- model prices you configure in `pricing.models`, `pricing.path`, or `pricing.url`

Unpriced models are listed in `pricing.missingModels` in `/api/usage` and `usage --json`. URL price tables are cached by `pricing.ttlMs`; they are not fetched on every dashboard request.

Example:

```json
{
  "pricing": {
    "models": {
      "my-model-prefix": {
        "input": 1.25,
        "cached": 0.125,
        "cacheCreation": 1.25,
        "output": 10
      }
    }
  }
}
```

## Running And Install Modes

Use `npx` for trials and one-shot commands:

```bash
npx -y agent-usage-dashboard usage --since 2026-05-19 --until 2026-05-19 --json
```

Use `npm install -g` or a process manager for repeated service use:

```bash
npm install -g agent-usage-dashboard
agent-usage-dashboard serve --app-dir ~/.agent-usage-dashboard --port 8790
```

Simple tmux service:

```bash
tmux new-session -d -s agent-usage-dashboard \
  'agent-usage-dashboard serve --app-dir ~/.agent-usage-dashboard --port 8790'
```

By default the web UI and API listen only on `127.0.0.1`. To intentionally expose them to another machine:

```bash
agent-usage-dashboard serve --host 0.0.0.0 --port 8790
```

There is no built-in authentication. Do not expose this directly to the public internet; prefer Tailscale, VPN, SSH tunnel, or a reverse proxy with auth.

When binding to a non-localhost address, sensitive API redaction is enabled by default. It masks project paths, session ids, config paths, and detailed health metadata. You can also force it locally with `--redact-sensitive`.

## JSON For AI

If another AI assistant needs to install, configure, or query the dashboard, give it [docs/AI-QUICKSTART.md](docs/AI-QUICKSTART.md). If it only needs to add a remote, give it [docs/AI-HANDOFF.md](docs/AI-HANDOFF.md) plus the SSH login method.

After npm or npx install, an AI assistant can read usage as JSON without scraping the UI:

```bash
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since 2026-05-19 --until 2026-05-19 --json
npx -y agent-usage-dashboard sources --app-dir ./agent-usage-dashboard --json
npx -y agent-usage-dashboard daily --app-dir ./agent-usage-dashboard --since 2026-05-19 --until 2026-05-19 --json
npx -y agent-usage-dashboard sessions --app-dir ./agent-usage-dashboard --since 2026-05-19 --json
npx -y agent-usage-dashboard projects --app-dir ./agent-usage-dashboard --since 2026-05-19 --json
npx -y agent-usage-dashboard history --app-dir ./agent-usage-dashboard --since 2026-05-01 --until 2026-05-19 --json
```

If the web service is running, it can also fetch:

```bash
curl -s "http://127.0.0.1:8790/api/usage?since=2026-05-19&until=2026-05-19&logic=ccusage&host=all&engine=all&source=all"
curl -s "http://127.0.0.1:8790/api/sources"
curl -s "http://127.0.0.1:8790/api/health"
```

For another machine to call the Web API, start with `--host 0.0.0.0` and use `http://<machine-ip>:8790/api/...`. See [docs/RUNNING.md](docs/RUNNING.md) for the security notes.

`usage --json` returns the same high-level shape as `/api/usage`: summary, daily rows, hourly rows, source/host/engine breakdowns, sessions, projects, source health, filters, and snapshot history state. `sources --json` is the quickest way for another AI assistant to discover valid `--source` ids before narrowing a query.

These JSON surfaces are the recommended integration points for AI tools. See [docs/JSON.md](docs/JSON.md).

A bundled skill is available at [skills/agent-usage-dashboard/SKILL.md](skills/agent-usage-dashboard/SKILL.md) for agents that support local skills.

## Remote Discovery

Remote sources come from two places:

1. Aragorn machine resources in `~/.aragorn/resources/*.json`
2. Dashboard JSON config in `~/.config/agent-usage-dashboard/config.json`

This is not tied to one Aragorn workspace. The dashboard reads Aragorn machine resource records and then connects over SSH. A remote appears only if it has a usable `ssh.host` or `host` value and is not disabled or redacted.

Every machine becomes two selectable sources:

- `<id>-codex`
- `<id>-claude-code`

Examples:

```bash
agent-usage-dashboard daily --source local-codex --json
agent-usage-dashboard daily --source team-mac-claude-code --json
```

## Dashboard

The web dashboard supports:

- Date ranges: today, yesterday, last 7 days, last 30 days, custom
- Logic: `ccusage` or raw Codex token-count events
- Metrics: input including cached, uncached input, cached input, cache creation, output, total
- Breakdown: source, engine, host, or total only
- Filters: host, engine, source
- Tabs: daily overview, hourly trend, daily detail
- Snapshot Store: saved daily history, trend window, state path, retention, latest saved day
- Source Health: failed sources, empty sources, file/event counts, and retry action

Charts include value labels and breakdown labels so the UI does not rely on color alone.

## Snapshot History

The dashboard can save canonical daily snapshots under:

```text
~/.local/state/agent-usage-dashboard/history/daily/
```

Snapshots are written only for full `ccusage` scans with all sources, all hosts, and all engines selected. Filtered or `--local-only` views stay live-only so they do not overwrite whole-dashboard history with partial data.

Manual Refresh also backfills previous days from the available local and remote logs, up to `history.backfillDays` days. Backfill is intentionally deferred until Refresh or `--refresh` so the first page load does not block on long SSH scans. If a source fails during backfill, older daily rows can be saved as `partial`; the UI labels them instead of silently treating the failed source as zero.

When a full unfiltered historical range is already saved, the dashboard serves it from local snapshot history by default. Use the Refresh button or `refresh=1` only when you intentionally want to re-read local and SSH sources for that historical day.

Successful scans also save per-source daily snapshots under:

```text
~/.local/state/agent-usage-dashboard/history/sources/<source-id>/
```

These source snapshots are written for filtered and full scans. If a source later fails to read, `/api/usage` marks `complete: false`, reports the source error, and can include the saved aggregate for that source/date as `staleSnapshotEvents` so the total does not silently drop to zero.

Read saved history from the CLI:

```bash
agent-usage-dashboard history --since 2026-05-01 --until 2026-05-19 --json
```

Force a fresh full scan and seed history:

```bash
agent-usage-dashboard usage --since 2026-05-19 --until 2026-05-19 --refresh --json
```

Disable snapshot writes:

```bash
agent-usage-dashboard serve --port 8790 --no-history
```

## Monitoring

Health endpoint:

```bash
curl -s http://127.0.0.1:8790/api/health | python3 -m json.tool
```

The payload includes:

- `state`: `starting`, `ready`, `degraded`, or `error`
- `serviceOk`: whether the dashboard process itself is healthy
- `sourceOk`: whether all configured sources scanned successfully
- `sourceStatus`: per-source reachability, file counts, event counts, duration, and cache status
- `configuredSources`: source ids available to filters
- cache snapshots for usage and remote source fetches

More details: [docs/MONITORING.md](docs/MONITORING.md).

## Open Source And NPM

The project is structured for MIT open-source release and npm publishing, but publishing should only happen after repository-owner approval. See [docs/PACKAGING.md](docs/PACKAGING.md).

## AI Handoff

If someone wants their own AI assistant to add a remote machine, give it [docs/AI-HANDOFF.md](docs/AI-HANDOFF.md) plus the SSH login method. The important rule is that secrets stay out of this repository and out of config files.

## Commands

```bash
agent-usage-dashboard usage [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json]
agent-usage-dashboard daily [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json] [--sessions]
agent-usage-dashboard sessions [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json]
agent-usage-dashboard projects [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json]
agent-usage-dashboard sources [--json]
agent-usage-dashboard chart [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--out report.html]
agent-usage-dashboard history [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json]
agent-usage-dashboard init [--app-dir ./agent-usage-dashboard] [--json]
agent-usage-dashboard serve [--host 127.0.0.1] [--port 8787] [--config path/to/config.json]
```

Common options:

- `--local-only`: skip remote SSH sources
- `--no-aragorn`: skip `~/.aragorn/resources` discovery
- `--source local-codex,team-mac-claude-code`: narrow to source ids
- `--remote-timeout-ms 45000`: change remote SSH timeout
- `--host 127.0.0.1`: web server bind address; use `0.0.0.0` only for intentional external access
- `--redact-sensitive`: mask project paths, session ids, config paths, and detailed health metadata in API responses
- `--logic raw`: inspect raw Codex token-count events
- `--app-dir ./agent-usage-dashboard`: keep `config.json` and `db/` together
- `--state-dir ~/.local/state/agent-usage-dashboard`: change snapshot storage path
- `--no-history`: disable daily snapshot writes
- `--history-retention-days 180`: change local snapshot retention
- `--history-backfill-days 180`: change how many previous days a refreshed full scan seeds into history
- `--refresh`: bypass saved historical snapshots and remote caches for usage scans
- `--codex-home ~/.codex`: local Codex home
- `--claude-home ~/.claude`: local Claude Code home

## Privacy And Security

- Do not put passwords, private keys, API tokens, or `.env` content in config.
- Use SSH config, ssh-agent, hardware keys, or your normal host alias.
- The remote exporter returns usage metadata only.
- Snapshot history stores daily aggregates, source/engine/host totals, model totals, and scan stats. It does not store full transcripts.
- Treat project paths and session ids as potentially sensitive metadata.
- Review config files before publishing screenshots or logs.

## Development

```bash
npm run check
npm run pack:dry-run
npm run serve
```

This package currently has no runtime dependencies. Keeping the CLI self-contained makes it easier to install with `npx`, copy to remote machines, and audit.

## License

MIT. See [LICENSE](LICENSE).
