# Troubleshooting

## Unexpected Future Hour In Today Chart

Symptom: the hourly chart shows a future hour, for example `12:00`, before local time reaches that hour.

Cause: a failed remote source may be served from a saved per-source daily snapshot. Older fallback logic turned that saved daily row into one synthetic event at noon. When the current day used stale source snapshots, the chart could therefore show a future noon bucket.

Fix: source snapshot fallback now replays the snapshot through its saved hourly rows when hourly detail exists. If no hourly detail exists, current-day fallback uses the current timestamp instead of noon.

Verification:

```bash
agent-usage-dashboard usage --since YYYY-MM-DD --until YYYY-MM-DD --refresh --json
```

Inspect `hourly[].hour`, `staleSnapshotEvents`, `sourceStatus`, and `sourceAlerts`.

## Implausibly Large Codex Totals

Symptom: a local Codex hour or session jumps into billions of tokens.

Cause: Codex forked or subagent sessions can contain replayed parent-thread `token_count` events before the first `turn_context`. Those replay entries are historical context copied into the child session, not new usage by that child session. Counting them double-counts the parent session and can inflate totals by billions.

Additional duplicate pattern: the same cumulative `total_token_usage` state can be emitted more than once with different timestamps. Timestamp-based dedupe alone is not enough.

Fixes:

- Forked/subagent Codex sessions now skip `token_count` entries before the first `turn_context`; skipped rows are counted in `stats.replaySkipped`.
- Codex token-count dedupe now keys cumulative states by token-usage state, not only timestamp plus usage.
- The remote Python exporter uses the same logic as the local loader.

Verification:

```bash
agent-usage-dashboard usage --since YYYY-MM-DD --until YYYY-MM-DD --source local-codex --refresh --json
```

Check that `stats.replaySkipped` is non-zero when forked sessions are present, and compare `sessions[]` plus `hourly[]` totals for outliers.
