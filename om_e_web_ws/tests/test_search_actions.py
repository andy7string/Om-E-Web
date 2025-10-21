#!/usr/bin/env python3
"""
🔍 Semantic action search helper

This script exercises the new `searchActions` command exposed by the extension.
It connects to the websocket server, queries for actionable elements by semantic
role/keywords, prints the ranked matches, and optionally issues a follow-up
`set_value` shortcut message to prove the round trip.
"""

import argparse
import asyncio
import json
import uuid
from typing import Any, Dict, List, Optional

import websockets


def build_search_params(role: Optional[str], keywords: List[str], limit: int) -> Dict[str, Any]:
    """Normalise search parameters for the DOM command."""
    params: Dict[str, Any] = {"limit": max(1, limit)}
    if role:
        params["role"] = role
    if keywords:
        params["keywords"] = keywords
    return params


async def wait_for_response(ws: Any, target_id: str, timeout: float = 8.0) -> Dict[str, Any]:
    """Wait until the server responds with a matching command id."""
    end_time = asyncio.get_event_loop().time() + timeout
    while True:
        remaining = end_time - asyncio.get_event_loop().time()
        if remaining <= 0:
            raise asyncio.TimeoutError(f"Timeout waiting for response {target_id}")

        raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
        message = json.loads(raw)

        # Debug logs for unsolicited messages (tabs_info etc.)
        if message.get("id") != target_id:
            msg_type = message.get("type") or "unknown"
            print(f"📬 Ignored message ({msg_type}): {json.dumps(message)[:120]}")
            continue

        return message


async def discover_login_controls(ws: Any, require_visible: bool = False) -> Dict[str, Any]:
    """Invoke the discoverLoginControls command."""
    request_id = f"discover-{uuid.uuid4().hex[:8]}"
    payload = {
        "id": request_id,
        "command": "discoverLoginControls",
        "params": {"requireVisible": require_visible}
    }

    print("🔍 Discovering login controls...", "visible-only" if require_visible else "including hidden")
    await ws.send(json.dumps(payload))
    response = await wait_for_response(ws, request_id)

    if not response.get("ok"):
        raise RuntimeError(f"discoverLoginControls failed: {response.get('error')}")

    return response.get("result", {})


