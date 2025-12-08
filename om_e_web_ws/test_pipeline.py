#!/usr/bin/env python3
"""
Pipeline Diagnostic Test
=========================
Tests all capability types and action routes to verify the execution pipeline.

Run from om_e_web_ws directory:
    python test_pipeline.py

Prerequisites:
    1. ws_server.py running
    2. Chrome extension loaded
    3. Navigate to a page with various elements (inputs, buttons, links)

Test Categories:
    1. Internal capabilities (server-side) - GetChatList, GetLLMConfig
    2. Browser capabilities (extension) - ScrollDown, ZoomIn
    3. DOM actions (content script) - click, setValue on a_id_X elements
    4. HUD capabilities - ToggleHUD, ShowSidebar
"""

import asyncio
import websockets
import json
import os
import re
import sys
from datetime import datetime

SERVER_URL = "ws://localhost:17892"
TEXT_MD_PATH = "@site_structures/text.md"


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def load_text_md():
    """Load and parse text.md for available actions."""
    if not os.path.exists(TEXT_MD_PATH):
        return None, []

    with open(TEXT_MD_PATH, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract action IDs and their types
    actions = []

    # Pattern: <Link id="a_id_X">text</Link>
    links = re.findall(r'<Link id="(a_id_\d+)"[^>]*>([^<]*)</Link>', content)
    for aid, text in links:
        actions.append({"id": aid, "type": "Link", "text": text[:50]})

    # Pattern: <Button id="a_id_X">text</Button>
    buttons = re.findall(r'<Button id="(a_id_\d+)"[^>]*>([^<]*)</Button>', content)
    for aid, text in buttons:
        actions.append({"id": aid, "type": "Button", "text": text[:50]})

    # Pattern: <Input id="a_id_X" ...>text</Input>
    inputs = re.findall(r'<Input id="(a_id_\d+)"[^>]*>([^<]*)</Input>', content)
    for aid, text in inputs:
        actions.append({"id": aid, "type": "Input", "text": text[:50]})

    # Pattern: <Radio id="a_id_X" ...>text</Radio>
    radios = re.findall(r'<Radio id="(a_id_\d+)"[^>]*>([^<]*)</Radio>', content)
    for aid, text in radios:
        actions.append({"id": aid, "type": "Radio", "text": text[:50]})

    # Pattern: <Checkbox id="a_id_X" ...>text</Checkbox>
    checkboxes = re.findall(r'<Checkbox id="(a_id_\d+)"[^>]*>([^<]*)</Checkbox>', content)
    for aid, text in checkboxes:
        actions.append({"id": aid, "type": "Checkbox", "text": text[:50]})

    # Pattern: <Select id="a_id_X" ...>text</Select>
    selects = re.findall(r'<Select id="(a_id_\d+)"[^>]*>([^<]*)</Select>', content)
    for aid, text in selects:
        actions.append({"id": aid, "type": "Select", "text": text[:50]})

    return content, actions


async def send_and_wait(msg: dict, timeout: float = 10.0) -> dict:
    """Send a message and wait for response."""
    try:
        async with websockets.connect(SERVER_URL) as ws:
            await ws.send(json.dumps(msg))
            response = await asyncio.wait_for(ws.recv(), timeout=timeout)
            return json.loads(response)
    except ConnectionRefusedError:
        return {"ok": False, "error": "Server not running"}
    except asyncio.TimeoutError:
        return {"ok": False, "error": "Timeout"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ═══════════════════════════════════════════════════════════════════════════════
# TEST FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

async def test_internal_capability(action: str, params: dict | None = None) -> dict:
    """Test an internal (server-side) capability."""
    msg = {
        "type": "execute_capability",
        "action": action,
        "params": params or {}
    }
    return await send_and_wait(msg)


async def test_browser_capability(action: str, params: dict | None = None) -> dict:
    """Test a browser capability (scroll, zoom, tabs)."""
    msg = {
        "type": "execute_capability",
        "action": action,
        "params": params or {}
    }
    return await send_and_wait(msg)


async def test_dom_action(action_id: str, action_type: str = "click", value: str | None = None, submit: bool = False) -> dict:
    """Test a DOM action (click, setValue) on an element."""
    data: dict[str, str | bool] = {
        "actionId": action_id,
        "actionType": action_type,
    }
    if value is not None:
        data["value"] = value
    if submit:
        data["submit"] = True

    msg = {
        "type": "llm_instruction",
        "data": data
    }
    return await send_and_wait(msg)


async def test_llm_dispatch_format(action_dict: dict) -> dict:
    """Test the dispatcher format (act/cap/msg)."""
    msg = {
        "type": "test_dispatch",
        "action": action_dict
    }
    return await send_and_wait(msg)


async def test_executor_format(capability_block: str) -> dict:
    """
    Test the executor format (```capability blocks).
    This simulates what happens when LLM returns capability blocks.
    """
    # We can't directly test this without going through LLMChat
    # So we'll test the parse functions instead
    from llm.executor import has_capability_calls, parse_capability_calls

    has_calls = has_capability_calls(capability_block)
    calls = parse_capability_calls(capability_block) if has_calls else []

    return {
        "has_capability_calls": has_calls,
        "parsed_calls": calls,
        "raw_input": capability_block
    }


# ═══════════════════════════════════════════════════════════════════════════════
# DIAGNOSTIC TESTS
# ═══════════════════════════════════════════════════════════════════════════════

async def run_internal_tests():
    """Test internal (server-side) capabilities."""
    print("\n" + "=" * 60)
    print("🔧 INTERNAL CAPABILITIES (Server-side)")
    print("=" * 60)

    tests = [
        ("GetChatList", {}),
        ("GetLLMConfig", {}),
        ("GetCurrentChat", {}),
    ]

    results = []
    for action, params in tests:
        print(f"\n  Testing: {action}")
        result = await test_internal_capability(action, params)
        ok = result.get("ok", False) or ("error" not in result)
        status = "✅ PASS" if ok else "❌ FAIL"
        print(f"  {status}: {json.dumps(result)[:100]}...")
        results.append((action, ok, result))

    return results


async def run_browser_tests():
    """Test browser capabilities (scroll, zoom)."""
    print("\n" + "=" * 60)
    print("🌐 BROWSER CAPABILITIES (Extension)")
    print("=" * 60)

    tests = [
        ("ScrollDown", {}),
        ("ScrollUp", {}),
        ("ZoomIn", {}),
        ("ZoomReset", {}),
    ]

    results = []
    for action, params in tests:
        print(f"\n  Testing: {action}")
        result = await test_browser_capability(action, params)
        ok = result.get("ok", False)
        status = "✅ PASS" if ok else "❌ FAIL"
        print(f"  {status}: {json.dumps(result)[:100]}...")
        results.append((action, ok, result))
        await asyncio.sleep(0.5)  # Small delay between tests

    return results


async def run_dom_action_tests(actions: list):
    """Test DOM actions on available elements."""
    print("\n" + "=" * 60)
    print("🎯 DOM ACTIONS (Content Script)")
    print("=" * 60)

    if not actions:
        print("  ⚠️ No actions found in text.md")
        return []

    # Group by type
    by_type = {}
    for action in actions:
        atype = action["type"]
        if atype not in by_type:
            by_type[atype] = []
        by_type[atype].append(action)

    print(f"\n  Found elements: {', '.join(f'{k}={len(v)}' for k, v in by_type.items())}")

    results = []

    # Test one of each type
    for atype, items in by_type.items():
        if not items:
            continue

        item = items[0]  # Take first of each type
        action_id = item["id"]
        text = item["text"]

        print(f"\n  Testing {atype}: {action_id} '{text[:30]}...'")

        if atype == "Link":
            # Just click (but warn it might navigate)
            print(f"    ⚠️ Skipping Link click (would navigate away)")
            results.append((f"{atype}:{action_id}", None, {"skipped": "navigation"}))

        elif atype == "Button":
            result = await test_dom_action(action_id, "click")
            ok = result.get("ok", False)
            status = "✅ PASS" if ok else "❌ FAIL"
            print(f"    {status}: {json.dumps(result)[:80]}...")
            results.append((f"{atype}:{action_id}", ok, result))

        elif atype == "Input":
            result = await test_dom_action(action_id, "setValue", value="test input", submit=False)
            ok = result.get("ok", False)
            status = "✅ PASS" if ok else "❌ FAIL"
            print(f"    {status}: {json.dumps(result)[:80]}...")
            results.append((f"{atype}:{action_id}", ok, result))

        elif atype in ("Radio", "Checkbox"):
            result = await test_dom_action(action_id, "toggle")
            ok = result.get("ok", False)
            status = "✅ PASS" if ok else "❌ FAIL"
            print(f"    {status}: {json.dumps(result)[:80]}...")
            results.append((f"{atype}:{action_id}", ok, result))

        elif atype == "Select":
            # Would need to know options
            print(f"    ⚠️ Skipping Select (needs option value)")
            results.append((f"{atype}:{action_id}", None, {"skipped": "needs options"}))

    return results


async def run_dispatcher_format_tests():
    """Test the dispatcher JSON format (act/cap/msg)."""
    print("\n" + "=" * 60)
    print("📋 DISPATCHER FORMAT TESTS (act/cap/msg)")
    print("=" * 60)

    tests = [
        # Capability actions
        ({"cap": "ScrollDown"}, "Simple capability"),
        ({"cap": "ScrollDown", "msg": "Scrolling..."}, "Capability with message"),

        # Message only
        ({"msg": "Just a message"}, "Message only"),

        # Element actions (using a_id_0 as test)
        ({"act": "a_id_0"}, "Simple click"),
        ({"act": "a_id_0", "value": "test", "submit": True}, "setValue with submit"),
    ]

    results = []
    for action, desc in tests:
        print(f"\n  Testing: {desc}")
        print(f"    Input: {json.dumps(action)}")
        result = await test_llm_dispatch_format(action)
        ok = result.get("ok", False)
        status = "✅ PASS" if ok else "❌ FAIL"
        print(f"    {status}: {json.dumps(result)[:80]}...")
        results.append((desc, ok, result))

    return results


def run_executor_format_tests():
    """Test the executor format (```capability blocks)."""
    print("\n" + "=" * 60)
    print("📝 EXECUTOR FORMAT TESTS (```capability blocks)")
    print("=" * 60)

    from llm.executor import has_capability_calls, parse_capability_calls

    tests = [
        # Valid capability block
        ('```capability\n{"action": "ScrollDown", "params": {}}\n```', "Simple capability block"),

        # Capability with params
        ('```capability\n{"action": "click", "params": {"actionId": "a_id_5"}}\n```', "Click with actionId"),

        # setValue capability
        ('```capability\n{"action": "setValue", "params": {"actionId": "a_id_0", "value": "test", "submit": true}}\n```', "setValue block"),

        # No capability block
        ("Just a regular message", "No capability block"),

        # Multiple blocks
        ('Some text\n```capability\n{"action": "ScrollDown", "params": {}}\n```\nMore text\n```capability\n{"action": "ZoomIn", "params": {}}\n```', "Multiple blocks"),
    ]

    results = []
    for text, desc in tests:
        print(f"\n  Testing: {desc}")
        has_calls = has_capability_calls(text)
        calls = parse_capability_calls(text) if has_calls else []

        print(f"    has_capability_calls: {has_calls}")
        print(f"    parsed_calls: {len(calls)}")
        for call in calls:
            print(f"      - action: {call.get('action')}, params: {call.get('params')}")

        ok = (has_calls == ("capability" in text.lower()))
        status = "✅ PASS" if ok else "❌ FAIL"
        print(f"    {status}")
        results.append((desc, ok, {"has_calls": has_calls, "calls": calls}))

    return results


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

async def main():
    print("=" * 60)
    print("🔍 OM-E PIPELINE DIAGNOSTIC TEST")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")
    print(f"Server: {SERVER_URL}")

    # Load text.md
    content, actions = load_text_md()
    if content:
        lines = content.split('\n')
        title = lines[0] if lines else "Unknown"
        print(f"Page: {title[:50]}...")
        print(f"Actions found: {len(actions)}")
    else:
        print("⚠️ text.md not found - some tests will be skipped")

    all_results = []

    # Check what tests to run
    args = sys.argv[1:] if len(sys.argv) > 1 else ["all"]

    if "all" in args or "internal" in args:
        results = await run_internal_tests()
        all_results.extend(results)

    if "all" in args or "browser" in args:
        results = await run_browser_tests()
        all_results.extend(results)

    if "all" in args or "dom" in args:
        results = await run_dom_action_tests(actions)
        all_results.extend(results)

    if "all" in args or "dispatcher" in args:
        results = await run_dispatcher_format_tests()
        all_results.extend(results)

    if "all" in args or "executor" in args:
        results = run_executor_format_tests()
        all_results.extend(results)

    # Summary
    print("\n" + "=" * 60)
    print("📊 SUMMARY")
    print("=" * 60)

    passed = sum(1 for _, ok, _ in all_results if ok is True)
    failed = sum(1 for _, ok, _ in all_results if ok is False)
    skipped = sum(1 for _, ok, _ in all_results if ok is None)

    print(f"  ✅ Passed:  {passed}")
    print(f"  ❌ Failed:  {failed}")
    print(f"  ⏭️ Skipped: {skipped}")

    if failed > 0:
        print("\n  Failed tests:")
        for name, ok, result in all_results:
            if ok is False:
                error = result.get("error", "Unknown error")
                print(f"    - {name}: {error}")

    print("\n" + "=" * 60)

    # Interactive mode
    if "--interactive" in sys.argv or "-i" in sys.argv:
        await interactive_mode(actions)


async def interactive_mode(actions: list):
    """Interactive testing mode."""
    print("\n🎮 INTERACTIVE MODE")
    print("Commands:")
    print("  cap <name> [params]  - Test capability (e.g., 'cap ScrollDown')")
    print("  act <id> [type]      - Test action (e.g., 'act a_id_5 click')")
    print("  disp <json>          - Test dispatcher format")
    print("  list                 - Show available actions from text.md")
    print("  reload               - Reload text.md")
    print("  quit                 - Exit")
    print()

    while True:
        try:
            cmd = input(">>> ").strip()
            if not cmd:
                continue

            parts = cmd.split(maxsplit=2)
            command = parts[0].lower()

            if command == "quit" or command == "q":
                break

            elif command == "list":
                _, actions = load_text_md()
                print(f"Found {len(actions)} actions:")
                for a in actions[:20]:
                    print(f"  {a['id']} ({a['type']}): {a['text'][:40]}")
                if len(actions) > 20:
                    print(f"  ... and {len(actions) - 20} more")

            elif command == "reload":
                _, actions = load_text_md()
                print(f"Reloaded: {len(actions)} actions")

            elif command == "cap":
                if len(parts) < 2:
                    print("Usage: cap <name> [params_json]")
                    continue
                action = parts[1]
                params = json.loads(parts[2]) if len(parts) > 2 else {}
                result = await test_browser_capability(action, params)
                print(f"Result: {json.dumps(result, indent=2)}")

            elif command == "act":
                if len(parts) < 2:
                    print("Usage: act <id> [action_type]")
                    continue
                action_id = parts[1]
                action_type = parts[2] if len(parts) > 2 else "click"
                result = await test_dom_action(action_id, action_type)
                print(f"Result: {json.dumps(result, indent=2)}")

            elif command == "disp":
                if len(parts) < 2:
                    print("Usage: disp <json>")
                    continue
                action = json.loads(parts[1])
                result = await test_llm_dispatch_format(action)
                print(f"Result: {json.dumps(result, indent=2)}")

            else:
                print(f"Unknown command: {command}")

        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Error: {e}")


if __name__ == "__main__":
    asyncio.run(main())
