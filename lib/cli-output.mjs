import { format } from "./formatting.mjs";

export function publicSource(source) {
  return {
    id: source.id,
    label: source.label,
    host: source.host,
    engine: source.engine,
    remote: Boolean(source.sshHost),
    kind: source.kind,
  };
}

export function printHistoryRows(rows, stateDir) {
  for (const row of rows) {
    console.log(`${row.date} total=${format(row.totalTokens)} input=${format(row.inputTokens)} output=${format(row.outputTokens)} saved=${row.savedAt || "-"}`);
  }
  console.log(`\nstate_dir=${stateDir} snapshots=${rows.length}`);
}

export function printUsagePayload(payload) {
  const summary = payload.summary || {};
  console.log(`${payload.since || "-"} to ${payload.until || "-"} · ${payload.logic} · ${payload.timeZone}`);
  const cacheRead = format(summary.cachedInputTokens);
  const cacheCreate = format(summary.cacheCreationInputTokens);
  console.log(`total=${format(summary.totalTokens)} input=${format(summary.inputTokens)} cache_read=${cacheRead} cache_create=${cacheCreate} output=${format(summary.outputTokens)} out_cached=${format(summary.cachedOutputTokens)}`);
  console.log(`sources=${format(payload.stats?.sourceCount || 0)} remote=${format(payload.stats?.remoteSources || 0)} errors=${format(payload.stats?.sourceErrors || 0)} duration_ms=${payload.durationMs || 0}`);
}

export function printSourcesPayload(payload) {
  for (const source of payload.sources) {
    const scope = source.remote ? "remote" : "local";
    console.log(`${source.id}\t${source.engine}\t${source.host}\t${scope}\t${source.label}`);
  }
}

export function printDaily(rows, stats, includeSessions) {
  for (const row of rows) {
    console.log(`${row.date}`);
    console.log(`  input=${format(row.inputTokens)} cache_read=${format(row.cachedInputTokens)} cache_create=${format(row.cacheCreationInputTokens)} output=${format(row.outputTokens)} out_cached=${format(row.cachedOutputTokens)} reasoning=${format(row.reasoningOutputTokens)} total=${format(row.totalTokens)}`);
    console.log(`  models=${Object.keys(row.models).join(", ") || "-"}`);
    if (includeSessions) {
      for (const session of row.sessions) {
        console.log(`    ${format(session.inputTokens).padStart(12)} input  ${session.sessionId}`);
      }
    }
  }
  printStats(stats);
}

export function printSessions(rows, stats) {
  for (const row of rows) {
    console.log(`${format(row.inputTokens).padStart(12)} input  ${format(row.cachedInputTokens).padStart(12)} cached  ${row.sessionId}`);
  }
  printStats(stats);
}

export function printProjects(rows, stats) {
  for (const row of rows) {
    console.log(`${format(row.inputTokens).padStart(12)} input  ${format(row.cachedInputTokens).padStart(12)} cached  ${String(row.sessionCount).padStart(4)} sessions  ${row.project}`);
  }
  printStats(stats);
}

function printStats(stats) {
  console.log(`\nfiles=${stats.files}/${stats.totalFiles} skipped_files=${stats.skippedFiles} forked_files=${stats.forkedFiles} token_events=${stats.tokenEvents} kept=${stats.keptEvents} out_of_range=${stats.outOfRangeSkipped} replay_skipped=${stats.replaySkipped} duplicate_skipped=${stats.duplicateSkipped} resets=${stats.resetCount}`);
}
