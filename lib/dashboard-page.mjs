export function renderDashboardPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agent Usage Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f8fafc;
      --panel: #fff;
      --text: #1e293b;
      --muted: #64748b;
      --line: #e2e8f0;
      --blue: #3b82f6;
      --green: #0f9f6e;
      --amber: #f97316;
      --red: #c2410c;
      --purple: #7c3aed;
      --cyan: #0891b2;
      --pink: #db2777;
      --slate: #475569;
      --shadow: 0 10px 30px rgba(15, 23, 42, .07);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(180deg, #f8fafc 0%, #eef4fb 100%);
      color: var(--text);
    }
    main { width: min(1280px, calc(100vw - 28px)); margin: 0 auto; padding: 24px 0 40px; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 16px; }
    h1 { margin: 0; font-size: 30px; letter-spacing: 0; line-height: 1.1; }
    .subtitle { margin-top: 6px; color: var(--muted); font-size: 13px; line-height: 1.35; overflow-wrap: anywhere; }
    .status-pill {
      display: inline-flex; align-items: center; gap: 8px; justify-content: flex-end;
      min-width: 0; max-width: 100%; min-height: 34px; padding: 0 12px; border: 1px solid var(--line); border-radius: 999px; background: rgba(255, 255, 255, .86);
      box-shadow: 0 6px 18px rgba(15, 23, 42, .05);
    }
      .status-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--green); flex: 0 0 auto; }
      .status { min-width: 0; color: var(--muted); font-size: 12px; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .status.warn { color: var(--red); }
      .status-pill.warn .status-dot { background: var(--red); }
      .status-pill.loading .status-dot { background: var(--amber); }
    .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px; }
    .control-group { display: grid; gap: 10px; min-width: 0; }
    .control-group.dates { flex: 1 1 520px; grid-template-columns: minmax(122px, 1fr) minmax(136px, 1fr) minmax(136px, 1fr) 132px; }
    .control-group.filters { flex: 2 1 760px; grid-template-columns: repeat(6, minmax(122px, 1fr)); }
    select, input, button {
      width: 100%;
      min-width: 0;
      height: 38px; border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--text);
      padding: 0 10px; font: inherit; font-size: 13px;
    }
    select:focus-visible, input:focus-visible, button:focus-visible {
      outline: 3px solid rgba(59, 130, 246, .22);
      outline-offset: 1px;
      border-color: var(--blue);
    }
    button { cursor: pointer; background: var(--text); color: #fff; border-color: var(--text); }
    button:hover { background: #0f172a; }
    .grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
    .metric, .panel { min-width: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); }
    .metric { padding: 15px; position: relative; overflow: hidden; }
    .metric::before { content: ""; position: absolute; inset: 0 0 auto; height: 3px; background: var(--blue); opacity: .72; }
    .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .value { margin-top: 7px; font-size: 24px; font-weight: 750; line-height: 1.15; }
    .note { margin-top: 5px; color: var(--muted); font-size: 12px; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(360px, .8fr); gap: 14px; align-items: start; }
    .panel { padding: 16px; margin-bottom: 14px; }
    h2 { margin: 0 0 14px; font-size: 16px; letter-spacing: 0; }
    .panel-title { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .panel-title .note { margin: 0; text-align: right; }
    .tabs { display: flex; gap: 6px; margin: -4px 0 14px; border-bottom: 1px solid #edf0f5; }
    .tab-button {
      height: 34px; border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; color: var(--muted);
      padding: 0 8px; cursor: pointer; font-size: 13px; font-weight: 650;
    }
    .tab-button[aria-selected="true"] { color: var(--text); border-bottom-color: var(--blue); }
    .tab-button:hover { color: var(--text); background: transparent; }
    .tab-panel { min-width: 0; }
    .tab-panel[hidden] { display: none; }
    .bars { display: grid; gap: 8px; }
    .bar-row { display: grid; grid-template-columns: 116px minmax(140px, 1fr) 108px; align-items: center; gap: 10px; min-height: 26px; }
    .bar-label { color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar-track { height: 15px; background: #eef2f7; border-radius: 5px; overflow: hidden; }
    .bar-fill { height: 100%; min-width: 2px; border-radius: 5px; background: var(--blue); position: relative; overflow: hidden; }
    .bar-cache { position: absolute; inset: 0 auto 0 0; background: var(--green); }
    .bar-value { text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; }
    .breakdown-row { display: grid; grid-template-columns: 116px minmax(160px, 1fr) 108px; align-items: start; gap: 10px; min-height: 42px; }
    .breakdown-stack { height: 15px; display: flex; background: #eef2f7; border-radius: 5px; overflow: hidden; }
    .stack-segment { height: 100%; min-width: 2px; }
    .breakdown-list { display: flex; flex-wrap: wrap; gap: 5px 12px; margin-top: 6px; font-size: 11px; line-height: 1.25; color: var(--muted); }
    .breakdown-item { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 100%; }
    .breakdown-item strong { color: var(--text); font-weight: 650; }
    .swatch { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 auto; }
    .overview-chart { width: 100%; max-width: 100%; min-width: 0; min-height: 282px; display: grid; grid-auto-flow: column; grid-auto-columns: 92px; gap: 10px; align-items: end; overflow-x: auto; padding-top: 8px; padding-bottom: 4px; }
    .overview-column { min-height: 264px; display: grid; grid-template-rows: 22px minmax(140px, 1fr) 62px; gap: 8px; min-width: 92px; }
    .overview-value { text-align: center; font-size: 11px; font-variant-numeric: tabular-nums; color: var(--text); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .overview-bar { display: flex; flex-direction: column-reverse; justify-content: flex-start; align-items: stretch; height: 100%; background: #eef2f7; border-radius: 6px; overflow: hidden; }
    .overview-segment { width: 100%; min-height: 2px; }
    .overview-label { width: 82px; justify-self: center; margin-top: 4px; text-align: right; font-size: 11px; line-height: 1.25; color: var(--muted); white-space: nowrap; overflow: visible; transform: rotate(-34deg); transform-origin: top right; }
    .mix { height: 34px; display: flex; overflow: hidden; border-radius: 8px; background: #eef2f7; border: 1px solid var(--line); }
    .mix-cached { background: var(--green); }
    .mix-uncached { background: var(--blue); }
    .mix-cached-output { background: var(--cyan); }
    .mix-output { background: var(--amber); }
    .legend { display: grid; gap: 8px; margin-top: 12px; }
    .legend-row { display: flex; justify-content: space-between; gap: 10px; color: var(--muted); font-size: 13px; }
    .legend-row strong { color: var(--text); }
    .session-row { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(120px, .75fr) 98px; gap: 10px; align-items: center; min-height: 42px; border-top: 1px solid #edf0f5; }
    .session-row:first-child { border-top: 0; }
    .session-name { font-size: 13px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .session-id { margin-top: 2px; font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .warn { color: var(--red); }
      .topbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: start; }
      .topbar > * { min-width: 0; }
      .eyebrow { color: var(--blue); font-size: 12px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 6px; }
        .controls { display: grid; grid-template-columns: repeat(8, minmax(118px, 1fr)); gap: 10px; align-items: end; margin-bottom: 14px; }
        .control-group, .control-group.dates, .control-group.filters { display: contents; }
        .field { display: grid; gap: 6px; min-width: 0; padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: rgba(255,255,255,.78); box-shadow: 0 8px 24px rgba(15,23,42,.045); }
      .field-label { color: var(--muted); font-size: 11px; font-weight: 750; letter-spacing: .04em; text-transform: uppercase; }
      .refresh-button { min-width: 118px; }
      .metric { min-height: 128px; display: flex; flex-direction: column; justify-content: space-between; }
      .metric:nth-child(2)::before { background: var(--green); }
      .metric:nth-child(3)::before { background: var(--amber); }
      .metric:nth-child(4)::before { background: var(--purple); }
      .layout { grid-template-columns: minmax(0, 1.35fr) minmax(380px, .8fr); }
      .chart-panel { min-width: 0; min-height: 430px; overflow: hidden; }
      .tabs { gap: 22px; }
      .tab-button { min-width: 0; }
      .overview-chart { min-height: 264px; grid-auto-columns: 82px; align-items: end; }
      .overview-chart.is-single { grid-auto-columns: minmax(260px, 440px); justify-content: center; }
      .overview-column { min-height: 244px; grid-template-rows: 24px 156px 56px; }
      .overview-bar { border: 1px solid #dbe5f0; }
      .overview-column.is-history .overview-bar { background: repeating-linear-gradient(135deg, #edf2f7 0, #edf2f7 8px, #e2e8f0 8px, #e2e8f0 16px); }
      .overview-label { font-size: 12px; }
      .main-stack { display: grid; gap: 14px; min-width: 0; }
      .main-stack .panel { margin-bottom: 0; }
      .side-stack { display: grid; gap: 14px; min-width: 0; }
      .side-stack .panel { margin-bottom: 0; }
      .panel-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; color: var(--muted); font-size: 12px; }
      .pill { display: inline-flex; align-items: center; gap: 6px; min-height: 24px; padding: 0 8px; border: 1px solid var(--line); border-radius: 999px; background: #f8fafc; font-size: 12px; color: var(--muted); }
      .pill-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); }
      .pill.warn .pill-dot { background: var(--red); }
      .history-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
      .history-stat { padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: #f8fafc; }
      .history-stat strong { display: block; color: var(--text); font-size: 16px; line-height: 1.2; }
      .history-stat span { display: block; margin-top: 3px; color: var(--muted); font-size: 11px; }
      .history-path { margin-top: 10px; padding: 8px; border-radius: 8px; background: #f8fafc; color: var(--slate); font-size: 11px; line-height: 1.35; word-break: break-all; }
      .history-list { display: grid; gap: 7px; margin-top: 10px; }
      .history-row { display: grid; grid-template-columns: 88px minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: 12px; color: var(--muted); }
      .history-row strong { color: var(--text); font-variant-numeric: tabular-nums; }
      .quality-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding-top: 9px; border-top: 1px solid #edf0f5; }
      .quality-row:first-child { padding-top: 0; border-top: 0; }
      .secondary-button { height: 30px; min-width: 86px; padding: 0 10px; border-radius: 8px; background: #fff; color: var(--text); border-color: var(--line); font-size: 12px; }
      .secondary-button:hover { background: #f8fafc; border-color: #cbd5e1; }
      .secondary-button:disabled { cursor: not-allowed; opacity: .48; }
      .source-alerts { display: grid; gap: 8px; margin-bottom: 12px; }
      .source-health-panel .source-alerts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .source-alert { display: grid; gap: 4px; padding: 10px; border: 1px solid #fed7aa; border-left: 3px solid var(--amber); border-radius: 8px; background: #fff7ed; }
      .source-alert.error { border-color: #fecaca; border-left-color: var(--red); background: #fff1f2; }
      .source-alert-title { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; font-weight: 700; color: var(--text); }
      .source-alert-detail { color: var(--slate); font-size: 12px; line-height: 1.35; }
      .source-health-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; }
      .health-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: start; padding-top: 9px; border-top: 1px solid #edf0f5; color: var(--muted); font-size: 13px; }
      .health-row:first-child { padding-top: 0; border-top: 0; }
      .source-health-grid .health-row:nth-child(-n + 2) { padding-top: 0; border-top: 0; }
      .health-row strong { color: var(--text); text-align: right; font-size: 12px; line-height: 1.35; }
      .metric-subline { display: flex; flex-wrap: wrap; gap: 6px 10px; color: var(--muted); font-size: 12px; line-height: 1.35; }
      .split-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: baseline; }
      .ledger-wrap { overflow-x: auto; margin-top: 4px; }
      .ledger { width: 100%; min-width: 720px; border-collapse: collapse; font-size: 12px; }
      .ledger th { color: var(--muted); font-weight: 650; text-align: right; padding: 0 8px 8px; border-bottom: 1px solid #edf0f5; white-space: nowrap; }
      .ledger th:first-child { text-align: left; padding-left: 0; }
      .ledger td { text-align: right; padding: 9px 8px; border-bottom: 1px solid #edf0f5; white-space: nowrap; color: var(--text); }
      .ledger td:first-child { text-align: left; padding-left: 0; color: var(--slate); max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
      .ledger tr:last-child td { border-bottom: 0; }
      @media (max-width: 920px) {
        .topbar { grid-template-columns: 1fr; }
        header { flex-direction: column; align-items: start; }
        .status { text-align: left; }
          .controls { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .layout { grid-template-columns: 1fr; }
        .source-health-panel .source-alerts, .source-health-grid { grid-template-columns: 1fr; }
        .source-health-grid .health-row:nth-child(2) { padding-top: 9px; border-top: 1px solid #edf0f5; }
        .overview-chart { grid-auto-columns: minmax(82px, 112px); }
      }
      @media (max-width: 560px) {
      main { width: min(100vw - 18px, 1280px); padding-top: 16px; }
        h1 { font-size: 27px; line-height: 1.12; }
        .controls { grid-template-columns: 1fr; }
        .grid { grid-template-columns: 1fr; }
        .history-grid { grid-template-columns: 1fr; }
      .history-row { grid-template-columns: 1fr; }
      .bar-row, .breakdown-row, .session-row, .health-row { grid-template-columns: minmax(0, 1fr); }
      .bar-value { text-align: left; }
      .health-row strong { text-align: left; word-break: break-word; }
      .status-pill { width: 100%; justify-content: flex-start; }
      .status { text-align: left; }
    }
  </style>
</head>
<body>
  <main>
      <header class="topbar">
        <div>
          <div class="eyebrow">Agent analytics</div>
          <h1>Agent Usage Dashboard</h1>
          <div class="subtitle">Codex and Claude Code usage across local and SSH remotes · daily snapshots stay local</div>
        </div>
        <div class="status-pill loading" id="statusPill"><span class="status-dot"></span><span class="status" id="status" role="status" aria-live="polite">Loading</span></div>
      </header>

      <section class="controls" aria-label="Dashboard controls">
        <div class="control-group dates">
          <label class="field"><span class="field-label">Range</span><select id="range" aria-label="Date range">
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 days</option>
            <option value="last30">Last 30 days</option>
            <option value="custom">Custom</option>
          </select></label>
          <label class="field"><span class="field-label">From</span><input id="since" type="date" aria-label="Since date"></label>
          <label class="field"><span class="field-label">To</span><input id="until" type="date" aria-label="Until date"></label>
          <label class="field"><span class="field-label">Action</span><button class="refresh-button" id="refresh">Refresh</button></label>
        </div>
        <div class="control-group filters">
          <label class="field"><span class="field-label">Count</span><select id="logic" aria-label="Deduplication logic">
            <option value="ccusage">ccusage</option>
            <option value="raw">Raw events</option>
          </select></label>
          <label class="field"><span class="field-label">Metric</span><select id="metric" aria-label="Metric">
            <option value="inputTokens">Input incl. cached</option>
            <option value="uncachedInputTokens">Uncached input</option>
            <option value="cachedInputTokens">Cached input</option>
            <option value="cacheCreationInputTokens">Cache creation</option>
            <option value="outputTokens">Output</option>
            <option value="cachedOutputTokens">Cached output</option>
            <option value="totalTokens">Total tokens</option>
          </select></label>
          <label class="field"><span class="field-label">Breakdown</span><select id="breakdown" aria-label="Chart breakdown">
            <option value="source">By source</option>
            <option value="engine">By engine</option>
            <option value="host">By host</option>
            <option value="total">Total only</option>
          </select></label>
          <label class="field"><span class="field-label">Host</span><select id="host" aria-label="Host filter"><option value="all">All hosts</option></select></label>
          <label class="field"><span class="field-label">Engine</span><select id="engine" aria-label="Engine filter"><option value="all">All engines</option></select></label>
          <label class="field"><span class="field-label">Source</span><select id="source" aria-label="Source filter"><option value="all">All sources</option></select></label>
        </div>
      </section>

      <section class="grid">
        <div class="metric"><div><div class="label">Total tokens</div><div class="value" id="totalTokens">-</div></div><div class="metric-subline" id="dateNote">-</div></div>
        <div class="metric"><div><div class="label">Input tokens incl. cached</div><div class="value" id="inputTokens">-</div></div><div class="metric-subline" id="cachedNote">-</div></div>
        <div class="metric"><div><div class="label">Cache read</div><div class="value" id="cacheReadTokens">-</div></div><div class="metric-subline">Cached input tokens</div></div>
        <div class="metric"><div><div class="label">Cache create</div><div class="value" id="cacheCreateTokens">-</div></div><div class="metric-subline">Cache write input tokens</div></div>
        <div class="metric"><div><div class="label">Output tokens</div><div class="value" id="outputTokens">-</div></div><div class="metric-subline" id="reasoningNote">-</div></div>
      </section>

      <section class="layout">
        <div class="main-stack">
          <div class="panel chart-panel">
            <div class="panel-title"><h2>Usage Trend</h2><div class="panel-meta"><span class="pill" id="historyMode"><span class="pill-dot"></span>Live scan</span><span id="chartBreakdownNote">By source</span></div></div>
            <div class="tabs" role="tablist" aria-label="Usage chart views">
              <button class="tab-button" type="button" role="tab" id="tab-overview" aria-selected="false" aria-controls="panel-overview" data-chart-tab="overview">Daily trend</button>
              <button class="tab-button" type="button" role="tab" id="tab-hourly" aria-selected="true" aria-controls="panel-hourly" data-chart-tab="hourly">Recent hourly</button>
              <button class="tab-button" type="button" role="tab" id="tab-daily" aria-selected="false" aria-controls="panel-daily" data-chart-tab="daily">Daily rows</button>
            </div>
            <div class="tab-panel" id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" hidden>
              <div class="overview-chart" id="dailyOverview"></div>
            </div>
            <div class="tab-panel" id="panel-hourly" role="tabpanel" aria-labelledby="tab-hourly">
            <div class="bars" id="hourlyBars"></div>
          </div>
          <div class="tab-panel" id="panel-daily" role="tabpanel" aria-labelledby="tab-daily" hidden>
            <div class="bars" id="dailyBars"></div>
          </div>
          </div>
          <div class="panel source-health-panel">
            <div class="split-row"><h2>Source Health</h2><button class="secondary-button" id="retryUnread" type="button" disabled>Re-read selected</button></div>
            <div class="source-alerts" id="sourceAlerts"></div>
            <div class="source-health-grid" id="sourceHealth"></div>
          </div>
          <div class="panel">
            <h2>Sources</h2>
            <div id="sources"></div>
          </div>
          <div class="panel">
            <h2>ccusage Ledger</h2>
            <div class="ledger-wrap">
              <table class="ledger">
                <thead><tr><th>Source</th><th>Input</th><th>Output</th><th>Cache Create</th><th>Cache Read</th><th>Total</th></tr></thead>
                <tbody id="usageLedger"></tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="side-stack">
          <div class="panel">
            <div class="split-row"><h2>Snapshot Store</h2><span class="pill" id="snapshotState"><span class="pill-dot"></span>Enabled</span></div>
            <div id="historyStore"></div>
          </div>
          <div class="panel">
            <h2>Token Mix</h2>
            <div class="mix" id="mix"></div>
          <div class="legend" id="mixLegend"></div>
        </div>
          <div class="panel">
            <h2>Log Processing</h2>
            <div class="legend" id="stats"></div>
          </div>
        <div class="panel">
          <h2>Engines</h2>
          <div id="engines"></div>
        </div>
        <div class="panel">
          <h2>Top Projects</h2>
          <div id="projects"></div>
        </div>
        <div class="panel">
          <h2>Top Sessions</h2>
          <div id="sessions"></div>
        </div>
        </div>
    </section>
  </main>

  <script>
    const $ = (id) => document.getElementById(id);
    const fmt = (value) => Math.round(value || 0).toLocaleString("en-US");
    const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
    const pct = (value, total) => total > 0 ? value / total * 100 : 0;
    const shortName = (sessionId) => (sessionId.split("/").at(-1) || sessionId).replace(/^rollout-/, "").replace(/-[0-9a-f]{8,}.*$/i, "");
    const shortProjectName = (project) => {
      const parts = String(project || "(unknown)").split("/").filter(Boolean);
      return parts.at(-1) || project || "(unknown)";
    };
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    const palette = ["#0f9f6e", "#2563eb", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#475569"];
    const colorMap = new Map();
    const breakdownLabels = {
      total: "Total only",
      source: "By source",
      engine: "By engine",
      host: "By host",
    };
      let loading = false;
      let currentData = null;
      let queuedLoadOptions = null;
      let activeController = null;

      function setStatus(message, level = "ok") {
        $("status").textContent = message;
        $("status").className = level === "warn" ? "status warn" : "status";
        $("statusPill").className = "status-pill" + (level === "warn" ? " warn" : (level === "loading" ? " loading" : ""));
      }

    function metricValue(row, metric) {
      if (metric === "uncachedInputTokens") {
        return Math.max((row.inputTokens || 0) - (row.cachedInputTokens || 0) - (row.cacheCreationInputTokens || 0), 0);
      }
      return row[metric] || 0;
    }

    function cachedShareForMetric(row, metric) {
      if (metric === "inputTokens") {
        return pct(row.cachedInputTokens || 0, row.inputTokens || 0);
      }
      if (metric === "outputTokens") {
        return pct(row.cachedOutputTokens || 0, row.outputTokens || 0);
      }
      return 0;
    }

    function groupKey(row, breakdown) {
      if (breakdown === "source") return row.sourceId || row.sourceLabel || "(unknown)";
      if (breakdown === "engine") return row.engine || "(unknown)";
      if (breakdown === "host") return row.host || "(unknown)";
      return "total";
    }

    function groupColor(row, breakdown) {
      const key = breakdown + ":" + groupKey(row, breakdown);
      if (!colorMap.has(key)) {
        colorMap.set(key, palette[colorMap.size % palette.length]);
      }
      return colorMap.get(key);
    }

    function formatMetric(value, metric) {
      return fmt(value);
    }

    function formatChartMetric(value, metric) {
      return compactFmt.format(value || 0);
    }

    function newestFirst(rows, key = "date") {
      return [...(rows || [])].sort((left, right) => String(right[key] || "").localeCompare(String(left[key] || "")));
    }

    function toDateInput(date) {
      const tzDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      return tzDate.toISOString().slice(0, 10);
    }

    function setRangeDates() {
      const range = $("range").value;
      const today = new Date();
      if (range === "today") {
        $("since").value = toDateInput(today);
        $("until").value = toDateInput(today);
      } else if (range === "yesterday") {
        const day = new Date(today);
        day.setDate(day.getDate() - 1);
        $("since").value = toDateInput(day);
        $("until").value = toDateInput(day);
        } else if (range === "last7") {
          const start = new Date(today);
          start.setDate(start.getDate() - 6);
          $("since").value = toDateInput(start);
          $("until").value = toDateInput(today);
        } else if (range === "last30") {
          const start = new Date(today);
          start.setDate(start.getDate() - 29);
          $("since").value = toDateInput(start);
          $("until").value = toDateInput(today);
        }
      }

    function groupRowsFor(row, breakdown) {
      if (breakdown === "source") return row.sources || [];
      if (breakdown === "engine") return row.engines || [];
      if (breakdown === "host") return row.hosts || [];
      return [];
    }

    function groupLabel(row, breakdown) {
      if (breakdown === "source") return row.sourceLabel || row.sourceId || "(unknown)";
      if (breakdown === "engine") return row.engine || "(unknown)";
      if (breakdown === "host") return row.host || "(unknown)";
      return "Total";
    }

    function renderTotalBars(rows, labelField, metricField) {
      const max = Math.max(...rows.map((row) => metricValue(row, metricField)), 1);
      return rows.map((row) => {
        const value = metricValue(row, metricField);
        const width = Math.max(2, pct(value, max));
        const cachedShare = cachedShareForMetric(row, metricField);
        return '<div class="bar-row">' +
          '<div class="bar-label">' + escapeHtml(row[labelField]) + '</div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + width + '%"><span class="bar-cache" style="width:' + cachedShare + '%"></span></div></div>' +
          '<div class="bar-value">' + formatMetric(value, metricField) + '</div>' +
        '</div>';
      }).join("");
    }

    function renderBreakdownBars(rows, labelField, metricField, breakdown) {
      const max = Math.max(...rows.map((row) => metricValue(row, metricField)), 1);
      return rows.map((row) => {
        const rowValue = metricValue(row, metricField);
        const groups = groupRowsFor(row, breakdown)
          .map((group) => ({ group, value: metricValue(group, metricField) }))
          .filter((item) => item.value > 0)
          .sort((left, right) => right.value - left.value);
        const segments = groups.map((item) => {
          const color = groupColor(item.group, breakdown);
          const width = pct(item.value, max);
          const label = groupLabel(item.group, breakdown);
          return '<div class="stack-segment" title="' + escapeHtml(label + " · " + formatMetric(item.value, metricField)) + '" style="width:' + width + '%;background:' + color + '"></div>';
        }).join("");
        const visible = groups.slice(0, 6).map((item) => {
          const color = groupColor(item.group, breakdown);
          return '<span class="breakdown-item"><span class="swatch" style="background:' + color + '"></span>' +
            '<span>' + escapeHtml(groupLabel(item.group, breakdown)) + '</span>' +
            '<strong>' + formatMetric(item.value, metricField) + '</strong></span>';
        }).join("");
        const extra = groups.length > 6 ? '<span class="breakdown-item">+' + (groups.length - 6) + ' more</span>' : "";
        return '<div class="breakdown-row">' +
          '<div class="bar-label">' + escapeHtml(row[labelField]) + '</div>' +
          '<div><div class="breakdown-stack">' + (segments || '<div class="stack-segment" style="width:0"></div>') + '</div>' +
          '<div class="breakdown-list">' + (visible + extra || '<span class="note">No grouped data</span>') + '</div></div>' +
          '<div class="bar-value">' + formatMetric(rowValue, metricField) + '</div>' +
        '</div>';
      }).join("");
    }

    function renderBars(el, rows, labelField, metricField, breakdown, emptyHtml = '<div class="note">No data</div>') {
      const mode = breakdown || "total";
      const html = mode === "total"
        ? renderTotalBars(rows, labelField, metricField)
        : renderBreakdownBars(rows, labelField, metricField, mode);
      el.innerHTML = html || emptyHtml;
    }

      function renderDailyOverview(rows, metricField, breakdown) {
        const max = Math.max(...rows.map((row) => metricValue(row, metricField)), 1);
        $("dailyOverview").className = "overview-chart" + (rows.length <= 1 ? " is-single" : "");
        $("dailyOverview").innerHTML = rows.map((row) => {
          const rowValue = metricValue(row, metricField);
        const groups = breakdown === "total"
          ? [{ group: { sourceId: "total", sourceLabel: "Total" }, value: rowValue }]
          : groupRowsFor(row, breakdown)
            .map((group) => ({ group, value: metricValue(group, metricField) }))
            .filter((item) => item.value > 0)
            .sort((left, right) => right.value - left.value);
        const segments = groups.map((item) => {
          const color = breakdown === "total" ? "var(--blue)" : groupColor(item.group, breakdown);
          const height = Math.max(2, pct(item.value, max));
          const label = breakdown === "total" ? "Total" : groupLabel(item.group, breakdown);
          return '<div class="overview-segment" title="' + escapeHtml(label + " · " + formatMetric(item.value, metricField)) + '" style="height:' + height + '%;background:' + color + '"></div>';
        }).join("");
          const historyLabel = row.partial ? " partial" : (row.fromHistory ? " saved" : "");
          return '<div class="overview-column' + (row.fromHistory ? " is-history" : "") + '">' +
            '<div class="overview-value" title="' + escapeHtml(formatMetric(rowValue, metricField)) + '">' + formatChartMetric(rowValue, metricField) + '</div>' +
            '<div class="overview-bar">' + (segments || '<div class="overview-segment" style="height:0"></div>') + '</div>' +
            '<div class="overview-label" title="' + escapeHtml(row.date + historyLabel) + '">' + escapeHtml(row.date + historyLabel) + '</div>' +
          '</div>';
        }).join("") || '<div class="note">No data</div>';
      }

      function renderCharts(data) {
        const metric = $("metric").value;
        const breakdown = $("breakdown").value;
        $("chartBreakdownNote").textContent = breakdownLabels[breakdown] || "Total only";
        const trendRows = newestFirst(data.trendDaily || data.daily || []);
        const dailyRows = newestFirst(data.daily || []);
        const hourlyRows = newestFirst((data.hourly || []).slice(-36), "hour");
        const missingDates = data.historyHourlyMissingDates || data.history?.hourlyMissingDates || [];
        const hourlyEmpty = missingDates.length
          ? '<div class="note">Hourly detail was not saved for ' + escapeHtml(missingDates.slice(0, 4).join(", ")) + (missingDates.length > 4 ? " +" + (missingDates.length - 4) + " more" : "") + '. Use Refresh to rebuild these saved snapshots with hourly detail.</div>'
          : '<div class="note">No hourly data for this view.</div>';
        renderDailyOverview(trendRows, metric, breakdown);
        renderBars($("hourlyBars"), hourlyRows, "hour", metric, breakdown, hourlyEmpty);
        renderBars($("dailyBars"), dailyRows, "date", metric, breakdown);
      }

      function setChartTab(tab) {
        document.querySelectorAll("[data-chart-tab]").forEach((button) => {
          const selected = button.dataset.chartTab === tab;
          button.setAttribute("aria-selected", selected ? "true" : "false");
          button.tabIndex = selected ? 0 : -1;
        });
        for (const name of ["overview", "hourly", "daily"]) {
          $("panel-" + name).hidden = name !== tab;
        }
    }

    function renderSessions(rows, metric) {
      const sessions = [...rows].sort((left, right) => metricValue(right, metric) - metricValue(left, metric)).slice(0, 16);
      const max = Math.max(...sessions.map((row) => metricValue(row, metric)), 1);
      $("sessions").innerHTML = sessions.map((row) => {
        const cachedShare = cachedShareForMetric(row, metric);
        const value = metricValue(row, metric);
        const width = Math.max(2, pct(value, max));
        const meta = [row.host, row.engine, row.project].filter(Boolean).join(" · ");
        return '<div class="session-row">' +
          '<div><div class="session-name">' + escapeHtml(shortName(row.originalSessionId || row.sessionId)) + '</div><div class="session-id">' + escapeHtml(meta) + '</div></div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + width + '%"><span class="bar-cache" style="width:' + cachedShare + '%"></span></div></div>' +
          '<div class="bar-value">' + formatMetric(value, metric) + '</div>' +
        '</div>';
      }).join("") || '<div class="note">No sessions</div>';
    }

    function renderProjects(rows, metric) {
      const projects = [...rows].sort((left, right) => metricValue(right, metric) - metricValue(left, metric)).slice(0, 12);
      const max = Math.max(...projects.map((row) => metricValue(row, metric)), 1);
      $("projects").innerHTML = projects.map((row) => {
        const cachedShare = cachedShareForMetric(row, metric);
        const value = metricValue(row, metric);
        const width = Math.max(2, pct(value, max));
        const sessionText = [row.host, fmt(row.sessionCount || 0) + " sessions"].filter(Boolean).join(" · ");
        return '<div class="session-row">' +
          '<div><div class="session-name">' + escapeHtml(shortProjectName(row.project)) + '</div><div class="session-id">' + escapeHtml(row.project) + '</div></div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + width + '%"><span class="bar-cache" style="width:' + cachedShare + '%"></span></div></div>' +
          '<div class="bar-value">' + formatMetric(value, metric) + '<div class="session-id">' + escapeHtml(sessionText) + '</div></div>' +
        '</div>';
      }).join("") || '<div class="note">No projects</div>';
    }

    function renderUsageRows(el, rows, metric, labelFn, metaFn) {
      const items = [...rows].sort((left, right) => metricValue(right, metric) - metricValue(left, metric)).slice(0, 12);
      const max = Math.max(...items.map((row) => metricValue(row, metric)), 1);
      el.innerHTML = items.map((row) => {
        const value = metricValue(row, metric);
        const width = Math.max(2, pct(value, max));
        const cachedShare = cachedShareForMetric(row, metric);
        return '<div class="session-row">' +
          '<div><div class="session-name">' + escapeHtml(labelFn(row)) + '</div><div class="session-id">' + escapeHtml(metaFn(row)) + '</div></div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + width + '%"><span class="bar-cache" style="width:' + cachedShare + '%"></span></div></div>' +
          '<div class="bar-value">' + formatMetric(value, metric) + '</div>' +
        '</div>';
      }).join("") || '<div class="note">No data</div>';
    }

    function renderUsageLedger(rows) {
      const items = [...(rows || [])].sort((left, right) => (right.totalTokens || 0) - (left.totalTokens || 0));
      $("usageLedger").innerHTML = items.map((row) => {
        const uncachedInput = Math.max((row.inputTokens || 0) - (row.cachedInputTokens || 0) - (row.cacheCreationInputTokens || 0), 0);
        return '<tr>' +
          '<td title="' + escapeHtml([row.sourceLabel || row.sourceId, row.host, row.engine].filter(Boolean).join(" · ")) + '">' + escapeHtml(row.sourceLabel || row.sourceId || "(unknown)") + '</td>' +
          '<td>' + fmt(uncachedInput) + '</td>' +
          '<td>' + fmt(row.outputTokens) + '</td>' +
          '<td>' + fmt(row.cacheCreationInputTokens) + '</td>' +
          '<td>' + fmt(row.cachedInputTokens) + '</td>' +
          '<td>' + fmt(row.totalTokens) + '</td>' +
        '</tr>';
      }).join("") || '<tr><td colspan="6">No data</td></tr>';
    }

    function sourceState(row) {
      if (!row.ok) return "error";
      if ((row.events || 0) === 0) return "empty";
      return "ok";
    }

    function renderSourceAlerts(alerts, historyOnly = false) {
      const rows = alerts || [];
      $("retryUnread").disabled = historyOnly || !rows.some((row) => row.retryable !== false);
      if (historyOnly && rows.length === 0) {
        $("sourceAlerts").innerHTML = '<div class="note">Served from saved daily snapshots; sources were not read for this historical view.</div>';
        return;
      }
      $("sourceAlerts").innerHTML = rows.slice(0, 8).map((row) => {
        const badge = row.staleSnapshotEvents ? "saved fallback" : (row.level === "error" ? "failed" : "empty");
        const counts = fmt(row.events || 0) + " events · " + fmt(row.files || 0) + "/" + fmt(row.totalFiles || 0) + " files";
        return '<div class="source-alert ' + (row.level === "error" ? "error" : "") + '">' +
          '<div class="source-alert-title"><span>' + escapeHtml(row.label || row.id) + '</span><span>' + escapeHtml(badge) + '</span></div>' +
          '<div class="source-alert-detail">' + escapeHtml(row.reason) + '</div>' +
          '<div class="source-alert-detail">' + escapeHtml([row.host, row.engine, row.remote ? "remote" : "local", counts].filter(Boolean).join(" · ")) + '</div>' +
        '</div>';
      }).join("") + (rows.length > 8 ? '<div class="note">+' + (rows.length - 8) + ' more source alerts</div>' : "")
        || '<div class="note">All selected sources were read and produced usage events for this view.</div>';
    }

    function renderSourceHealth(rows) {
      $("sourceHealth").innerHTML = (rows || []).map((row) => {
        const state = sourceState(row);
        const timing = row.durationMs ? " · " + (row.durationMs / 1000).toFixed(1) + "s" : "";
        const scope = row.remote ? "remote" : "local";
        const stale = row.staleSnapshotEvents ? " · saved " + (row.staleSnapshotDates || []).join(",") : "";
        const detail = row.ok
          ? fmt(row.events || 0) + " events · " + fmt(row.files || 0) + "/" + fmt(row.totalFiles || 0) + " files · " + scope + (row.cacheHit ? " · cached" : "") + timing + stale
          : (row.error || "unavailable") + stale;
        return '<div class="health-row"><span>' + escapeHtml(row.label) + ' <span class="' + (state === "ok" ? "" : "warn") + '">(' + state + ')</span></span><strong>' + escapeHtml(detail) + '</strong></div>';
      }).join("") || '<div class="note">No sources</div>';
    }

    function rerenderCurrentData() {
      if (!currentData) {
        load();
        return;
      }
      const metric = $("metric").value;
      renderCharts(currentData);
      renderUsageRows($("sources"), currentData.sources || [], metric, (row) => row.sourceLabel || row.sourceId, (row) => [row.host, row.engine, fmt(row.sessionCount || 0) + " sessions"].join(" · "));
      renderUsageLedger(currentData.sources || []);
      renderUsageRows($("engines"), currentData.engines || [], metric, (row) => row.engine, (row) => fmt(row.sessionCount || 0) + " sessions · " + fmt(row.projectCount || 0) + " projects");
      renderProjects(currentData.projects || [], metric);
      renderSessions(currentData.sessions || [], metric);
    }

    function updateFilterOptions(filters) {
      setOptions("host", [{ value: "all", label: "All hosts" }, ...(filters.hosts || []).map((host) => ({ value: host, label: host }))]);
      setOptions("engine", [{ value: "all", label: "All engines" }, ...(filters.engines || []).map((engine) => ({ value: engine, label: engine }))]);
      setOptions("source", [{ value: "all", label: "All sources" }, ...(filters.sources || []).map((source) => ({ value: source.id, label: source.label }))]);
    }

    function setOptions(id, options) {
      const select = $(id);
      const current = select.value || "all";
      select.innerHTML = options.map((option) => '<option value="' + escapeHtml(option.value) + '">' + escapeHtml(option.label) + '</option>').join("");
      select.value = options.some((option) => option.value === current) ? current : "all";
    }

    function renderMix(summary) {
      const cacheCreation = summary.cacheCreationInputTokens || 0;
      const uncached = Math.max((summary.inputTokens || 0) - (summary.cachedInputTokens || 0) - cacheCreation, 0);
      const cachedOutput = summary.cachedOutputTokens || 0;
      const uncachedOutput = Math.max((summary.outputTokens || 0) - cachedOutput, 0);
      const total = summary.totalTokens || 0;
      $("mix").innerHTML =
        '<div class="mix-cached" style="width:' + pct(summary.cachedInputTokens, total) + '%"></div>' +
        '<div class="mix-uncached" style="width:' + pct(uncached, total) + '%"></div>' +
        '<div class="mix-cached-output" style="width:' + pct(cachedOutput, total) + '%"></div>' +
        '<div class="mix-output" style="width:' + pct(uncachedOutput, total) + '%"></div>';
      $("mixLegend").innerHTML =
        '<div class="legend-row"><span>Cached input</span><strong>' + fmt(summary.cachedInputTokens) + '</strong></div>' +
        '<div class="legend-row"><span>Cache creation</span><strong>' + fmt(cacheCreation) + '</strong></div>' +
        '<div class="legend-row"><span>Uncached input</span><strong>' + fmt(uncached) + '</strong></div>' +
        '<div class="legend-row"><span>Cached output</span><strong>' + fmt(cachedOutput) + ' (not exposed by ccusage v20)</strong></div>' +
        '<div class="legend-row"><span>Uncached output</span><strong>' + fmt(uncachedOutput) + '</strong></div>';
    }

      function renderHistory(history, historyOnly = false) {
        const enabled = history?.enabled !== false;
        const canonical = Boolean(history?.canonical);
        const rows = history?.daily || [];
        $("snapshotState").className = "pill" + (enabled ? "" : " warn");
        $("snapshotState").innerHTML = '<span class="pill-dot"></span>' + (enabled ? "Enabled" : "Disabled");
        $("historyMode").className = "pill" + (canonical ? "" : " warn");
        $("historyMode").innerHTML = '<span class="pill-dot"></span>' + (historyOnly ? "Saved history" : (canonical ? "Saved + live" : "Live scan only"));
        const latest = rows.at(-1);
        const recentRows = rows.slice(-4).reverse().map((row) => {
          const state = row.partial ? "partial" : (row.fromHistory ? "saved" : "live");
          return '<div class="history-row"><span>' + escapeHtml(row.date) + '</span><strong>' + fmt(row.totalTokens) + '</strong><span>' + state + '</span></div>';
        }).join("");
        $("historyStore").innerHTML =
          (() => {
            const backfillFailures = (history?.backfill?.sourceErrorDetails || []).map((row) => row.id).join(", ");
            const hourlyMissing = history?.hourlyMissingDates || [];
            const backfillNote = history?.backfill?.ran
              ? '<div class="note">Backfilled ' + escapeHtml(history.backfill.since || "-") + " to " + escapeHtml(history.backfill.until || "-") + (history.backfill.sourceErrors ? " · " + fmt(history.backfill.sourceErrors) + " source errors" + (backfillFailures ? ": " + escapeHtml(backfillFailures) : "") : "") + '</div>'
              : "";
            const hourlyNote = hourlyMissing.length
              ? '<div class="note">Missing saved hourly detail for ' + escapeHtml(hourlyMissing.slice(0, 4).join(", ")) + (hourlyMissing.length > 4 ? " +" + (hourlyMissing.length - 4) + " more" : "") + '. Refresh once to rebuild.</div>'
              : "";
            return (
          '<div class="history-grid">' +
            '<div class="history-stat"><strong>' + fmt(history?.snapshotCount || 0) + '</strong><span>trend snapshots</span></div>' +
            '<div class="history-stat"><strong>' + escapeHtml(history?.latestDate || "-") + '</strong><span>latest day</span></div>' +
            '<div class="history-stat"><strong>' + fmt(history?.backfillDays || 0) + '</strong><span>trend days</span></div>' +
          '</div>' +
          '<div class="history-path">' + escapeHtml(history?.stateDir || "-") + '</div>' +
          '<div class="note">Trend window ' + escapeHtml(history?.trendSince || "-") + " to " + escapeHtml(history?.trendUntil || "-") + '</div>' +
          '<div class="history-list">' + (recentRows || '<div class="note">No saved daily snapshots for this trend window yet.</div>') + '</div>' +
          (latest?.savedAt ? '<div class="note">Last saved ' + escapeHtml(new Date(latest.savedAt).toLocaleString()) + '</div>' : "") +
          hourlyNote +
          backfillNote
            );
          })();
      }

      function selectedViewPrefersSavedHistory(options = {}) {
        const today = toDateInput(new Date());
        return !options.force
          && $("logic").value === "ccusage"
          && $("source").value === "all"
          && $("host").value === "all"
          && $("engine").value === "all"
          && $("until").value
          && $("until").value < today;
      }

      async function load(options = {}) {
      if (loading) {
        if (options.auto) {
          return;
        }
        queuedLoadOptions = {
          ...(queuedLoadOptions || {}),
          ...options,
          force: Boolean(queuedLoadOptions?.force || options.force),
        };
        activeController?.abort();
        setStatus(options.force ? "Queued re-read..." : "Queued update...", "loading");
        return;
      }
      loading = true;
      activeController = new AbortController();
      try {
        if ($("range").value !== "custom") setRangeDates();
        const params = new URLSearchParams({
          since: $("since").value,
          until: $("until").value,
          logic: $("logic").value,
          host: $("host").value,
          engine: $("engine").value,
          source: $("source").value,
        });
        if (options.force) {
          params.set("refresh", "1");
        }
          setStatus(options.force ? "Re-reading sources..." : (selectedViewPrefersSavedHistory(options) ? "Loading saved history..." : "Refreshing..."), "loading");
          const response = await fetch("/api/usage?" + params, { cache: "no-store", signal: activeController.signal });
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        const data = await response.json();
        if (queuedLoadOptions) {
          return;
        }
        currentData = data;
        const summary = data.summary;
        const metric = $("metric").value;
        updateFilterOptions(data.availableFilters || {});
        $("totalTokens").textContent = fmt(summary.totalTokens);
        $("inputTokens").textContent = fmt(summary.inputTokens);
        $("cacheReadTokens").textContent = fmt(summary.cachedInputTokens);
        $("cacheCreateTokens").textContent = fmt(summary.cacheCreationInputTokens);
        $("outputTokens").textContent = fmt(summary.outputTokens);
          $("dateNote").textContent = data.since + " to " + data.until + " · " + data.logic + " · " + (data.timeZone || "local");
          $("cachedNote").textContent = "Includes " + fmt(summary.cachedInputTokens) + " cached · " + fmt(summary.cacheCreationInputTokens) + " cache create";
          $("reasoningNote").textContent = fmt(summary.reasoningOutputTokens) + " reasoning · cached output not reported by ccusage";
          renderMix(summary);
        renderHistory(data.history || {}, data.historyOnly);
        renderCharts(data);
        renderUsageRows($("sources"), data.sources || [], metric, (row) => row.sourceLabel || row.sourceId, (row) => [row.host, row.engine, fmt(row.sessionCount || 0) + " sessions"].join(" · "));
        renderUsageLedger(data.sources || []);
        renderUsageRows($("engines"), data.engines || [], metric, (row) => row.engine, (row) => fmt(row.sessionCount || 0) + " sessions · " + fmt(row.projectCount || 0) + " projects");
        renderProjects(data.projects || [], metric);
        renderSessions(data.sessions, metric);
        renderSourceAlerts(data.sourceAlerts || [], data.historyOnly);
        renderSourceHealth(data.sourceStatus || []);
        $("stats").innerHTML =
          '<div class="legend-row"><span>Sources</span><strong>' + fmt(data.stats.sourceCount) + " · " + fmt(data.stats.sourceErrors) + " errors" + '</strong></div>' +
          '<div class="legend-row"><span>Files scanned</span><strong>' + fmt(data.stats.files) + " / " + fmt(data.stats.totalFiles) + '</strong></div>' +
          '<div class="legend-row"><span>Files skipped</span><strong>' + fmt(data.stats.skippedFiles) + '</strong></div>' +
          '<div class="legend-row"><span>Token events</span><strong>' + fmt(data.stats.tokenEvents) + '</strong></div>' +
          '<div class="legend-row"><span>Kept events</span><strong>' + fmt(data.stats.keptEvents) + '</strong></div>' +
            '<div class="legend-row"><span>Out of range</span><strong>' + fmt(data.stats.outOfRangeSkipped) + '</strong></div>' +
          '<div class="legend-row"><span>Replay skipped</span><strong>' + fmt(data.stats.replaySkipped) + '</strong></div>' +
          '<div class="legend-row"><span>Saved days</span><strong>' + fmt(data.history?.savedDates?.length || 0) + '</strong></div>' +
          '<div class="legend-row"><span>Saved hourly rows</span><strong>' + fmt(data.history?.hourlySnapshotCount || (data.historyOnly ? (data.hourly || []).length : 0)) + '</strong></div>' +
          '<div class="legend-row"><span>Source snapshots</span><strong>' + fmt(data.history?.sourceSnapshotCount || 0) + " · " + fmt(data.staleSnapshotEvents || 0) + " stale used" + '</strong></div>';
        const cache = data.cache || {};
        const generatedTime = data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString() : new Date().toLocaleTimeString();
        const duration = data.historyOnly ? " · saved history" : (data.durationMs ? " · " + (data.durationMs / 1000).toFixed(1) + "s scan" : "");
        const refreshing = cache.refreshing ? " · refreshing" : "";
          const sourceErrors = data.stats?.sourceErrors || 0;
          const statusLevel = data.logic === "raw" || cache.stale || sourceErrors > 0 ? "warn" : "ok";
          const sourceNote = sourceErrors > 0 ? " · " + sourceErrors + " source errors" : "";
          const staleNote = data.staleSnapshotEvents > 0 ? " · using saved source snapshot" : "";
          const statusPrefix = data.historyOnly ? "Loaded saved history " : (cache.stale ? "Cached " : "Updated ");
          setStatus(statusPrefix + generatedTime + duration + refreshing + sourceNote + staleNote, statusLevel);
        } catch (error) {
          if (error.name === "AbortError" && queuedLoadOptions) {
            return;
          }
          setStatus("Error: " + error.message, "warn");
        } finally {
          activeController = null;
          loading = false;
          if (queuedLoadOptions) {
            const nextOptions = queuedLoadOptions;
            queuedLoadOptions = null;
            load(nextOptions);
          }
        }
    }

    $("range").addEventListener("change", load);
    $("logic").addEventListener("change", load);
    $("metric").addEventListener("change", rerenderCurrentData);
    $("breakdown").addEventListener("change", rerenderCurrentData);
    $("host").addEventListener("change", load);
    $("engine").addEventListener("change", load);
    $("source").addEventListener("change", load);
    $("refresh").addEventListener("click", () => load({ force: true }));
    $("retryUnread").addEventListener("click", () => load({ force: true }));
      const chartTabs = [...document.querySelectorAll("[data-chart-tab]")];
      chartTabs.forEach((button, index) => {
        button.addEventListener("click", () => {
          setChartTab(button.dataset.chartTab);
          if (currentData) renderCharts(currentData);
        });
        button.addEventListener("keydown", (event) => {
          const keyMap = { ArrowLeft: -1, ArrowRight: 1, Home: -index, End: chartTabs.length - index - 1 };
          if (!(event.key in keyMap)) return;
          event.preventDefault();
          const nextIndex = (index + keyMap[event.key] + chartTabs.length) % chartTabs.length;
          chartTabs[nextIndex].focus();
          setChartTab(chartTabs[nextIndex].dataset.chartTab);
          if (currentData) renderCharts(currentData);
        });
      });
      $("since").addEventListener("change", () => { $("range").value = "custom"; load(); });
      $("until").addEventListener("change", () => { $("range").value = "custom"; load(); });
        setChartTab("hourly");
      setRangeDates();
      load();
    setInterval(() => load({ auto: true }), 15000);
  </script>
</body>
</html>`;
}
