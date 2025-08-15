import asyncio
from contextlib import suppress
from ws_server import main as server_main, send_command

async def run():
    # Start server in background
    server_task = asyncio.create_task(server_main())
    await asyncio.sleep(0.5)  # let server start

    print("Open Chrome (Andrew profile), load the unpacked extension, switch to any normal tab.")

    # Wait for extension connection: try a command until connected
    while True:
        try:
            await send_command("navigate", {"url": "https://example.com"})
            break
        except RuntimeError:
            await asyncio.sleep(0.3)

    # Basic E2E: wait → read → click
    r1 = await send_command("waitFor", {"selector": "h1"})
    print("waitFor(h1):", r1.get("ok", False))

    r2 = await send_command("getText", {"selector": "h1"})
    print("getText(h1):", (r2.get("result") or {}).get("text"))

    r3 = await send_command("click", {"selector": "a"})
    print("click(a):", r3.get("ok", False))

    await asyncio.sleep(0.5)

    # Clean up server task quietly
    server_task.cancel()
    with suppress(asyncio.CancelledError):
        await server_task

asyncio.run(run())
