import assert from "node:assert/strict";
import test from "node:test";

import { redactUsagePayload } from "../lib/redaction.mjs";

test("redactUsagePayload masks source alert reasons derived from source errors", () => {
  const redacted = redactUsagePayload({
    sourceAlerts: [
      {
        id: "private-host-codex",
        label: "Private Host Codex",
        host: "private-host",
        engine: "codex",
        remote: true,
        reason: "ssh: Could not resolve hostname private-host.internal: Name or service not known",
        events: 0,
        files: 0,
        totalFiles: 0,
      },
    ],
    sourceStatus: [
      {
        id: "private-host-codex",
        label: "Private Host Codex",
        host: "private-host",
        error: "ssh: Could not resolve hostname private-host.internal: Name or service not known",
      },
    ],
    availableFilters: {
      sources: [{ id: "private-host-codex", label: "Private Host Codex" }],
      hosts: ["private-host"],
      engines: ["codex"],
    },
  });

  assert.equal(redacted.sourceAlerts[0].label, "(redacted source)");
  assert.equal(redacted.sourceAlerts[0].host, "(redacted host)");
  assert.equal(redacted.sourceAlerts[0].reason, "(redacted)");
  assert.equal(redacted.sourceStatus[0].error, "(redacted)");
  assert.deepEqual(redacted.availableFilters.hosts, ["(redacted host)"]);
  assert.equal(redacted.availableFilters.sources[0].id, "private-host-codex");
  assert.equal(redacted.availableFilters.sources[0].label, "(redacted source)");
});
