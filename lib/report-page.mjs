import { format, htmlEscape, pct, shortSessionName } from "./formatting.mjs";

function emptyReportUsage() {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    outputTokens: 0,
    cachedOutputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    costUSD: 0,
  };
}

export function renderChart(rows, stats) {
  const row = rows[0] || { date: "n/a", ...emptyReportUsage(), models: {}, sessions: [] };
  const uncached = Math.max(row.inputTokens - row.cachedInputTokens, 0);
  const topSessions = row.sessions || [];
  const maxSession = Math.max(...topSessions.map((session) => session.inputTokens), 1);
  const modelList = Object.keys(row.models || {});
  const generatedAt = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date());

  const sessionBars = topSessions.map((session, index) => {
    const width = Math.max(2, pct(session.inputTokens, maxSession));
    const cachedShare = pct(session.cachedInputTokens, session.inputTokens);
    return `
      <div class="session-row">
        <div class="rank">${index + 1}</div>
        <div class="session-meta">
          <div class="session-name">${htmlEscape(shortSessionName(session.sessionId))}</div>
          <div class="session-id">${htmlEscape(session.sessionId)}</div>
        </div>
        <div class="bar-cell">
          <div class="bar" style="width:${width}%">
            <span class="bar-cache" style="width:${cachedShare}%"></span>
          </div>
        </div>
        <div class="session-value">${format(session.inputTokens)}</div>
      </div>`;
  }).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Codex Usage Today</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --text: #18202a;
      --muted: #667085;
      --line: #d9dee7;
      --blue: #2563eb;
      --green: #0f9f6e;
      --amber: #d97706;
      --red: #c2410c;
      --shadow: 0 18px 48px rgba(15, 23, 42, 0.10);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    main {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 40px;
    }
    header {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0;
      font-size: 30px;
      line-height: 1.1;
      letter-spacing: 0;
    }
    .subtitle {
      margin-top: 8px;
      color: var(--muted);
      font-size: 14px;
    }
    .badge {
      border: 1px solid var(--line);
      background: #fff;
      border-radius: 8px;
      padding: 8px 10px;
      color: var(--muted);
      font-size: 13px;
      white-space: nowrap;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .metric, .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }
    .metric {
      padding: 16px;
    }
    .label {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .value {
      margin-top: 8px;
      font-size: 25px;
      font-weight: 700;
      line-height: 1.15;
    }
    .note {
      margin-top: 6px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.4;
    }
    .layout {
      display: grid;
      grid-template-columns: 380px 1fr;
      gap: 16px;
      align-items: start;
    }
    .panel {
      padding: 18px;
      margin-bottom: 16px;
    }
    h2 {
      margin: 0 0 14px;
      font-size: 17px;
      letter-spacing: 0;
    }
    .stack {
      height: 36px;
      display: flex;
      overflow: hidden;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: #eef2f7;
    }
    .seg-cached { background: var(--green); }
    .seg-uncached { background: var(--blue); }
    .seg-output { background: var(--amber); }
    .legend {
      display: grid;
      gap: 9px;
      margin-top: 14px;
    }
    .legend-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 13px;
    }
    .legend-name {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      display: inline-block;
    }
    .session-row {
      display: grid;
      grid-template-columns: 28px minmax(190px, 1.1fr) minmax(160px, 1fr) 112px;
      align-items: center;
      gap: 10px;
      min-height: 46px;
      border-top: 1px solid #edf0f5;
    }
    .session-row:first-of-type { border-top: 0; }
    .rank {
      color: var(--muted);
      font-variant-numeric: tabular-nums;
      font-size: 13px;
    }
    .session-name {
      font-weight: 650;
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .session-id {
      margin-top: 2px;
      color: var(--muted);
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bar-cell {
      height: 16px;
      background: #eef2f7;
      border-radius: 5px;
      overflow: hidden;
    }
    .bar {
      height: 100%;
      min-width: 2px;
      background: var(--blue);
      position: relative;
      border-radius: 5px;
      overflow: hidden;
    }
    .bar-cache {
      position: absolute;
      inset: 0 auto 0 0;
      background: var(--green);
    }
    .session-value {
      text-align: right;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .footer {
      margin-top: 10px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }
    @media (max-width: 920px) {
      header { align-items: start; flex-direction: column; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .layout { grid-template-columns: 1fr; }
      .session-row { grid-template-columns: 24px minmax(0, 1fr) 96px; }
      .bar-cell { grid-column: 2 / 4; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Codex Usage Today</h1>
        <div class="subtitle">${htmlEscape(row.date)} · deduped local token_count logs · models: ${htmlEscape(modelList.join(", ") || "-")}</div>
      </div>
      <div class="badge">Generated ${htmlEscape(generatedAt)}</div>
    </header>

    <section class="grid">
      <div class="metric"><div class="label">Total Tokens</div><div class="value">${format(row.totalTokens)}</div><div class="note">ccusage-style local log estimate</div></div>
      <div class="metric"><div class="label">Input Tokens</div><div class="value">${format(row.inputTokens)}</div><div class="note">${format(row.cachedInputTokens)} cached</div></div>
      <div class="metric"><div class="label">Output Tokens</div><div class="value">${format(row.outputTokens)}</div><div class="note">${format(row.reasoningOutputTokens)} reasoning</div></div>
    </section>

    <section class="layout">
      <div>
        <div class="panel">
          <h2>Token Mix</h2>
          <div class="stack">
            <div class="seg-cached" style="width:${pct(row.cachedInputTokens, row.totalTokens)}%"></div>
            <div class="seg-uncached" style="width:${pct(uncached, row.totalTokens)}%"></div>
            <div class="seg-output" style="width:${pct(row.outputTokens, row.totalTokens)}%"></div>
          </div>
          <div class="legend">
            <div class="legend-row"><span class="legend-name"><span class="dot" style="background:var(--green)"></span>Cached input</span><strong>${format(row.cachedInputTokens)}</strong></div>
            <div class="legend-row"><span class="legend-name"><span class="dot" style="background:var(--blue)"></span>Uncached input</span><strong>${format(uncached)}</strong></div>
            <div class="legend-row"><span class="legend-name"><span class="dot" style="background:var(--amber)"></span>Output</span><strong>${format(row.outputTokens)}</strong></div>
          </div>
        </div>
        <div class="panel">
          <h2>Deduplication</h2>
          <div class="legend">
            <div class="legend-row"><span class="legend-name">Files read</span><strong>${format(stats.files)}</strong></div>
            <div class="legend-row"><span class="legend-name">Forked files</span><strong>${format(stats.forkedFiles)}</strong></div>
            <div class="legend-row"><span class="legend-name">Replay skipped</span><strong>${format(stats.replaySkipped)}</strong></div>
            <div class="legend-row"><span class="legend-name">Kept events</span><strong>${format(stats.keptEvents)}</strong></div>
          </div>
        </div>
      </div>

      <div class="panel">
        <h2>Top Sessions By Input Tokens</h2>
        ${sessionBars}
        <div class="footer">Green portion is cached input inside each session bar. These numbers are ccusage-style local log estimates.</div>
      </div>
    </section>
  </main>
</body>
</html>`;
}
