# Monitoring

Start the dashboard:

```bash
agent-usage-dashboard serve --port 8790
```

This binds to `127.0.0.1` by default. For a monitor on another machine:

```bash
agent-usage-dashboard serve --host 0.0.0.0 --port 8790
```

There is no built-in authentication, so use a trusted network, VPN, tunnel, or authenticated reverse proxy before exposing the API. Non-localhost binds enable API redaction by default for project paths, hostnames, source labels, session ids, config paths, source alert reasons, and detailed health metadata.

Probe:

```bash
curl -fsS http://127.0.0.1:8790/api/health
```

List source ids:

```bash
curl -fsS http://127.0.0.1:8790/api/sources
npx -y agent-usage-dashboard sources --app-dir ./agent-usage-dashboard --json
```

Pretty print:

```bash
curl -s http://127.0.0.1:8790/api/health | python3 -m json.tool
```

## Health Semantics

`state` can be:

- `starting`: the process is up but no usage payload has been generated yet
- `ready`: the process has generated data and all scanned sources are OK
- `degraded`: the process is up, but one or more sources failed
- `error`: the dashboard failed while building or serving data

`serviceOk` is about the web process.

`sourceOk` is about all configured sources.

For alerting, use `serviceOk` if the dashboard must stay online and `sourceOk` if every remote must be reachable.

## Useful Fields

- `configuredSources`: all source ids available to the dashboard
- `sourceStatus`: latest per-source scan result
- `sourceAlerts`: failed or empty sources that need attention
- `complete`: `false` when any selected source failed, even if a saved source snapshot was used
- `staleSnapshotEvents`: number of saved source/day aggregates inserted because live reading failed
- `lastStats.sourceErrors`: number of sources that failed in the latest scan
- `lastDurationMs`: scan duration
- `cache.usage`: API response cache state
- `cache.remote`: remote SSH fetch cache state
- `config.historyEnabled`: whether snapshot history is enabled
- `config.stateDir`: where daily snapshots are stored

`/api/usage` also returns `history` and `trendDaily`:

- `history.savedDates`: daily snapshots written by this response
- `history.snapshotCount`: saved snapshots available for the selected range
- `history.sourceSaved`: per-source snapshots written by this response
- `history.sourceSnapshotCount`: saved per-source snapshots available for the selected range
- `history.canonical`: whether this view is eligible to write full-dashboard history
- `history.trendSince` and `history.trendUntil`: the saved-history window used for trend charts
- `history.backfill`: explicit-refresh previous-day backfill status for the response
- `history.backfill.sourceErrorDetails`: source ids and errors that failed during history backfill
- `trendDaily`: chart rows merged from saved history plus the current live scan
- `trendDaily[].partial`: incomplete saved history row; alert on this if historical totals must be complete
- `historyOnly`: true when a historical request was served from saved daily snapshots without scanning sources

The equivalent one-shot CLI payload is:

```bash
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since 2026-05-19 --until 2026-05-19 --json
```

Force a fresh web scan instead of using cached dashboard or remote-source data:

```bash
curl -s "http://127.0.0.1:8790/api/usage?since=2026-05-19&until=2026-05-19&refresh=1"
```

Equivalent CLI refresh:

```bash
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since 2026-05-19 --until 2026-05-19 --refresh --json
```

## Example Checks

Only fail if the service itself is down:

```bash
curl -fsS http://127.0.0.1:8790/api/health | jq -e '.serviceOk == true'
```

Fail if any source is down:

```bash
curl -fsS http://127.0.0.1:8790/api/health | jq -e '.sourceOk == true'
```

List source failures:

```bash
curl -s http://127.0.0.1:8790/api/health \
  | jq -r '.sourceStatus[] | select(.ok == false) | "\(.id): \(.error)"'
```

List failed or empty sources:

```bash
curl -s "http://127.0.0.1:8790/api/usage?since=2026-05-19&until=2026-05-19" \
  | jq -r '.sourceAlerts[] | "\(.id): \(.level) - \(.reason)"'
```
