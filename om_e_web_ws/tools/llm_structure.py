#!/usr/bin/env python3

import argparse
import json
import os
import re
import signal
import sys
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple


# ------------------------------ Core Creation Logic ------------------------------


def create_llm_optimized_structure(page_jsonl_path: str, text_md_path: str) -> Dict[str, Any]:
    """
    Build a compact, LLM-friendly structure from a JSONL page snapshot and a
    companion markdown/text file. This mirrors the behavior of the original
    Node.js tools while remaining side-effect free (pure function).

    - Reads and parses page.jsonl line-by-line
    - Computes indexes for sections, texts, and actions
    - Parses the markdown to link referenced actions and gather inline meta
    - Appends a "Controls" section for unreferenced but useful actionable items
    - Returns a JSON-serializable dict with meta, markdown lines, and source info
    """
    page_records = _load_page_records(page_jsonl_path)
    text_content = Path(text_md_path).read_text(encoding="utf-8")

    meta_record, sections_by_id, text_by_id, actions = _build_page_indexes(page_records)
    parse_result = _parse_text_structure(text_content, actions, sections_by_id, text_by_id)
    used_action_set = set(parse_result.used_action_ids)
    control_lines = _build_control_lines(actions, sections_by_id, used_action_set)

    markdown_lines: List[str] = list(parse_result.markdown_lines)
    if control_lines:
        markdown_lines.append("")
        markdown_lines.append("## Controls")
        markdown_lines.append("")
        markdown_lines.extend(control_lines)

    meta = _build_meta(meta_record, parse_result.inline_meta)
    actions_map = _build_actions_map(actions.list, sections_by_id, used_action_set)

    return {
        "meta": meta,
        "markdown": markdown_lines,
        "source": {
            "pageJsonl": str(Path(page_jsonl_path).resolve()),
            "textMd": str(Path(text_md_path).resolve()),
        },
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S.%fZ", time.gmtime()),
        # Keep actions map alongside markdown like the JS tool
        "actions": actions_map,
    }


def _load_page_records(file_path: str) -> List[Dict[str, Any]]:
    """
    Load a JSONL file and parse each non-empty line as a JSON record.

    Raises a ValueError pinpointing the line number on parse failures to help
    diagnose partially-written files or malformed lines.
    """
    raw = Path(file_path).read_text(encoding="utf-8")
    lines = [line.strip() for line in re.split(r"\r?\n", raw) if line.strip()]
    records: List[Dict[str, Any]] = []
    for index, line in enumerate(lines):
        try:
            records.append(json.loads(line))
        except Exception as exc:
            raise ValueError(f"Failed to parse JSONL line {index + 1}: {exc}") from exc
    return records


@dataclass
class ActionsIndex:
    list: List[Dict[str, Any]]
    assigned: Set[str]
    used: Set[str]


def _build_page_indexes(records: List[Dict[str, Any]]) -> Tuple[
    Optional[Dict[str, Any]], Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]], ActionsIndex
]:
    """
    Construct fast-lookup maps for sections and texts, and normalize action
    records with additional metadata used in scoring and output.
    """
    sections_by_id: Dict[str, Dict[str, Any]] = {}
    text_by_id: Dict[str, Dict[str, Any]] = {}
    actions = ActionsIndex(list=[], assigned=set(), used=set())
    meta_record: Optional[Dict[str, Any]] = None

    for index, record in enumerate(records):
        rtype = record.get("type")
        if rtype == "meta" and not meta_record:
            meta_record = record
        if rtype == "section":
            sections_by_id[record["id"]] = {
                **record,
                "order": index,
                "labelNormalized": _normalize_for_match(record.get("label", "")),
                "trailNormalized": None,
            }
        if rtype == "text":
            text_by_id[record["id"]] = {
                **record,
                "order": index,
                "textNormalized": _normalize_for_match(record.get("text", "")),
            }
        if rtype == "action":
            labels = _build_action_labels(record)
            actions.list.append(
                {
                    **record,
                    "order": index,
                    "normalizedLabel": _normalize_for_match(record.get("label", "")),
                    "normalizedAliases": labels["aliases"],
                    "relatedTextIds": record.get("relatedTexts", []) or [],
                    "cachedRelatedTexts": None,
                    "sectionLabelNormalized": None,
                }
            )

    for action in actions.list:
        section_id = action.get("section")
        section = sections_by_id.get(section_id) if section_id else None
        if section:
            action["sectionLabelNormalized"] = section.get("labelNormalized")

    for section in sections_by_id.values():
        section_id_val = section.get("id")
        section_id = section_id_val if isinstance(section_id_val, str) else None
        section["trailNormalized"] = [
            _normalize_for_match(label)
            for label in _build_section_trail(section_id, sections_by_id)
        ]

    return meta_record, sections_by_id, text_by_id, actions


