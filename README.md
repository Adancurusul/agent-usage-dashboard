# Agent Usage Dashboard

Local web dashboard and CLI for Codex and Claude Code usage across your laptop and SSH-accessible machines.

It answers:

- How many tokens did Codex and Claude Code use today or on a previous day?
- Which source, host, project, or session used the most?
- Which remotes failed to read?
- What changed when looking at one source versus all sources?

The dashboard is local-first. It reads agent usage logs from local paths and optional SSH remotes, stores aggregate daily snapshots locally, and exposes JSON APIs for automation.

## What It Is

- Web dashboard for usage trends, hourly charts, source health, projects, and sessions
- CLI for `usage`, `daily`, `sessions`, `projects`, `sources`, `history`, and HTML reports
- Optional SSH collector for remote Codex and Claude Code logs
- Local snapshot store for historical daily views
- AI-friendly JSON interface and bundled AI skill

This is not only a skill. The main product is a standalone npm CLI and web app. The package also includes `skills/agent-usage-dashboard/SKILL.md` so AI assistants can learn how to install, configure, and query it without scraping the UI.

## Requirements

- Node.js `18.17` or newer
- Codex logs in `~/.codex/sessions` for local Codex usage
- Claude Code logs in `~/.claude/projects` for local Claude Code usage
- `python3` on remote machines, if using SSH remotes
- Non-interactive SSH access for each remote machine

Remote collection returns usage metadata only: timestamp, model, token counts, project/cwd, session id, source id, and scan stats. It does not copy full prompts, responses, transcripts, API keys, or project files.

## Install

Run without installing globally:

```bash
npx -y agent-usage-dashboard init --app-dir ./agent-usage-dashboard
npx -y agent-usage-dashboard serve --app-dir ./agent-usage-dashboard --port 8790
```

Open:

```text
http://127.0.0.1:8790/
```

Install globally:

```bash
npm install -g agent-usage-dashboard
agent-usage-dashboard init --app-dir ~/.agent-usage-dashboard
agent-usage-dashboard serve --app-dir ~/.agent-usage-dashboard --port 8790
```

`npx ... serve` is not a daemon. It runs while that terminal process is alive. For long-running use, run it under tmux, launchd, systemd, pm2, Docker, or another process manager.

## Use

Show usage as JSON:

```bash
agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since 2026-05-21 --until 2026-05-21 --json
```

List sources:

```bash
agent-usage-dashboard sources --app-dir ./agent-usage-dashboard --json
```

Read one source:

```bash
agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --source local-codex --json
```

Force a fresh scan instead of using saved history or remote cache:

```bash
agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since 2026-05-21 --until 2026-05-21 --refresh --json
```

Use the web API when the server is running:

```bash
curl -s "http://127.0.0.1:8790/api/usage?since=2026-05-21&until=2026-05-21&logic=ccusage&host=all&engine=all&source=all"
curl -s "http://127.0.0.1:8790/api/sources"
curl -s "http://127.0.0.1:8790/api/health"
```

## Configure Remotes

Create an app directory:

```bash
agent-usage-dashboard init --app-dir ./agent-usage-dashboard
```

Edit `./agent-usage-dashboard/config.json`:

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
    },
    {
      "id": "remote-linux",
      "label": "Remote Linux",
      "sshHost": "user@example-host",
      "enabled": true,
      "codexHome": "~/.codex",
      "claudeHome": "~/.claude"
    }
  ]
}
```

Verify SSH before scanning:

```bash
ssh team-mac 'python3 --version && ls -d ~/.codex ~/.claude 2>/dev/null || true'
agent-usage-dashboard sources --app-dir ./agent-usage-dashboard --json
```

Every configured machine becomes selectable sources such as:

```text
local-codex
local-claude-code
team-mac-codex
team-mac-claude-code
remote-linux-codex
remote-linux-claude-code
```

Aragorn users can also enable discovery from `~/.aragorn/resources/*.json`.

## AI Skill

The package includes a skill file:

```text
skills/agent-usage-dashboard/SKILL.md
```

Use it when an AI assistant needs to:

- add a remote machine from SSH login details
- query usage totals
- inspect per-source health
- read project or session breakdowns
- call `/api/usage`, `/api/sources`, or `/api/health`

Give another AI assistant either this README or `docs/AI-QUICKSTART.md`. If it only needs to add a remote, give it `docs/AI-HANDOFF.md` plus the SSH login method.

## Data And Privacy

- Config should not contain passwords, private keys, API tokens, or `.env` values.
- Use SSH config, ssh-agent, hardware keys, or normal host aliases.
- Saved history stores aggregate usage rows, source health, hourly rows, project/session ids, and model totals.
- Full prompts, responses, transcripts, project files, and secrets are not copied into history.
- Treat project paths, hostnames, source labels, session ids, source alert reasons, and token totals as potentially sensitive metadata. External-bind API redaction masks these identifying fields where practical while keeping source ids usable for filters.
- The web server binds to `127.0.0.1` by default. Use `--host 0.0.0.0` only behind Tailscale, VPN, SSH tunnel, or a reverse proxy with auth.

## Troubleshooting

Suspicious totals or future hourly buckets are usually caused by log replay or stale source snapshots. See `docs/TROUBLESHOOTING.md`.

Codex forked/subagent sessions can contain replayed parent-thread token counts. The dashboard skips those replay rows and reports them as `stats.replaySkipped`.

## Docs

- `docs/CONFIG.md`: full config reference
- `docs/JSON.md`: JSON payload fields
- `docs/RUNNING.md`: long-running service modes
- `docs/MONITORING.md`: health endpoint and source status
- `docs/AI-QUICKSTART.md`: AI-facing setup guide
- `docs/AI-HANDOFF.md`: instructions for adding remotes
- `docs/PACKAGING.md`: npm and release notes
- `docs/TROUBLESHOOTING.md`: known counting and snapshot issues

## Development

```bash
npm run check
npm run pack:dry-run
npm run serve
```

This package has no runtime dependencies.

## License

MIT. See `LICENSE`.
