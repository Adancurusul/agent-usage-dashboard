# Configuration

Default path:

```text
~/.config/agent-usage-dashboard/config.json
```

You can pass a different file with `--config`.

For a self-contained directory that keeps config and DB together:

```bash
npx -y agent-usage-dashboard init --app-dir ./agent-usage-dashboard
```

This creates:

```text
./agent-usage-dashboard/config.json
./agent-usage-dashboard/db/
```

## Top-Level Fields

```json
{
  "discoverAragornResources": true,
  "resourceOverrides": {},
  "resources": [],
  "pricing": {
    "models": {},
    "path": "./pricing.json",
    "url": "",
    "ttlMs": 86400000
  },
  "dbDir": "./db",
  "history": {
    "enabled": true,
    "dbDir": "./db",
    "retentionDays": 180,
    "backfillDays": 180
  }
}
```

`discoverAragornResources` controls whether the dashboard reads `~/.aragorn/resources/*.json`. The CLI flag `--no-aragorn` always disables Aragorn discovery even if config says `true`.

`resourceOverrides` changes labels or usage paths for Aragorn resources without duplicating them.

`resources` defines dashboard-only remote machines.

`pricing` supplies optional model price estimates in USD per 1 million tokens. There is no built-in official price table. If a model is not configured and the source log does not report a cost, the dashboard counts its tokens but leaves its estimated cost at 0 and reports the model in `pricing.missingModels`.

`history` controls local daily snapshot storage for previous-day and longer-range trend views.

`dbDir` is a shortcut for the local aggregate DB directory. Relative paths are resolved from the config file directory.

## Remote Resource

```json
{
  "id": "team-mac",
  "label": "Team Mac",
  "sshHost": "team-mac",
  "enabled": true,
  "codexHome": "~/.codex",
  "claudeHome": "~/.claude"
}
```

Supported aliases:

- `sshHost`, `ssh.host`, or `host`
- `label`, `displayName`, or `display_name`
- `codexHome`, `codex_home`, `usage.codex_home`, or `usage.codexHome`
- `claudeHome`, `claude_home`, `usage.claude_home`, or `usage.claudeHome`

Every enabled remote resource creates two sources:

- `<id>-codex`
- `<id>-claude-code`

Check the resolved source ids:

```bash
npx -y agent-usage-dashboard sources --app-dir ./agent-usage-dashboard --json
```

## Aragorn Override

```json
{
  "resourceOverrides": {
    "existing-resource-id": {
      "label": "Readable Display Name",
      "codexHome": "~/.codex",
      "claudeHome": "~/.claude"
    }
  }
}
```

Use this when a machine already exists in Aragorn and you only want dashboard-specific labels or paths.

## Pricing

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

Keys are matched exactly first, then as model-name prefixes. Values are USD per 1 million tokens. Estimates are not official bills.

You can keep prices in a separate JSON file next to the config:

```json
{
  "pricing": {
    "path": "./pricing.json"
  }
}
```

`pricing.json` can be either a direct model map or an object with a `models` field:

```json
{
  "models": {
    "claude-sonnet-4": {
      "input": 3,
      "cached": 0.3,
      "cacheCreation": 3.75,
      "output": 15
    }
  }
}
```

An optional URL is supported for teams that publish their own pricing JSON:

```json
{
  "pricing": {
    "url": "https://example.com/agent-pricing.json",
    "ttlMs": 86400000,
    "timeoutMs": 5000,
    "maxBytes": 1000000,
    "models": {
      "internal-model-prefix": {
        "input": 1,
        "cached": 0.1,
        "cacheCreation": 1,
        "output": 5
      }
    }
  }
}
```

The URL is cached in memory for `ttlMs`; it is not fetched on every dashboard request. Inline `models` override entries loaded from `path` or `url`.

For safety, price URLs must use `http` or `https`, cannot include URL credentials, are fetched with `timeoutMs`, and are capped by `maxBytes`. Private and loopback addresses are blocked by default. For a trusted local pricing service, set `"allowPrivateUrl": true` explicitly in your local config.

Supported aliases:

- `cached`, `cacheRead`, `cache_read`, or `cachedInput`
- `cacheCreation`, `cacheCreate`, `cache_creation`, `cacheCreationInput`, or `cache_creation_input`
- `input`, `inputTokens`, or `input_per_million`
- `output`, `outputTokens`, or `output_per_million`

## History

```json
{
  "history": {
    "enabled": true,
    "dbDir": "./db",
    "retentionDays": 180,
    "backfillDays": 180
  }
}
```

Snapshots are saved as daily JSON files under:

```text
<dbDir>/history/daily/YYYY-MM-DD.json
```

The dashboard writes snapshots only for canonical full-dashboard scans:

- `ccusage` logic
- all sources
- all hosts
- all engines
- not launched with `--local-only`

This prevents partial filtered views from overwriting whole-dashboard history. Snapshot files contain daily aggregates, source totals, engine totals, host totals, project totals, top session totals, model totals, and scan stats. They do not contain full prompts, responses, or transcripts.

Manual Refresh, `/api/usage?...&refresh=1`, and CLI `usage --refresh` backfill previous days from the available logs up to `backfillDays`. With the default `180`, a dashboard can show older daily bars as long as those Codex or Claude Code logs are still present locally or on the configured remotes. Backfill is deferred until an explicit refresh so the first page load does not block on long SSH scans. If a source fails during backfill, the dashboard may save older daily rows as incomplete `partial` snapshots and retry the full backfill later.

Per-source snapshots are saved for every successful source scan under:

```text
<dbDir>/history/sources/<source-id>/YYYY-MM-DD.json
```

Those records are source-level aggregates only. If a later SSH scan fails, the dashboard can use the saved source/day aggregate as a stale fallback while still returning `complete: false` and a source alert. This prevents failed remotes from silently removing historical usage from the total.

CLI overrides:

```bash
agent-usage-dashboard serve --state-dir ~/.local/state/agent-usage-dashboard
agent-usage-dashboard serve --app-dir ./agent-usage-dashboard
agent-usage-dashboard serve --no-history
agent-usage-dashboard serve --history-retention-days 365
agent-usage-dashboard serve --history-backfill-days 365
agent-usage-dashboard usage --since 2026-05-19 --until 2026-05-19 --refresh --json
agent-usage-dashboard history --since 2026-05-01 --until 2026-05-19 --json
```

`--history-backfill-days` controls how far an explicit refreshed full scan may seed saved history; it does not make ordinary page loads perform long SSH backfills.

## Web Bind Address

The web service binds to localhost by default:

```bash
agent-usage-dashboard serve --host 127.0.0.1 --port 8790
```

Use `0.0.0.0` only when another machine must reach the Web UI or JSON API:

```bash
agent-usage-dashboard serve --host 0.0.0.0 --port 8790
```

There is no built-in authentication. Prefer Tailscale, VPN, SSH tunnel, or a reverse proxy with authentication for remote access.

When the server binds to a non-localhost host, sensitive API redaction is enabled by default. It masks project paths, hostnames, source labels, session ids, config paths, source alert reasons, and detailed health metadata while keeping source ids usable for filters. You can force the same behavior with `--redact-sensitive` or disable it with `--no-redact-sensitive` only on a trusted network.

## Security Rules

Do not store:

- Passwords
- SSH private keys
- API tokens
- `.env` values
- Provider credentials

Use normal SSH configuration instead:

```sshconfig
Host team-mac
  HostName 203.0.113.10
  User deploy
  IdentityFile ~/.ssh/id_ed25519
```
