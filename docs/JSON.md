# JSON Interfaces

Use these surfaces when an AI assistant, script, or monitoring job needs data without reading the HTML UI.

## CLI With npx

Full dashboard payload for a date range:

```bash
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since 2026-05-19 --until 2026-05-19 --json
```

Configured source ids:

```bash
npx -y agent-usage-dashboard sources --app-dir ./agent-usage-dashboard --json
```

Smaller focused payloads:

```bash
npx -y agent-usage-dashboard daily --app-dir ./agent-usage-dashboard --since 2026-05-19 --until 2026-05-19 --json
npx -y agent-usage-dashboard sessions --app-dir ./agent-usage-dashboard --since 2026-05-19 --json
npx -y agent-usage-dashboard projects --app-dir ./agent-usage-dashboard --since 2026-05-19 --json
npx -y agent-usage-dashboard history --app-dir ./agent-usage-dashboard --since 2026-05-01 --until 2026-05-19 --json
```

Useful narrowing options:

```bash
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --source team-mac-codex --since 2026-05-19 --json
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --local-only --since 2026-05-19 --json
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --logic raw --since 2026-05-19 --json
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since 2026-05-19 --until 2026-05-19 --refresh --json
```

`usage --json` defaults to today when no date is supplied. For automation, pass explicit dates so the result is reproducible.

## Web API

When the dashboard service is running:

```bash
curl -s "http://127.0.0.1:8790/api/usage?since=2026-05-19&until=2026-05-19&logic=ccusage&host=all&engine=all&source=all"
curl -s "http://127.0.0.1:8790/api/usage?since=2026-05-19&until=2026-05-19&refresh=1"
curl -s "http://127.0.0.1:8790/api/sources"
curl -s "http://127.0.0.1:8790/api/health"
```

External API access is disabled by default because the server binds to `127.0.0.1`. Start with `serve --host 0.0.0.0 --port 8790` only when another machine should call the API, and protect it with a trusted network, tunnel, VPN, or authenticated reverse proxy.

## Payloads

`usage --json` and `/api/usage` include:

- `summary`: aggregate token and cost estimate totals
- `daily`: daily rows for the selected range
- `hourly`: hourly rows for the selected range
- `sources`, `hosts`, `engines`: grouped totals
- `sessions`, `projects`: detailed rollups
- `sourceStatus`: per-source scan status and errors
- `sourceAlerts`: failed or empty sources that need attention
- `complete`: false when one or more selected sources failed
- `staleSnapshotEvents`: saved source/day aggregates used because live reading failed
- `availableFilters`: valid source, host, and engine filter values
- `history`: local snapshot state
- `trendDaily`: saved history merged with the live scan
- `pricing`: configured price sources and missing model pricing
- `stats`: scan counters

`trendDaily` is intentionally wider than the selected day when the request is a full canonical `ccusage` scan. The dashboard reads saved daily snapshots across `history.trendSince` to `history.trendUntil` and merges the live selected range on top, so the Daily trend tab can show older days after saved history has been seeded.

For a full unfiltered historical range whose daily snapshots already exist, `/api/usage` and `usage --json` return from saved history without re-reading local or SSH logs. These responses include `historyOnly: true` and `historySource: "saved-daily-snapshots"`. Pass `refresh=1` on the web API or press Refresh in the UI to force a live re-read.

History fields:

- `history.trendSince` / `history.trendUntil`: the saved-history window used by `trendDaily`
- `history.backfillDays`: configured number of previous days to seed from logs
- `history.backfill`: whether this response attempted an explicit-refresh history backfill
- `history.backfill.sourceErrorDetails`: failed sources during history backfill, if any
- `history.savedDates`: daily snapshot dates written by this response
- `history.snapshotCount`: saved daily snapshots available in the trend window
- `trendDaily[].partial`: true when a saved backfill row is incomplete because one or more sources failed

Token fields:

- `inputTokens`: total input including cached and cache creation tokens
- `cachedInputTokens`: cache-read input
- `cacheCreationInputTokens`: cache-write input
- `outputTokens`: output tokens
- `cachedOutputTokens`: schema-stable field; currently 0 because `ccusage` v20 does not expose cached output
- `reasoningOutputTokens`: reasoning output when present
- `totalTokens`: total used for charts and rollups
- `costUSD`: estimated USD cost, not an official bill. This excludes unpriced model usage unless the source log reports an event cost; check `pricing.missingModels` before treating it as a complete cost.

Codex rows follow `ccusage` semantics internally: uncached input is `inputTokens - cachedInputTokens - cacheCreationInputTokens`, while the displayed input total intentionally includes cached input.

Pricing fields:

- `pricing.configuredModels`: exact or prefix model keys loaded from config, local price file, or configured price URL
- `pricing.sources`: where the price table came from
- `pricing.errors`: non-fatal price table load errors
- `pricing.usedModels`: models present in the selected range
- `pricing.missingModels`: used models without configured pricing and without log-reported cost
- `pricing.missingModelUsage`: top unpriced models with token totals

The dashboard does not ship a built-in provider price table. Add `pricing.models`, `pricing.path`, or `pricing.url` in config to estimate new models. URL price tables are cached for `pricing.ttlMs` and are not fetched on every request.

When the service is bound to a non-localhost host, API redaction is enabled by default. Redacted responses mask project paths, session ids, config paths, and detailed health metadata. Use `--redact-sensitive` to force that behavior on localhost.

`sources --json` and `/api/sources` include source ids safe to pass to `--source`. They intentionally do not return private keys, tokens, or full SSH config.

Add `refresh=1` or `force=1` to `/api/usage`, or `--refresh` to CLI `usage`, to bypass saved historical snapshots, the dashboard response cache, and the remote source cache for that request.
