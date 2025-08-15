import asyncio
import json
import websockets
import uuid

CLIENTS = set()
PENDING = {}

async def handler(ws):
    print(f"🔌 Client connected! Total clients: {len(CLIENTS) + 1}")
    CLIENTS.add(ws)
    try:
        async for raw in ws:
            print(f"📨 Received: {raw[:100]}...")
            msg = json.loads(raw)
            if "id" in msg and ("ok" in msg or "error" in msg):
                fut = PENDING.pop(msg["id"], None)
                if fut and not fut.done():
                    fut.set_result(msg)
    finally:
        CLIENTS.discard(ws)
        print(f"🔌 Client disconnected! Total clients: {len(CLIENTS)}")

# Track which client is the extension
EXTENSION_WS = None

async def handler(ws):
    global EXTENSION_WS
    print(f"🔌 Client connected! Total clients: {len(CLIENTS) + 1}")
    CLIENTS.add(ws)
    
    # First client is the extension
    if EXTENSION_WS is None:
        EXTENSION_WS = ws
        print("🎯 Marked as extension client")
    
    try:
        async for raw in ws:
            print(f"📨 Received: {raw[:100]}...")
            msg = json.loads(raw)
            
            # If this is a bridge_status message, mark as extension
            if msg.get("type") == "bridge_status":
                EXTENSION_WS = ws
                print("🎯 Marked as extension client (bridge_status)")
            
            # If this is a command from test script, forward to extension
            if "command" in msg and "id" in msg:
                print(f"🔄 Forwarding command to extension: {msg['command']}")
                if EXTENSION_WS and EXTENSION_WS != ws:
                    await EXTENSION_WS.send(json.dumps(msg))
                    print(f"✅ Command forwarded to extension")
                else:
                    print(f"❌ No extension to forward to")
            
            if "id" in msg and ("ok" in msg or "error" in msg):
                fut = PENDING.pop(msg["id"], None)
                if fut and not fut.done():
                    fut.set_result(msg)
    finally:
        CLIENTS.discard(ws)
        if ws == EXTENSION_WS:
            EXTENSION_WS = None
            print("🎯 Extension client disconnected")
        print(f"🔌 Client disconnected! Total clients: {len(CLIENTS)}")

async def send_command(command, params=None, timeout=8.0):
    print(f"🔍 send_command called with {len(CLIENTS)} clients")
    if not EXTENSION_WS:
        print("❌ No extension client connected")
        raise RuntimeError("No extension connected")
    cid = f"cmd-{uuid.uuid4().hex[:8]}"
    payload = {"id": cid, "command": command, "params": params or {}}
    print(f"📤 Sending command: {command} with id: {cid} to extension")
    fut = asyncio.get_event_loop().create_future()
    PENDING[cid] = fut
    await EXTENSION_WS.send(json.dumps(payload))
    return await asyncio.wait_for(fut, timeout=timeout)

async def main():
  async with websockets.serve(handler, "127.0.0.1", 17892):
    print("WS listening on ws://127.0.0.1:17892")
    await asyncio.Future()

if __name__ == "__main__":
  asyncio.run(main())
