export const REMOTE_USAGE_EXPORTER_PY = String.raw`
import base64
import datetime
import json
import os
import re
import sys
try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None

def finite(value):
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        try:
            return int(value.strip())
        except Exception:
            return 0
    return 0

def as_dict(value):
    return value if isinstance(value, dict) else {}

def empty_stats():
    return {
        "files": 0,
        "totalFiles": 0,
        "skippedFiles": 0,
        "tokenEvents": 0,
        "keptEvents": 0,
        "outOfRangeSkipped": 0,
        "replaySkipped": 0,
        "duplicateSkipped": 0,
        "resetCount": 0,
        "forkedFiles": 0,
    }

def timezone_info(timezone):
    if timezone and ZoneInfo:
        try:
            return ZoneInfo(timezone)
        except Exception:
            pass
    return datetime.datetime.now().astimezone().tzinfo

def date_key(value, timezone=None):
    if not value:
        return None
    zone = timezone_info(timezone)
    try:
        if isinstance(value, (int, float)):
            return datetime.datetime.fromtimestamp(value, tz=datetime.timezone.utc).astimezone(zone).date().isoformat()
        text = str(value).replace("Z", "+00:00")
        parsed = datetime.datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=datetime.timezone.utc)
        return parsed.astimezone(zone).date().isoformat()
    except Exception:
        return None

def in_range(key, since, until):
    if not key:
        return False
    if since and key < since:
        return False
    if until and key > until:
        return False
    return True

def event_may_return(timestamp, since, until, timezone):
    if not since and not until:
        return True
    return in_range(date_key(timestamp, timezone), since, until)

def list_jsonl(root):
    files = []
    if not os.path.isdir(root):
        return files
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [name for name in dirnames if name not in (".git", "node_modules", "target")]
        for name in filenames:
            if name.endswith(".jsonl"):
                files.append(os.path.join(dirpath, name))
    files.sort()
    return files

def normalize_usage(value, separate_cache=False, fallback_reasoning=False):
    if not isinstance(value, dict):
        return None
    cache_read = finite(value.get("cached_input_tokens", value.get("cache_read_input_tokens")))
    cache_create = finite(value.get("cache_creation_input_tokens"))
    raw_input = finite(value.get("input_tokens"))
    input_tokens = raw_input + cache_read + cache_create if separate_cache else raw_input
    raw_output = finite(value.get("output_tokens"))
    output_cache_read = 0
    output_tokens = raw_output
    reasoning = finite(value.get("reasoning_output_tokens"))
    total = (0 if separate_cache else finite(value.get("total_tokens"))) or input_tokens + output_tokens + (reasoning if fallback_reasoning else 0)
    if input_tokens == 0 and cache_read == 0 and cache_create == 0 and output_tokens == 0 and output_cache_read == 0 and reasoning == 0:
        return None
    return {
        "inputTokens": input_tokens,
        "cachedInputTokens": min(cache_read, input_tokens),
        "cacheCreationInputTokens": min(cache_create, input_tokens),
        "outputTokens": output_tokens,
        "cachedOutputTokens": min(output_cache_read, output_tokens),
        "reasoningOutputTokens": reasoning,
        "totalTokens": total,
    }

def usage_key(usage):
    if not usage:
        return "none"
    return ":".join(str(usage.get(key, 0)) for key in (
        "inputTokens",
        "cachedInputTokens",
        "cacheCreationInputTokens",
        "outputTokens",
        "cachedOutputTokens",
        "reasoningOutputTokens",
        "totalTokens",
    ))

def codex_usage_state_key(timestamp, last_usage, total_usage, reset_index=0):
    if total_usage:
        return "total:" + str(reset_index) + ":" + usage_key(total_usage)
    return str(timestamp or "") + "|" + usage_key(last_usage) + "|" + usage_key(total_usage)

def is_usage_reset(current, previous):
    return (
        current["inputTokens"] < previous["inputTokens"]
        or current["cachedInputTokens"] < previous["cachedInputTokens"]
        or current["cacheCreationInputTokens"] < previous["cacheCreationInputTokens"]
        or current["outputTokens"] < previous["outputTokens"]
        or current["cachedOutputTokens"] < previous["cachedOutputTokens"]
        or current["reasoningOutputTokens"] < previous["reasoningOutputTokens"]
        or current["totalTokens"] < previous["totalTokens"]
    )

def subtract_usage(current, previous):
    return {
        "inputTokens": max(current["inputTokens"] - previous["inputTokens"], 0),
        "cachedInputTokens": max(current["cachedInputTokens"] - previous["cachedInputTokens"], 0),
        "cacheCreationInputTokens": max(current["cacheCreationInputTokens"] - previous["cacheCreationInputTokens"], 0),
        "outputTokens": max(current["outputTokens"] - previous["outputTokens"], 0),
        "cachedOutputTokens": max(current["cachedOutputTokens"] - previous["cachedOutputTokens"], 0),
        "reasoningOutputTokens": max(current["reasoningOutputTokens"] - previous["reasoningOutputTokens"], 0),
        "totalTokens": max(current["totalTokens"] - previous["totalTokens"], 0),
    }

def extract_model(payload, fallback):
    if not isinstance(payload, dict):
        return fallback
    info = as_dict(payload.get("info"))
    metadata = as_dict(payload.get("metadata"))
    info_metadata = as_dict(info.get("metadata"))
    candidates = [
        payload.get("model"),
        payload.get("model_name"),
        info.get("model"),
        info.get("model_name"),
        info_metadata.get("model"),
        metadata.get("model"),
    ]
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return fallback

def is_forked(payload):
    if not isinstance(payload, dict):
        return False
    source = as_dict(payload.get("source"))
    subagent = as_dict(source.get("subagent"))
    thread_spawn = as_dict(subagent.get("thread_spawn"))
    return bool(
        payload.get("forked_from_id")
        or payload.get("thread_source") == "subagent"
        or thread_spawn.get("parent_thread_id")
    )

def usage_from_codex_result(value):
    value = as_dict(value)
    return (
        value.get("usage")
        or as_dict(value.get("data")).get("usage")
        or as_dict(value.get("result")).get("usage")
        or as_dict(value.get("response")).get("usage")
    )

def first_finite(*values):
    for value in values:
        number = finite(value)
        if number > 0:
            return number
    return 0

def normalize_headless_codex_usage(value):
    usage = usage_from_codex_result(value)
    if not isinstance(usage, dict):
        return None
    raw = {
        "input_tokens": first_finite(usage.get("input_tokens"), usage.get("prompt_tokens"), usage.get("input")),
        "cached_input_tokens": first_finite(usage.get("cached_input_tokens"), usage.get("cache_read_input_tokens"), usage.get("cached_tokens")),
        "output_tokens": first_finite(usage.get("output_tokens"), usage.get("completion_tokens"), usage.get("output")),
        "reasoning_output_tokens": first_finite(usage.get("reasoning_output_tokens"), usage.get("reasoning_tokens")),
        "total_tokens": finite(usage.get("total_tokens")),
    }
    if raw["input_tokens"] == 0 and raw["cached_input_tokens"] == 0 and raw["output_tokens"] == 0 and raw["reasoning_output_tokens"] == 0 and raw["total_tokens"] == 0:
        return None
    if raw["total_tokens"] == 0:
        raw["total_tokens"] = raw["input_tokens"] + raw["output_tokens"] + raw["reasoning_output_tokens"]
    return normalize_usage(raw, fallback_reasoning=True)

def extract_codex_result_model(value, fallback):
    value = as_dict(value)
    return (
        extract_model(value, None)
        or extract_model(as_dict(value.get("data")), None)
        or extract_model(as_dict(value.get("result")), None)
        or extract_model(as_dict(value.get("response")), None)
        or fallback
    )

def normalize_codex_timestamp(value):
    if isinstance(value, str) and value.strip():
        try:
            parsed = datetime.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=datetime.timezone.utc)
            return parsed.astimezone(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
        except Exception:
            return None
    number = finite(value)
    if number > 0:
        millis = number if number > 10000000000 else number * 1000
        return datetime.datetime.fromtimestamp(millis / 1000, tz=datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    return None

def codex_timestamp_from_result(value):
    value = as_dict(value)
    return (
        normalize_codex_timestamp(value.get("timestamp"))
        or normalize_codex_timestamp(value.get("created_at"))
        or normalize_codex_timestamp(value.get("createdAt"))
        or normalize_codex_timestamp(as_dict(value.get("data")).get("timestamp"))
        or normalize_codex_timestamp(as_dict(value.get("result")).get("timestamp"))
        or normalize_codex_timestamp(as_dict(value.get("response")).get("timestamp"))
    )

def parse_jsonl_line(line):
    try:
        value = json.loads(line)
        return value if isinstance(value, dict) else None
    except Exception:
        return None

def parse_codex_file(file_path, root, content, stats, since, until, logic, timezone):
    events = []
    session_id = os.path.relpath(file_path, root)
    if session_id.endswith(".jsonl"):
        session_id = session_id[:-6]
    session_id = session_id.replace(os.sep, "/")
    current_model = None
    current_project = "(unknown)"
    first_session_meta_seen = False
    first_turn_context_seen = False
    is_forked_session = False
    previous_total_usage = None
    usage_reset_index = 0
    seen_usage_events = set()

    for line in content.splitlines():
        entry = parse_jsonl_line(line.strip())
        if not entry:
            continue
        if entry.get("type") == "session_meta" and not first_session_meta_seen:
            first_session_meta_seen = True
            payload = as_dict(entry.get("payload"))
            current_project = payload.get("cwd") or current_project
            is_forked_session = is_forked(payload)
            if is_forked_session:
                stats["forkedFiles"] += 1
            continue
        if entry.get("type") == "turn_context":
            was_before = not first_turn_context_seen
            first_turn_context_seen = True
            current_model = extract_model(as_dict(entry.get("payload")), current_model)
            if is_forked_session and was_before:
                previous_total_usage = None
            continue
        payload = as_dict(entry.get("payload"))
        if entry.get("type") != "event_msg":
            usage = normalize_headless_codex_usage(entry)
            if not usage:
                continue
            timestamp = codex_timestamp_from_result(entry)
            if not timestamp:
                continue
            stats["tokenEvents"] += 1
            current_model = extract_codex_result_model(entry, current_model) or current_model or "gpt-5"
            if not event_may_return(timestamp, since, until, timezone):
                stats["outOfRangeSkipped"] += 1
                continue
            stats["keptEvents"] += 1
            events.append({
                "sessionId": session_id,
                "sessionFile": os.path.basename(file_path),
                "project": current_project,
                "timestamp": timestamp,
                "model": current_model,
                **usage,
                "costUSD": 0,
                "costSource": "estimate",
            })
            continue
        if payload.get("type") != "token_count" or not entry.get("timestamp"):
            continue
        if is_forked_session and not first_turn_context_seen:
            stats["replaySkipped"] += 1
            continue
        stats["tokenEvents"] += 1
        info = as_dict(payload.get("info"))
        last_usage = normalize_usage(info.get("last_token_usage"), fallback_reasoning=True)
        total_usage = normalize_usage(info.get("total_token_usage"), fallback_reasoning=True)
        usage_reset = bool(total_usage and previous_total_usage and is_usage_reset(total_usage, previous_total_usage))
        if usage_reset:
            usage_reset_index += 1
            stats["resetCount"] += 1
        usage = last_usage
        if not usage and total_usage:
            usage = subtract_usage(total_usage, previous_total_usage) if previous_total_usage and not usage_reset else total_usage
        if total_usage:
            previous_total_usage = total_usage
        if not usage:
            continue
        event_key = codex_usage_state_key(entry.get("timestamp"), last_usage, total_usage, usage_reset_index)
        if event_key in seen_usage_events:
            stats["duplicateSkipped"] += 1
            continue
        seen_usage_events.add(event_key)
        current_model = extract_model({**payload, "info": info}, current_model) or current_model or "gpt-5"
        if not event_may_return(entry.get("timestamp"), since, until, timezone):
            stats["outOfRangeSkipped"] += 1
            continue
        stats["keptEvents"] += 1
        event = {
            "sessionId": session_id,
            "sessionFile": os.path.basename(file_path),
            "project": current_project,
            "timestamp": entry.get("timestamp"),
            "model": current_model,
            **usage,
            "costUSD": 0,
            "costSource": "estimate",
        }
        events.append(event)
    return events

CLAUDE_UNSUPPORTED_NULL_FIELDS = (
    "id",
    "cwd",
    "model",
    "speed",
    "costUSD",
    "version",
    "sessionId",
    "requestId",
    "isApiErrorMessage",
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
)

def has_unsupported_claude_null_field(line):
    return any(re.search(r'"' + re.escape(field) + r'"\s*:\s*null', line) for field in CLAUDE_UNSUPPORTED_NULL_FIELDS)

def claude_usage_entry(entry):
    if isinstance(entry.get("message"), dict) and isinstance(entry["message"].get("usage"), dict) and entry.get("timestamp"):
        return entry
    agent_message = as_dict(as_dict(entry.get("data")).get("message"))
    message = as_dict(agent_message.get("message"))
    if isinstance(message.get("usage"), dict) and agent_message.get("timestamp"):
        return {
            "timestamp": agent_message.get("timestamp"),
            "message": message,
            "costUSD": agent_message.get("costUSD"),
            "cost_usd": agent_message.get("cost_usd"),
            "requestId": agent_message.get("requestId"),
            "request_id": agent_message.get("request_id"),
        }
    return None

def empty_if_present(value):
    return value is not None and str(value) == ""

def valid_claude_usage_entry(data):
    message = as_dict(data.get("message"))
    return bool(
        data.get("timestamp")
        and isinstance(message.get("usage"), dict)
        and not empty_if_present(data.get("sessionId", data.get("session_id")))
        and not empty_if_present(data.get("requestId", data.get("request_id")))
        and not empty_if_present(message.get("id"))
        and not empty_if_present(message.get("model"))
    )

def event_comparable_total(event):
    return (
        event.get("inputTokens", 0)
        + event.get("outputTokens", 0)
        + event.get("cacheCreationInputTokens", 0)
        + event.get("cachedInputTokens", 0)
    )

def should_replace_claude_event(candidate, existing):
    candidate_total = event_comparable_total(candidate)
    existing_total = event_comparable_total(existing)
    if candidate_total != existing_total:
        return candidate_total > existing_total
    return candidate.get("costUSD", 0) > existing.get("costUSD", 0)

def parse_claude_file(file_path, root, content, stats, since, until, timezone):
    events_by_key = {}
    session_id = os.path.relpath(file_path, root)
    if session_id.endswith(".jsonl"):
        session_id = session_id[:-6]
    session_id = session_id.replace(os.sep, "/")
    current_project = "(unknown)"
    current_model = "claude-code"

    for line in content.splitlines():
        trimmed = line.strip()
        if '"usage"' not in trimmed or has_unsupported_claude_null_field(trimmed):
            continue
        entry = parse_jsonl_line(trimmed)
        if not entry:
            continue
        data = claude_usage_entry(entry)
        if not data or not valid_claude_usage_entry(data):
            continue
        current_project = entry.get("cwd") or current_project
        timestamp = data.get("timestamp")
        message = as_dict(data.get("message"))
        usage_payload = message.get("usage")
        usage_id = message.get("id") or entry.get("uuid") or ""
        request_id = data.get("requestId") or data.get("request_id")
        stats["tokenEvents"] += 1
        usage = normalize_usage(usage_payload, separate_cache=True)
        if not usage:
            continue
        key = (usage_id + "|" + (request_id or "")) if usage_id else usage_key(usage)
        if not event_may_return(timestamp, since, until, timezone):
            stats["outOfRangeSkipped"] += 1
            continue
        message_model = message.get("model")
        if message_model and message_model != "<synthetic>":
            current_model = message_model
        model = (current_model + "-fast") if usage_payload.get("speed") == "fast" and current_model else current_model
        reported_cost = finite(data.get("costUSD", data.get("cost_usd")))
        event = {
            "sessionId": session_id,
            "sessionFile": os.path.basename(file_path),
            "project": current_project,
            "timestamp": timestamp,
            "model": model,
            **usage,
            "costUSD": reported_cost,
            "costSource": "reported" if reported_cost > 0 else "estimate",
        }
        existing = events_by_key.get(key)
        if existing:
            stats["duplicateSkipped"] += 1
            if should_replace_claude_event(event, existing):
                events_by_key[key] = event
            continue
        stats["keptEvents"] += 1
        events_by_key[key] = event
    return list(events_by_key.values())

def dedupe_codex_events(events, stats):
    seen = set()
    kept = []
    for event in events:
        key = (
            event.get("timestamp"),
            event.get("model"),
            event.get("inputTokens", 0),
            event.get("cachedInputTokens", 0),
            event.get("outputTokens", 0),
            event.get("reasoningOutputTokens", 0),
            event.get("totalTokens", 0),
        )
        if key in seen:
            stats["duplicateSkipped"] += 1
            continue
        seen.add(key)
        kept.append(event)
    return kept

def load_kind(kind, root, since, until, logic, timezone):
    if kind == "codex":
        data_root = os.path.join(root, "sessions")
    else:
        data_root = os.path.join(root, "projects")
    data_root = os.path.expanduser(data_root)
    files = list_jsonl(data_root)
    stats = empty_stats()
    stats["totalFiles"] = len(files)
    events = []
    for file_path in files:
        stats["files"] += 1
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as handle:
                content = handle.read()
        except Exception:
            continue
        if kind == "codex":
            events.extend(parse_codex_file(file_path, data_root, content, stats, since, until, logic, timezone))
        else:
            events.extend(parse_claude_file(file_path, data_root, content, stats, since, until, timezone))
    if kind == "codex":
        events = dedupe_codex_events(events, stats)
    events.sort(key=lambda item: item.get("timestamp") or "")
    return {"events": events, "stats": stats}

try:
    options = json.loads(base64.b64decode(sys.argv[2]).decode("utf-8"))
    result = load_kind(
        options.get("kind"),
        options.get("root"),
        options.get("since"),
        options.get("until"),
        options.get("logic") or "ccusage",
        options.get("timeZone"),
    )
    print(json.dumps(result, separators=(",", ":")))
except Exception as exc:
    print(json.dumps({"error": str(exc)}))
`;