def _build_action_labels(action_record: Dict[str, Any]) -> Dict[str, List[str]]:
    """Collect alternative labels for an action (aria-label, title, placeholder, alt)."""
    aliases: List[str] = []

    def add_alias(value: Optional[str]) -> None:
        normalized = _normalize_for_match(value or "")
        if normalized:
            aliases.append(normalized)

    if action_record.get("ariaLabel"):
        add_alias(action_record.get("ariaLabel"))
    if action_record.get("title"):
        add_alias(action_record.get("title"))
    if action_record.get("placeholder"):
        add_alias(action_record.get("placeholder"))
    if action_record.get("alt"):
        add_alias(action_record.get("alt"))
    return {"aliases": aliases}


def _build_section_trail(section_id: Optional[str], sections_by_id: Dict[str, Dict[str, Any]]) -> List[str]:
    """Walk parent links to construct a human-readable ancestry trail."""
    trail: List[str] = []
    current = sections_by_id.get(section_id) if section_id else None
    while current and current.get("parent"):
        parent_id_val = current.get("parent")
        parent_id = parent_id_val if isinstance(parent_id_val, str) else None
        parent = sections_by_id.get(parent_id) if parent_id else None
        if not parent:
            break
        label = parent.get("label")
        if label:
            trail.insert(0, label)
        current = parent
    return trail


@dataclass
class ParseResult:
    inline_meta: Dict[str, str]
    markdown_lines: List[str]
    used_action_ids: List[str]


def _parse_text_structure(
    markdown_source: str,
    actions: ActionsIndex,
    sections_by_id: Dict[str, Dict[str, Any]],
    text_by_id: Dict[str, Dict[str, Any]],
) -> ParseResult:
    """
    Render a markdown-like output where action mentions are converted into
    link-like markers with their action ids. Captures inline meta and keeps
    track of which actions were referenced.
    """
    raw_lines = re.split(r"\r?\n", markdown_source)
    inline_meta: Dict[str, str] = {}
    heading_stack: List[Optional[str]] = []
    rendered_lines: List[str] = []

    for raw_line in raw_lines:
        trimmed = raw_line.strip()
        if not trimmed:
            rendered_lines.append("")
            continue

        heading_match = re.match(r"^(#+)\s+(.*)$", raw_line)
        if heading_match:
            level = len(heading_match.group(1))
            text = heading_match.group(2).strip()
            if len(heading_stack) < level:
                heading_stack += [None] * (level - len(heading_stack))
            heading_stack[level - 1] = _normalize_for_match(text)
            heading_stack = heading_stack[:level]
            rendered_lines.append(f"{'#' * level} {text}")
            continue

        if re.match(r"^---+$", trimmed):
            rendered_lines.append("---")
            continue

        meta_match = re.match(r"^\*\*(.+?)\*\*\s*:?\s*(.*)$", trimmed)
        if meta_match:
            key = meta_match.group(1).rstrip(":").strip()
            value = meta_match.group(2).strip()
            inline_meta[key.lower()] = value
            rendered_lines.append(f"**{key}** {value}".strip())
            continue

        matches = _find_action_matches(trimmed, actions, heading_stack, sections_by_id, text_by_id)
        if matches:
            primary = matches[0]["record"]
            is_first = primary["id"] not in actions.assigned
            rendered_lines.append(_build_action_markup(trimmed, primary, "primary" if is_first else "ref"))
            actions.used.add(primary["id"])
            if is_first:
                actions.assigned.add(primary["id"])
            continue

        rendered_lines.append(trimmed)

    return ParseResult(
        inline_meta=inline_meta,
        markdown_lines=rendered_lines,
        used_action_ids=list(actions.used),
    )