async def search_actions(ws: Any, params: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Send searchActions command and return the result list."""
    request_id = f"search-{uuid.uuid4().hex[:8]}"
    payload = {
        "id": request_id,
        "command": "searchActions",
        "params": params,
        "timestamp": uuid.uuid1().time  # lightweight trace for debugging
    }

    print(f"📤 Searching actions with params: {json.dumps(params)}")
    await ws.send(json.dumps(payload))
    response = await wait_for_response(ws, request_id)

    if not response.get("ok"):
        raise RuntimeError(f"searchActions failed: {response.get('error')}")

    result_block = response.get("result") or {}
    return result_block.get("results", [])


async def send_set_value(ws: Any, action_id: str, value: str, submit: bool) -> None:
    """Send the shortcut `set_value` message via the websocket bridge."""
    message: Dict[str, Any] = {
        "type": "set_value",
        "actionId": action_id,
        "value": value
    }
    if submit:
        message["submit"] = True

    print(f"📝 Sending set_value for {action_id!r} (value='{value}', submit={submit})")
    await ws.send(json.dumps(message))

    # The server sends a confirmation without a stable id, so just wait briefly
    # for the acknowledgement message that mentions the action id.
    try:
        raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
        print(f"📨 set_value ack: {raw}")
    except asyncio.TimeoutError:
        print("⏱️ No acknowledgement received within timeout (check extension logs).")


def describe_match(match: Dict[str, Any], index: int) -> None:
    """Pretty-print a single search result."""
    action_id = match.get("actionId")
    role = match.get("semanticRole")
    score = float(match.get("score", 0.0))
    confidence = float(match.get("semanticConfidence", 0.0))
    tag = match.get("tagName")
    text = (match.get("textContent") or "").strip()
    attributes = match.get("attributes") or {}

    placeholder = attributes.get("placeholder") or ""
    aria_label = attributes.get("aria-label") or ""
    name_attr = attributes.get("name") or ""

    print(f"\n[{index}] actionId={action_id}")
    print(f"     role={role} score={score:.2f} confidence={confidence}")
    print(f"     tag={tag} text='{text[:80]}'")
    if placeholder:
        print(f"     placeholder='{placeholder}'")
    if aria_label:
        print(f"     aria-label='{aria_label}'")
    if name_attr:
        print(f"     name='{name_attr}'")
    if match.get("keywordsMatched"):
        print(f"     keywords={match['keywordsMatched']}")
    if match.get("reasons"):
        print(f"     reasons={match['reasons']}")


def describe_discovery(result: Dict[str, Any]) -> None:
    """Pretty-print the discovery results."""
    if not result:
        print("❌ No discovery payload returned.")
        return

    total = result.get("total", 0)
    timestamp = result.get("timestamp")
    print(f"\n🧭 discoverLoginControls total matches: {total} (timestamp={timestamp})")

    matches = result.get("matches", {})
    for role, items in matches.items():
        print(f"\nRole: {role} ({len(items)} matches)")
        for idx, item in enumerate(items, start=1):
            selector = item.get("primarySelector")
            visible = item.get("visible")
            score = item.get("score")
            text = (item.get("text") or "")[:60]
            print(f"  [{idx}] selector={selector!r} score={score} visible={visible} text='{text}'")
            attrs = item.get("attributes") or {}
            hints = []
            for key in ("id", "name", "type", "placeholder", "ariaLabel", "dataTestId"):
                value = attrs.get(key)
                if value:
                    hints.append(f"{key}={value!r}")
            if hints:
                print(f"      attrs: {', '.join(hints)}")
            matched_by = item.get("matchedBy") or []
            if matched_by:
                print(f"      matchedBy: {matched_by}")
            if item.get("selectors"):
                additional = [s for s in item["selectors"] if s != selector][:3]
                if additional:
                    print(f"      selectors+: {additional}")


async def main_async(args: argparse.Namespace) -> None:
    uri = args.ws_url
    keywords = args.keyword or []

    params = build_search_params(args.role, keywords, args.limit)

    async with websockets.connect(uri) as ws:
        print(f"🔌 Connected to {uri}")

        if args.discover:
            discovery = await discover_login_controls(ws, require_visible=args.require_visible)
            describe_discovery(discovery)

        matches = await search_actions(ws, params)
        if not matches:
            print("❌ No matches returned by searchActions (check page snapshot).")
            return

        print(f"✅ Received {len(matches)} matches:")
        for idx, match in enumerate(matches, start=1):
            describe_match(match, idx)

        if args.value:
            chosen = matches[0]
            chosen_action_id = chosen.get("actionId")
            if not isinstance(chosen_action_id, str) or not chosen_action_id:
                raise RuntimeError("Top search result is missing a valid actionId")
            print(f"\n🎯 Using best match {chosen_action_id} for set_value.")
            await send_set_value(ws, chosen_action_id, args.value, args.submit)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Search actionable elements and exercise set_value shortcut.")
    parser.add_argument(
        "--ws-url",
        default="ws://127.0.0.1:17892",
        help="WebSocket server URL (default: %(default)s)"
    )
    parser.add_argument(
        "--role",
        default="login_email",
        help="Semantic role to search for (default: %(default)s)"
    )
    parser.add_argument(
        "--keyword",
        action="append",
        help="Additional keyword filter (can be specified multiple times)"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Maximum number of matches to return (default: %(default)s)"
    )
    parser.add_argument(
        "--value",
        help="Optional value to set on the first matching action."
    )
    parser.add_argument(
        "--submit",
        action="store_true",
        help="Include submit=true when sending set_value."
    )
    parser.add_argument(
        "--discover",
        action="store_true",
        help="Run the discoverLoginControls command before searching."
    )
    parser.add_argument(
        "--require-visible",
        action="store_true",
        help="Only report visible elements when running --discover."
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        asyncio.run(main_async(args))
    except KeyboardInterrupt:
        print("\n🛑 Interrupted by user")
    except Exception as exc:
        print(f"❌ Test failed: {exc}")


if __name__ == "__main__":
    main()
