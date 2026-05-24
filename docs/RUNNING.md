# Running The Dashboard

## Is `npx` Permanent?

No. `npx -y agent-usage-dashboard serve ...` starts a normal foreground Node process.

- It keeps running while that command is running.
- It stops when the terminal, tmux pane, service, or process exits.
- It does not install a background daemon by itself.
- It may download or reuse npm's cached package before running.

Use `npx` for quick trials and one-shot JSON queries. Use a process manager for long-running service mode.

## Recommended Modes

Quick one-off web UI:

```bash
npx -y agent-usage-dashboard serve --app-dir ./agent-usage-dashboard --port 8790
```

One-shot CLI query, no service needed:

```bash
npx -y agent-usage-dashboard usage --app-dir ./agent-usage-dashboard --since 2026-05-19 --until 2026-05-19 --json
```

Global install for repeated use:

```bash
npm install -g agent-usage-dashboard
agent-usage-dashboard serve --app-dir ~/.agent-usage-dashboard --port 8790
```

tmux for a simple persistent local session:

```bash
tmux new-session -d -s agent-usage-dashboard \
  'agent-usage-dashboard serve --app-dir ~/.agent-usage-dashboard --port 8790'
```

Stop it:

```bash
tmux kill-session -t agent-usage-dashboard
```

## Local Only By Default

The web server binds to `127.0.0.1` by default:

```bash
agent-usage-dashboard serve --port 8790
```

Open:

```text
http://127.0.0.1:8790/
```

## External Access

To let another machine on your network call the Web UI or API:

```bash
agent-usage-dashboard serve --host 0.0.0.0 --port 8790
```

Sensitive API redaction is enabled by default when binding to a non-localhost host. It masks project paths, hostnames, source labels, session ids, config paths, source alert reasons, and detailed health metadata while keeping source ids usable for filters. Keep the service behind Tailscale, a VPN, an SSH tunnel, or an authenticated reverse proxy; there is no built-in authentication.

Then access:

```text
http://<machine-ip>:8790/
http://<machine-ip>:8790/api/usage?since=YYYY-MM-DD&until=YYYY-MM-DD
http://<machine-ip>:8790/api/sources
http://<machine-ip>:8790/api/health
```

Security notes:

- The dashboard has no built-in authentication.
- Do not expose it directly to the public internet.
- Prefer Tailscale, WireGuard, an SSH tunnel, or a reverse proxy with authentication.
- Treat project paths, hostnames, session ids, and token totals as sensitive metadata.

SSH tunnel example:

```bash
ssh -L 8790:127.0.0.1:8790 <dashboard-host>
```

Then open locally:

```text
http://127.0.0.1:8790/
```

## Health Checks

```bash
curl -fsS http://127.0.0.1:8790/api/health
```

The service is healthy if `serviceOk` is true. Sources are healthy if `sourceOk` is true.