def _build_control_lines(actions: ActionsIndex, sections_by_id: Dict[str, Dict[str, Any]], used_set: Set[str]) -> List[str]:
    """
    Append a Controls section listing useful actionable elements that were not
    referenced in the text. This helps expose inputs/buttons an LLM might want
    to use even if they were not explicitly mentioned.
    """
    lines: List[str] = []
    if not actions or not isinstance(actions.list, list):
        return lines

    max_order = 0
    for action in actions.list:
        raw_order = action.get("order")
        order = int(raw_order) if isinstance(raw_order, int) else 0
        max_order = max(max_order, order)

    controls = [
        a for a in actions.list if a.get("id") not in used_set and _is_control_action(a) and _should_include_control(a)
    ]
    controls.sort(key=lambda a: a.get("order") or 0)

    for control in controls:
        label = (
            control.get("label")
            or control.get("placeholder")
            or control.get("ariaLabel")
            or control.get("title")
            or "Input field"
        )
        extras: List[str] = []
        if control.get("placeholder"):
            extras.append(f"placeholder \"{control.get('placeholder')}\"")
        if control.get("controlType") == "input":
            extras.append("input field")
        elif control.get("controlType") == "button":
            extras.append("button")
        if control.get("visibility") == "hidden":
            extras.append("hidden (requires context)")

        section_info = _describe_section(control, sections_by_id)
        if section_info:
            extras.append(section_info)
        position_info = _describe_position(control.get("order"), max_order)
        if position_info:
            extras.append(position_info)

        detail = f" — {' • '.join(extras)}" if extras else ""
        lines.append(f"- [{label}](action:{control['id']}){detail}")
        used_set.add(control["id"])
        actions.used.add(control["id"])  # keep actions.used in sync

    return lines


def _is_control_action(action: Dict[str, Any]) -> bool:
    """Heuristic to determine if an action is a control (input/textarea/select/button)."""
    if not action:
        return False
    if action.get("controlType") in ("input", "button"):
        return True
    if isinstance(action.get("actionTypes"), list):
        types = action["actionTypes"]
        if "setValue" in types:
            return True
        if "focus" in types and "navigate" not in types:
            return True
    tag = (action.get("tag") or "").lower()
    if tag in ("input", "textarea", "select"):
        return True
    if action.get("placeholder"):
        return True
    attrs = action.get("attributes") or {}
    if attrs.get("data-placeholder"):
        return True
    if (attrs.get("contenteditable") or "").lower() == "true":
        return True
    return False


def _describe_position(order: Optional[int], max_order: int) -> Optional[str]:
    """Rough position hint based on the action order within the page capture."""
    if not isinstance(order, int) or max_order <= 0:
        return None
    ratio = order / max_order
    if ratio <= 0.25:
        return "top of page"
    if ratio <= 0.75:
        return "mid page"
    return "bottom of page"


def _describe_section(action: Dict[str, Any], sections_by_id: Dict[str, Dict[str, Any]]) -> Optional[str]:
    """Best-effort summary of the section an action belongs to (label or selector)."""
    section_id = action.get("section")
    if not section_id:
        return None
    section = sections_by_id.get(section_id)
    if not section:
        return None
    if section.get("label"):
        return str(section.get("label"))
    if section.get("selector"):
        return str(section.get("selector"))
    return None


def _should_include_control(action: Dict[str, Any]) -> bool:
    """Filter out noisy controls such as hidden or file inputs without signals."""
    if not action:
        return False

    attrs = action.get("attributes") or {}
    input_type = (attrs.get("type") or "").lower()
    if input_type in ("file", "hidden"):
        return False

    data_placeholder = attrs.get("data-placeholder")
    candidates = [
        action.get("label"),
        action.get("placeholder"),
        action.get("ariaLabel"),
        action.get("title"),
        data_placeholder,
    ]
    candidates = [v.strip() for v in candidates if isinstance(v, str) and v.strip()]

    def has_meaningful_label(value: str) -> bool:
        normalized = value.lower()
        return normalized not in ("input", "button") and len(normalized) > 1

    if not any(has_meaningful_label(v) for v in candidates):
        return False

    if action.get("visibility") == "hidden" and len(candidates) == 0:
        return False

    return True


