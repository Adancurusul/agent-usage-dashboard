#!/usr/bin/env node
import { writeFile } from "node:fs/promises";

import { parseArgs } from "../lib/cli-args.mjs";
import { printDaily, printProjects, printSessions, printSourcesPayload, printUsagePayload } from "../lib/cli-output.mjs";
import { initAppDirectory, printHistory } from "../lib/history-store.mjs";
import { renderChart } from "../lib/report-page.mjs";
import { serveDashboard } from "../lib/server.mjs";
import { buildSourcesPayload, buildUsagePayloadForOptions, usageCommandOptions } from "../lib/usage-service.mjs";

async function printUsage(args) {
  const payload = await buildUsagePayloadForOptions(args, usageCommandOptions(args), args.logic);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  printUsagePayload(payload);
}

async function printSources(args) {
  const payload = await buildSourcesPayload(args);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  printSourcesPayload(payload);
}

async function printAggregateCommand(args) {
  const payload = await buildUsagePayloadForOptions(args, aggregateCommandOptions(args), args.logic);
  const rows = rowsForCommand(payload, args.command);
  const stats = payload.stats || {};

  if (args.command === "chart") {
    const html = renderChart(rows, stats);
    await writeFile(args.out, html, "utf8");
    console.log(args.out);
    return;
  }

  if (args.json) {
    console.log(JSON.stringify({ [args.command]: rows, stats }, null, 2));
    return;
  }

  if (args.command === "sessions") {
    printSessions(rows, stats);
  } else if (args.command === "projects") {
    printProjects(rows, stats);
  } else {
    printDaily(rows, stats, args.sessions);
  }
}

function aggregateCommandOptions(args) {
  const options = usageCommandOptions(args);
  if (["sessions", "projects"].includes(args.command)) {
    options.forceRefresh = true;
  }
  return options;
}

function rowsForCommand(payload, command) {
  if (command === "sessions") {
    return payload.sessions || [];
  }
  if (command === "projects") {
    return payload.projects || [];
  }
  return payload.daily || [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "init") {
    await initAppDirectory(args);
  } else if (args.command === "serve") {
    await serveDashboard(args);
  } else if (args.command === "history") {
    await printHistory(args);
  } else if (args.command === "sources") {
    await printSources(args);
  } else if (args.command === "usage") {
    await printUsage(args);
  } else {
    await printAggregateCommand(args);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
