# NPM Packaging Notes

The package is structured so it can be published as `agent-usage-dashboard`.
It includes `skills/agent-usage-dashboard/SKILL.md` for AI assistants that support local skills.
Local working notes under `doc/` are intentionally ignored by git and excluded from the npm package.

Intended install modes:

```bash
npx -y agent-usage-dashboard serve --port 8790
npx -y agent-usage-dashboard usage --json
npx -y agent-usage-dashboard sources --json
npm install -g agent-usage-dashboard
agent-usage-dashboard serve --port 8790
```

`npx ... serve` is a foreground process, not a background daemon. It stops when the process exits. For service mode, use a process manager such as tmux, launchd, systemd, pm2, Docker, or a hosted supervisor.

Default web binding is local-only:

```bash
agent-usage-dashboard serve --host 127.0.0.1 --port 8790
```

External API access requires an explicit bind:

```bash
agent-usage-dashboard serve --host 0.0.0.0 --port 8790
```

There is no built-in authentication; do not expose this directly to the public internet.

Before publishing:

```bash
npm run check
npm run pack:dry-run
```

Do not run `npm publish` until the repository owner approves the release.

Before the first public release, update `package.json` with the final repository URL, homepage, bugs URL, and author/maintainer fields.

Recommended future work:

- Add a `doctor` command for SSH, Python, and log directory checks.
- Add parser fixtures for Codex and Claude Code logs.
- Add config schema validation with clear error messages.
- Continue splitting the CLI into `src/config`, `src/history`, `src/parsers`, `src/remote`, and `src/api` once parser fixtures exist.
- Publish signed release notes and keep private config outside the package.
