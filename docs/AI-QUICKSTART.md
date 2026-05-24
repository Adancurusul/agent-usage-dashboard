# AI Quickstart

Use this guide when an AI assistant needs to install, configure, or query Agent Usage Dashboard.

## Fast Path

If the package is published to npm:

```bash
npx -y agent-usage-dashboard init --app-dir ./agent-usage-dashboard
npx -y agent-usage-dashboard sources --app-dir ./agent-usage-dashboard --json
npx -y agent-usage-dashboard serve --app-dir ./agent-usage-dashboard --port 8790
```

If working from a local checkout before npm publish:

```bash
cd /path/to/agent-usage-dashboard
npm run check
node bin/agent-usage-dashboard.mjs init --app-dir ./agent-usage-dashboard
node bin/agent-usage-dashboard.mjs sources --app-dir ./agent-usage-dashboard --json
node bin/agent-usage-dashboard.mjs serve --app-dir ./agent-usage-dashboard --port 8790
```

Open `http://127.0.0.1:8790/`.

`npx ... serve` is a foreground process, not a daemon. For long-running service mode, run it under tmux, launchd, systemd, pm2, Docker, or another process manager.

## Add A Remote

Ask the user for:

- SSH host or alias, for example `team-mac` or `user@203.0.113.10`
- Display name
- Whether Codex uses `~/.codex`
- Whether Claude Code uses `~/.claude`

Do not ask for SSH passwords, private keys, API tokens, or `.env` values. The user should put keys and hosts in normal SSH config.

Edit `./agent-usage-dashboard/config.json` when using `--app-dir`, otherwise edit `~/.config/agent-usage-dashboard/config.json`:

```json
{
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

If the host already exists in `~/.aragorn/resources/*.json`, prefer `resourceOverrides` for labels or path changes instead of duplicating the machine.

## Verify

Check SSH and Python:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=5 <host> python3 --version
```

List dashboard sources:

```bash
npx -y agent-usage-dashboard sources --app-dir ./agent-usage-dashboard --json
```

Query both generated source ids:

```bash
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since YYYY-MM-DD --until YYYY-MM-DD --source <id>-codex --json
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since YYYY-MM-DD --until YYYY-MM-DD --source <id>-claude-code --json
```

Run a full refreshed scan only when intentionally rebuilding saved history:

```bash
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since YYYY-MM-DD --until YYYY-MM-DD --refresh --json
```

When the service is running:

```bash
curl -s http://127.0.0.1:8790/api/sources
curl -s http://127.0.0.1:8790/api/health
curl -s "http://127.0.0.1:8790/api/usage?since=YYYY-MM-DD&until=YYYY-MM-DD&logic=ccusage&host=all&engine=all&source=all"
```

For another machine to call the Web API, the service must be started with:

```bash
npx -y agent-usage-dashboard serve --app-dir ./agent-usage-dashboard --host 0.0.0.0 --port 8790
```

There is no built-in authentication. Use this only on a trusted network, tunnel, VPN, or authenticated reverse proxy. External binds enable API redaction by default for project paths, hostnames, source labels, session ids, config paths, source alert reasons, and detailed health metadata.

Use `refresh=1` only when intentionally re-reading local and SSH logs:

```bash
curl -s "http://127.0.0.1:8790/api/usage?since=YYYY-MM-DD&until=YYYY-MM-DD&refresh=1"
```

## Report Correctly

- `inputTokens` includes uncached input, cache read, and cache creation.
- `cachedInputTokens` is cache read.
- `cacheCreationInputTokens` is cache write.
- `outputTokens` is raw output, following `ccusage` v20.
- `cachedOutputTokens` exists for schema stability and is currently `0` because `ccusage` v20 does not expose cached output.
- `historyOnly: true` means the response came from saved daily snapshots and did not scan sources.
- `complete: false`, `sourceAlerts`, or `trendDaily[].partial` must be mentioned in any user-facing summary.

## Common Friction

- If `npx -y agent-usage-dashboard` cannot find the package, it has not been published yet. Use the local checkout command form with `node bin/agent-usage-dashboard.mjs`.
- If `npx` asks for confirmation, use `npx -y`.
- If SSH fails, fix `~/.ssh/config` or the user's SSH agent; do not put secrets into dashboard config.
- If a source has zero events but files were read, leave it configured and report it as empty.
- If historical data is slow only after pressing Refresh, that is expected: Refresh bypasses saved snapshots and re-reads SSH sources.
