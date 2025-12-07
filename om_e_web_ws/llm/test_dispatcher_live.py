#!/usr/bin/env python3
"""
Live Dispatcher Test
====================
Tests the dispatcher through the running ws_server with actual extension.

Prerequisites:
    1. python ws_server.py (running in another terminal)
    2. Chrome with extension loaded
    3. A page open (e.g., google.com)

Run from om_e_web_ws directory:
    python -m llm.test_dispatcher_live

Or specific tests:
    python -m llm.test_dispatcher_live scroll
    python -m llm.test_dispatcher_live click a_id_0
    python -m llm.test_dispatcher_live msg "Hello there"
"""

import asyncio
import websockets
import json
import sys

SERVER_URL = "ws://localhost:17892"


async def send_dispatch_test(action: dict) -> dict:
    """
    Send an action through the dispatcher via WebSocket.

    The server's dispatch_llm_action() will route this to the appropriate handler.
    """
    try:
        async with websockets.connect(SERVER_URL) as ws:
            # Send test dispatch request
            msg = {
                "type": "test_dispatch",
                "action": action
            }
            print(f"📤 Sending: {json.dumps(action)}")
            await ws.send(json.dumps(msg))

            # Wait for response
            response = await asyncio.wait_for(ws.recv(), timeout=10.0)
            result = json.loads(response)
            print(f"📨 Response: {json.dumps(result, indent=2)}")
            return result

    except ConnectionRefusedError:
        print("❌ Cannot connect to server. Is ws_server.py running?")
        return {"ok": False, "error": "Server not running"}
    except asyncio.TimeoutError:
        print("⏰ Timeout waiting for response")
        return {"ok": False, "error": "Timeout"}
    except Exception as e:
        print(f"❌ Error: {e}")
        return {"ok": False, "error": str(e)}


async def test_scroll():
    """Test scroll capability dispatch."""
    print("\n" + "=" * 50)
    print("🧪 Testing ScrollDown capability")
    print("=" * 50)
    result = await send_dispatch_test({"cap": "ScrollDown"})
    return result.get("ok", False)


async def test_scroll_with_msg():
    """Test scroll with message."""
    print("\n" + "=" * 50)
    print("🧪 Testing ScrollDown with message")
    print("=" * 50)
    result = await send_dispatch_test({
        "cap": "ScrollDown",
        "msg": "Scrolling down to find more content..."
    })
    return result.get("ok", False)


async def test_message_only():
    """Test message-only (no action)."""
    print("\n" + "=" * 50)
    print("🧪 Testing message only (no action)")
    print("=" * 50)
    result = await send_dispatch_test({
        "msg": "I can see the page. What would you like me to do?"
    })
    return result.get("ok", False)


async def test_element_click(action_id: str):
    """Test element click dispatch."""
    print("\n" + "=" * 50)
    print(f"🧪 Testing click on {action_id}")
    print("=" * 50)
    result = await send_dispatch_test({"act": action_id})
    return result.get("ok", False)


async def test_element_input(action_id: str, value: str, submit: bool = False):
    """Test element input dispatch."""
    print("\n" + "=" * 50)
    print(f"🧪 Testing setValue on {action_id}")
    print("=" * 50)
    action = {"act": action_id, "value": value}
    if submit:
        action["submit"] = True
    result = await send_dispatch_test(action)
    return result.get("ok", False)


async def test_zoom():
    """Test zoom capability."""
    print("\n" + "=" * 50)
    print("🧪 Testing ZoomIn capability")
    print("=" * 50)
    result = await send_dispatch_test({"cap": "ZoomIn"})

    if result.get("ok"):
        print("\n⏳ Waiting 2s then resetting zoom...")
        await asyncio.sleep(2)
        await send_dispatch_test({"cap": "ZoomReset"})

    return result.get("ok", False)


async def run_all_safe_tests():
    """Run tests that are safe (no clicking random elements)."""
    print("=" * 60)
    print("🧪 LIVE DISPATCHER TESTS")
    print("=" * 60)
    print("\nPrerequisites:")
    print("  1. ws_server.py running")
    print("  2. Chrome extension loaded")
    print("  3. A page open")
    print()

    results = []

    # Test message only
    results.append(("Message only", await test_message_only()))

    # Test scroll
    results.append(("ScrollDown", await test_scroll()))

    # Test scroll with message
    results.append(("ScrollDown + msg", await test_scroll_with_msg()))

    # Test zoom (resets after)
    results.append(("ZoomIn/Reset", await test_zoom()))

    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST RESULTS")
    print("=" * 60)
    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {status}: {name}")

    all_passed = all(r[1] for r in results)
    print()
    if all_passed:
        print("🎉 All tests passed!")
    else:
        print("⚠️ Some tests failed")

    return all_passed


async def main():
    args = sys.argv[1:]

    if not args:
        # Run all safe tests
        await run_all_safe_tests()

    elif args[0] == "scroll":
        await test_scroll()

    elif args[0] == "zoom":
        await test_zoom()

    elif args[0] == "msg":
        msg = args[1] if len(args) > 1 else "Test message"
        await send_dispatch_test({"msg": msg})

    elif args[0] == "click":
        if len(args) < 2:
            print("Usage: python -m llm.test_dispatcher_live click a_id_X")
            return
        await test_element_click(args[1])

    elif args[0] == "input":
        if len(args) < 3:
            print("Usage: python -m llm.test_dispatcher_live input a_id_X 'value'")
            return
        submit = "--submit" in args
        await test_element_input(args[1], args[2], submit)

    elif args[0] == "raw":
        # Send raw JSON action
        if len(args) < 2:
            print("Usage: python -m llm.test_dispatcher_live raw '{\"cap\": \"ScrollDown\"}'")
            return
        action = json.loads(args[1])
        await send_dispatch_test(action)

    else:
        print(f"Unknown command: {args[0]}")
        print("\nUsage:")
        print("  python -m llm.test_dispatcher_live           # run all safe tests")
        print("  python -m llm.test_dispatcher_live scroll    # test scroll")
        print("  python -m llm.test_dispatcher_live zoom      # test zoom")
        print("  python -m llm.test_dispatcher_live msg 'hi'  # test message")
        print("  python -m llm.test_dispatcher_live click a_id_X")
        print("  python -m llm.test_dispatcher_live input a_id_X 'value' [--submit]")
        print("  python -m llm.test_dispatcher_live raw '{\"cap\":\"ScrollDown\"}'")


if __name__ == "__main__":
    asyncio.run(main())
