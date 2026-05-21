# AI Handoff For Adding A Remote

Give this prompt to another AI assistant when you want it to add a remote machine.

```text
Please add this SSH-accessible machine to Agent Usage Dashboard.

SSH login method:
- host or alias: <user@host or ssh alias>
- display name: <human readable label>
- remote Codex home: ~/.codex unless I say otherwise
- remote Claude Code home: ~/.claude unless I say otherwise

Repository:
- package: agent-usage-dashboard
- preferred user config: ~/.config/agent-usage-dashboard/config.json
- self-contained app dir option: ./agent-usage-dashboard/config.json plus ./agent-usage-dashboard/db/
- example config: examples/config.example.json
- JSON interface guide: docs/JSON.md
- AI quickstart: docs/AI-QUICKSTART.md
- bundled skill: skills/agent-usage-dashboard/SKILL.md

Rules:
- Do not store passwords, private keys, tokens, or .env content.
- Prefer updating the app dir config if --app-dir is used; otherwise update ~/.config/agent-usage-dashboard/config.json.
- If this machine already exists in ~/.aragorn/resources/<id>.json, use resourceOverrides for labels or path tweaks instead of duplicating it.
- Keep examples generic and safe for publishing.
- Do not edit files under ~/.local/state/agent-usage-dashboard unless explicitly asked; those are local generated daily snapshots.
- Output tokens follow `ccusage` v20. Report cache read and cache create separately. Do not invent cached-output totals; `cachedOutputTokens` is present for schema stability and is currently 0 unless upstream exposes that data.

Verify SSH:
  ssh -o BatchMode=yes -o ConnectTimeout=5 <host> python3 --version

List configured sources:
  npx -y agent-usage-dashboard sources --app-dir ./agent-usage-dashboard --json

Verify the source:
  npx -y agent-usage-dashboard daily --app-dir ./agent-usage-dashboard --since YYYY-MM-DD --until YYYY-MM-DD --source <id>-codex --json
  npx -y agent-usage-dashboard daily --app-dir ./agent-usage-dashboard --since YYYY-MM-DD --until YYYY-MM-DD --source <id>-claude-code --json

Read dashboard data as JSON:
  npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since YYYY-MM-DD --until YYYY-MM-DD --json
  npx -y agent-usage-dashboard daily --app-dir ./agent-usage-dashboard --since YYYY-MM-DD --until YYYY-MM-DD --json
  npx -y agent-usage-dashboard sessions --app-dir ./agent-usage-dashboard --since YYYY-MM-DD --json
  npx -y agent-usage-dashboard projects --app-dir ./agent-usage-dashboard --since YYYY-MM-DD --json

Restart the dashboard and check:
  npx -y agent-usage-dashboard serve --app-dir ./agent-usage-dashboard --port 8790
  curl -s http://127.0.0.1:8790/api/sources | python3 -m json.tool
  curl -s http://127.0.0.1:8790/api/health | python3 -m json.tool

Verify history after a full unfiltered `ccusage` scan:
  npx -y agent-usage-dashboard history --app-dir ./agent-usage-dashboard --since YYYY-MM-DD --until YYYY-MM-DD --json

If you intentionally need to rebuild saved snapshots, run a refreshed full scan. This may be slow because it reads SSH sources:
  npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since YYYY-MM-DD --until YYYY-MM-DD --refresh --json

Manual Refresh, web `refresh=1`, and CLI `--refresh` backfill previous daily snapshots up to `history.backfillDays`. If a remote fails during backfill, older rows may be marked `partial`; report that instead of treating missing sources as zero.

Check stale fallback behavior after a source has been scanned successfully:
  npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --source <id>-claude-code --since YYYY-MM-DD --until YYYY-MM-DD --json
```

If the remote does not have Codex or Claude Code logs, leave the source enabled. The dashboard should show zero events rather than requiring a private workaround.

`npx ... serve` is not a permanent daemon. For long-running service mode, use tmux, launchd, systemd, pm2, Docker, or another process manager. Bind to `127.0.0.1` by default; use `--host 0.0.0.0` only for intentional external access behind a trusted network or authenticated proxy.