def _find_action_matches(
    text: str,
    actions: ActionsIndex,
    heading_stack: List[Optional[str]],
    sections_by_id: Dict[str, Dict[str, Any]],
    text_by_id: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Find the best matching actions for a given line of text. Uses a combination
    of exact/partial label matches, aliases, related texts, and section context.
    """
    normalized_text = _normalize_for_match(text)
    if not normalized_text:
        return []

    matches: List[Dict[str, Any]] = []
    for action in actions.list:
        score = _score_action_match(
            action,
            normalized_text,
            text,
            heading_stack,
            sections_by_id,
            text_by_id,
            actions.assigned,
        )
        if score > 0:
            matches.append({"id": action["id"], "score": score, "record": action})

    matches.sort(key=lambda m: (-m["score"], m["record"].get("order", 0)))
    best_score = matches[0]["score"] if matches else 0
    if best_score < 0.75:
        return []
    threshold = max(1.25, best_score - 1) if best_score >= 2 else best_score * 0.9
    filtered = [m for m in matches if m["score"] >= threshold]
    max_matches = 1 if best_score >= 3 else 2
    return filtered[:max_matches]


def _score_action_match(
    action: Dict[str, Any],
    normalized_text: str,
    raw_text: str,
    heading_stack: List[Optional[str]],
    sections_by_id: Dict[str, Dict[str, Any]],
    text_by_id: Dict[str, Dict[str, Any]],
    assigned: Set[str],
) -> float:
    """Score a single action against the provided context and text."""
    score = 0.0

    normalized_label = action.get("normalizedLabel") or ""
    if normalized_label == normalized_text:
        score += 3
    elif normalized_label:
        if normalized_text in normalized_label:
            score += 1.25 * _similarity_factor(normalized_label, normalized_text)
        if normalized_label in normalized_text:
            score += 1.25 * _similarity_factor(normalized_text, normalized_label)

    for alias in action.get("normalizedAliases", []) or []:
        if alias == normalized_text:
            score += 1.5
            continue
        if normalized_text in alias:
            score += 0.75 * _similarity_factor(alias, normalized_text)
        if alias in normalized_text:
            score += 0.75 * _similarity_factor(normalized_text, alias)

    for rel in _get_action_related_texts(action, text_by_id):
        if rel == normalized_text:
            score += 1.1
            continue
        if normalized_text in rel:
            score += 0.4 * _similarity_factor(rel, normalized_text)
        if rel in normalized_text:
            score += 0.4 * _similarity_factor(normalized_text, rel)

    if raw_text and action.get("label"):
        if _normalize_whitespace(str(action.get("label"))).find(raw_text) >= 0:
            score += 0.5

    if heading_stack:
        current_heading = heading_stack[-1]
        section_label_normalized = action.get("sectionLabelNormalized")
        if current_heading and section_label_normalized == current_heading:
            score += 0.75
        elif section_label_normalized and current_heading and current_heading in section_label_normalized:
            score += 0.4
        section_trail = _get_section_trail_normalized(action, sections_by_id)
        if current_heading and current_heading in section_trail:
            score += 0.35

    if action.get("id") not in assigned:
        score += 0.25
    else:
        score -= 0.35

    if action.get("visibility") == "visible":
        score += 0.1

    label_length = len(normalized_label)
    if label_length and len(normalized_text) > label_length * 2 and score > 0:
        over_factor = min(1.2, (len(normalized_text) / label_length - 2) * 0.4)
        score -= over_factor

    return score


def _get_section_trail_normalized(action: Dict[str, Any], sections_by_id: Dict[str, Dict[str, Any]]) -> List[str]:
    """Return a list of normalized section labels in the action's ancestry."""
    section_id = action.get("section")
    if not section_id:
        return []
    section = sections_by_id.get(section_id)
    if not section:
        return []
    trail = section.get("trailNormalized")
    return trail if isinstance(trail, list) else []


def _get_action_related_texts(action: Dict[str, Any], text_by_id: Dict[str, Dict[str, Any]]) -> List[str]:
    """Cache and return normalized strings from texts related to the action."""
    cached = action.get("cachedRelatedTexts")
    if isinstance(cached, list):
        return cached
    cache: List[str] = []
    for tid in action.get("relatedTextIds", []) or []:
        text_record = text_by_id.get(tid)
        if not text_record or not text_record.get("text"):
            continue
        normalized = _normalize_for_match(text_record.get("text") or "")
        if normalized:
            cache.append(normalized)
    action["cachedRelatedTexts"] = cache
    return cache


def _build_action_markup(text: str, action: Dict[str, Any], mode: str) -> str:
    """Render a markdown-style link token for the action reference."""
    escaped = _escape_markdown_link_text(text)
    prefix = "action" if mode == "primary" else "action-ref"
    return f"[{escaped}]({prefix}:{action['id']})"


def _build_meta(meta_record: Optional[Dict[str, Any]], inline_meta: Dict[str, str]) -> Dict[str, Any]:
    """
    Merge meta information from the first meta record in page.jsonl and any
    inline metadata recognized in the text source.
    """
    meta: Dict[str, Any] = {}
    if meta_record:
        if meta_record.get("url"):
            meta["url"] = meta_record.get("url")
        if meta_record.get("title"):
            meta["title"] = meta_record.get("title")
        if meta_record.get("timestamp") is not None:
            ts_val = meta_record.get("timestamp")
            try:
                if isinstance(ts_val, (int, float, str)):
                    ts = int(ts_val)
                    meta["timestamp"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(ts / 1000))
                else:
                    meta["timestamp"] = str(ts_val)
            except Exception:
                meta["timestamp"] = str(ts_val)
        if meta_record.get("viewport"):
            meta["viewport"] = meta_record.get("viewport")
        if meta_record.get("totals"):
            meta["totals"] = meta_record.get("totals")
    if inline_meta.get("url") and not meta.get("url"):
        meta["url"] = inline_meta.get("url")
    if inline_meta.get("timestamp"):
        meta["timestampText"] = inline_meta.get("timestamp")
    return meta


def _build_actions_map(action_list: List[Dict[str, Any]], sections_by_id: Dict[str, Dict[str, Any]], used_set: Set[str]) -> Dict[str, Any]:
    """
    Pack a compact map of action fields for quick lookups by id. This mirrors
    the original JS intent and keeps only used actions when a used_set is given.
    """
    packed: Dict[str, str] = {}
    for action in action_list:
        if used_set and len(used_set) and action.get("id") not in used_set:
            continue
        section_id_val = action.get("section")
        section_id = section_id_val if isinstance(section_id_val, str) else None
        section = sections_by_id.get(section_id) if section_id else None
        parts = [
            action.get("label", ""),
            action.get("href", ""),
            action.get("selector", ""),
            ",".join(action.get("actionTypes", [])) if isinstance(action.get("actionTypes"), list) else "",
            (section.get("label") if section else "") or "",
            (section.get("selector") if section else "") or "",
        ]
        packed[action["id"]] = _pack_action_parts(parts)
    return {"fields": ["label", "href", "selector", "types", "sectionLabel", "sectionSelector"], "data": packed}


# ------------------------------ String Helpers ------------------------------


def _normalize_for_match(value: str) -> str:
    """
    Normalize strings for matching:
    - Unicode NFKD normalization (decompose accents) via unicodedata
    - ASCII encode with ignore to drop diacritics
    - Lowercase, remove punctuation, collapse whitespace

    Note: The original JS used regex and diacritic stripping; this is the
    Python equivalent using unicodedata.normalize("NFKD", ...).
    """
    if not value or not isinstance(value, str):
        return ""
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_value = decomposed.encode("ascii", "ignore").decode("ascii", "ignore").replace("…", "...")
    normalized = re.sub(r"[^a-z0-9\s]", " ", ascii_value.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _normalize_whitespace(value: str) -> str:
    if not value or not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value).strip()


def _similarity_factor(longer: str, shorter: str) -> float:
    if not longer or not shorter:
        return 0.0
    len_long = len(longer)
    len_short = len(shorter)
    if len_short == 0 or len_long == 0:
        return 0.0
    base_ratio = len_short / len_long
    token_overlap = _compute_token_overlap(longer, shorter)
    return min(1.0, base_ratio * 0.7 + token_overlap * 0.3)


def _compute_token_overlap(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    tokens_a = {t for t in a.split(" ") if t}
    tokens_b = {t for t in b.split(" ") if t}
    if not tokens_a or not tokens_b:
        return 0.0
    overlap = sum(1 for t in tokens_a if t in tokens_b)
    return overlap / max(1, min(len(tokens_a), len(tokens_b)))


def _escape_markdown_link_text(value: str) -> str:
    if not value:
        return ""
    return (
        value.replace("\\", "\\\\")
        .replace("[", "\\[")
        .replace("]", "\\]")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .replace("|", "\\|")
    )


def _pack_action_parts(parts: Iterable[Any]) -> str:
    packed_parts: List[str] = []
    for part in parts:
        if part is None:
            packed_parts.append("")
            continue
        s = str(part)
        s = s.replace("\\", "\\\\").replace("|", "\\|").strip()
        packed_parts.append(s)
    return "|".join(packed_parts)


# ------------------------------ Watcher ------------------------------


class LLMStructureWatcher:
    def __init__(
        self,
        page_path: str,
        text_path: str,
        out_path: str,
        debounce_ms: int = 500,
        quiet: bool = False,
    ) -> None:
        """
        Lightweight polling-based watcher. This avoids OS-specific watch APIs
        and matches the JS behavior by:
        - Debouncing rapid successive updates (e.g., when both files update)
        - Waiting briefly for text.md to follow page.jsonl writes
        - Regenerating the output JSON when either input changes

        Polling interval defaults to 0.2s (200ms) and is configurable via CLI.
        """
        self.page_path = str(Path(page_path).resolve())
        self.text_path = str(Path(text_path).resolve())
        self.out_path = str(Path(out_path).resolve())
        self.debounce_ms = debounce_ms
        self.quiet = quiet
        self.poll_interval_s: float = 0.2  # default 200ms polling

        self._timer_deadline: Optional[float] = None
        self._pending_triggers: Set[str] = set()
        self._is_running: bool = False
        self._wait_attempts: int = 0
        self._stop: bool = False

        self._ensure_file(self.page_path)
        self._ensure_file(self.text_path)

    def start(self) -> None:
        """Run the watch loop until interrupted (Ctrl+C)."""
        self._run_optimization("startup", force=True)
        if not self.quiet:
            print(f"[watch] Watching {self.page_path}")
            print(f"[watch] Watching {self.text_path}")

        last_page_mtime = self._mtime(self.page_path)
        last_text_mtime = self._mtime(self.text_path)

        try:
            while not self._stop:
                page_mtime = self._mtime(self.page_path)
                text_mtime = self._mtime(self.text_path)

                if page_mtime != last_page_mtime:
                    last_page_mtime = page_mtime
                    if not self.quiet:
                        print(f"[watch] {Path(self.page_path).name} change detected")
                    self._schedule_run("page")

                if text_mtime != last_text_mtime:
                    last_text_mtime = text_mtime
                    if not self.quiet:
                        print(f"[watch] {Path(self.text_path).name} change detected")
                    self._schedule_run("text")

                # Debounce window
                if self._timer_deadline and time.time() >= self._timer_deadline:
                    reason = ", ".join(sorted(self._pending_triggers)) or "debounce"
                    self._run_optimization(reason)
                    self._timer_deadline = None
                    self._pending_triggers.clear()

                # Polling interval controls how often we check for file changes.
                # Default is 0.2s (200ms) to balance CPU usage and responsiveness.
                time.sleep(self.poll_interval_s)
        except KeyboardInterrupt:
            pass
        finally:
            if not self.quiet:
                print("\n[watch] Stopping LLM optimizer watcher.")

    def stop(self) -> None:
        self._stop = True

    def _ensure_file(self, file_path: str) -> None:
        if not Path(file_path).exists():
            raise FileNotFoundError(f"[watch] Required file not found: {file_path}")

    def _schedule_run(self, label: str) -> None:
        self._pending_triggers.add(label)
        self._timer_deadline = time.time() + (self.debounce_ms / 1000.0)

    def _run_optimization(self, reason: str, force: bool = False) -> None:
        if self._is_running:
            if not self.quiet:
                print("[watch] Optimization already in progress, skipping duplicate trigger.")
            return

        self._is_running = True
        try:
            page_stat = os.stat(self.page_path)
            text_stat = os.stat(self.text_path)
            page_mtime_ms = int(page_stat.st_mtime * 1000)
            text_mtime_ms = int(text_stat.st_mtime * 1000)

            if not force and page_mtime_ms > text_mtime_ms + 5:
                if self._wait_attempts < 20:
                    self._wait_attempts += 1
                    if not self.quiet:
                        print(f"[watch] Waiting for text.md to update (attempt {self._wait_attempts})")
                    self._is_running = False
                    # reschedule after debounce
                    self._timer_deadline = time.time() + (self.debounce_ms / 1000.0)
                    return
                elif not self.quiet:
                    print("[watch] Proceeding despite text.md lagging behind page.jsonl")

            self._wait_attempts = 0
            result = create_llm_optimized_structure(self.page_path, self.text_path)
            Path(self.out_path).write_text(json.dumps(result, indent=2), encoding="utf-8")
            if not self.quiet:
                rel_out = os.path.relpath(self.out_path, os.getcwd())
                print(f"[watch] 🔁 Regenerated {rel_out} (triggered by {reason})")
        except Exception as exc:
            print(f"[watch] ❌ Optimization failed: {exc}")
        finally:
            self._is_running = False

    @staticmethod
    def _mtime(file_path: str) -> float:
        try:
            return os.stat(file_path).st_mtime
        except FileNotFoundError:
            return 0.0


# ------------------------------ CLI ------------------------------


def _parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or watch LLM-optimized structure (Python port)")
    parser.add_argument("page", nargs="?", help="Path to page.jsonl (default: om_e_web_ws/@site_structures/page.jsonl)")
    parser.add_argument("text", nargs="?", help="Path to text.md (default: om_e_web_ws/@site_structures/text.md)")
    parser.add_argument("output", nargs="?", help="Output JSON path (default stdout for create; watcher uses default output)")
    parser.add_argument("--watch", action="store_true", help="Run in watch mode, regenerating on changes")
    parser.add_argument("--debounce", type=int, default=500, help="Debounce ms for watcher (default 500)")
    parser.add_argument("--poll-interval", type=float, default=0.2, help="Polling interval in seconds (default 0.2)")
    parser.add_argument("--quiet", action="store_true", help="Reduce logging noise")
    return parser.parse_args(argv)


def main() -> None:
    args = _parse_args()

    default_page = "om_e_web_ws/@site_structures/page.jsonl"
    default_text = "om_e_web_ws/@site_structures/text.md"
    default_out = "om_e_web_ws/@site_structures/llm_optimized.json"

    page_path = args.page or default_page
    text_path = args.text or default_text

    if args.watch:
        out_path = args.output or default_out
        try:
            watcher = LLMStructureWatcher(page_path, text_path, out_path, debounce_ms=args.debounce, quiet=args.quiet)
            # allow overriding the default 0.2s polling interval via CLI
            watcher.poll_interval_s = float(args.poll_interval)
            watcher.start()
        except FileNotFoundError as exc:
            print(str(exc))
            sys.exit(1)
        return

    # Single-run create mode
    try:
        result = create_llm_optimized_structure(page_path, text_path)
    except Exception as exc:
        print(f"Error: {exc}")
        sys.exit(1)

    if args.output:
        out_path = str(Path(args.output).resolve())
        Path(out_path).write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(f"LLM optimized structure written to {out_path}")
    else:
        sys.stdout.write(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()


