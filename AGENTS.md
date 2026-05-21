# Agent Instructions

This repository is intended to be public and MIT licensed.

Rules for AI or human contributors:

- Do not hardcode private hostnames, IP addresses, user names, tokens, private keys, or `.env` values.
- Put machine-specific settings in `~/.config/agent-usage-dashboard/config.json` or an explicit `--config` file.
- Keep `examples/config.example.json` generic and safe for publishing.
- Remote collection must stay metadata-only. Do not copy full prompts, responses, transcripts, API keys, or project files.
- Daily snapshot history must stay aggregate-only. Do not add prompts, responses, full session transcripts, or project files to saved history.
- When adding a new remote source shape, skill workflow, JSON payload field, install mode, or web API behavior, update `README.md`, `docs/CONFIG.md`, `docs/JSON.md`, `docs/AI-QUICKSTART.md`, `docs/AI-HANDOFF.md`, `docs/RUNNING.md`, `docs/MONITORING.md`, and `skills/agent-usage-dashboard/SKILL.md`.
- Run `npm run check` before handing changes back.
- If you change dashboard behavior, verify `serve`, `/api/usage`, `/api/sources`, and `/api/health`.
