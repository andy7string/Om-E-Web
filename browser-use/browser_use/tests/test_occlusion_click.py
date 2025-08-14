import os
import asyncio

import pytest

from browser_use.browser import BrowserProfile, BrowserSession
from browser_use.browser.events import NavigateToUrlEvent, ClickElementEvent


pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


TEST_HTML = """
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Occlusion</title>
    <style>
      body { margin: 0; height: 2000px; }
      #btn { position:absolute; top:120px; left:40px; width:160px; height:50px; }
      #cover { position:absolute; top:0; left:0; right:0; height:160px; background:rgba(0,0,0,0.25); }
    </style>
  </head>
  <body>
    <button id="btn" onclick="document.getElementById('out').textContent='clicked'">ClickMe</button>
    <div id="cover"></div>
    <div id="out"></div>
  </body>
  </html>
"""


@pytest.mark.parametrize("headless", [True])
async def test_occlusion_click_with_nudge_and_js_fallback(tmp_path, headless):
    chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    assert os.path.exists(chrome_path), "Google Chrome not found at expected path"

    html_path = tmp_path / "occ.html"
    html_path.write_text(TEST_HTML, encoding="utf-8")

    profile = BrowserProfile(headless=headless, enable_default_extensions=False, executable_path=chrome_path)
    session = BrowserSession(browser_profile=profile)
    await session.start()
    try:
        await session.event_bus.dispatch(NavigateToUrlEvent(url=f"file://{html_path}"))
        await asyncio.sleep(0.4)

        node = await session.build_node_from_selector('#btn')
        assert node is not None
        await session.event_bus.dispatch(ClickElementEvent(node=node))
        await asyncio.sleep(0.3)

        cdp = await session.get_or_create_cdp_session()
        res = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "document.getElementById('out').textContent", "returnByValue": True}, session_id=cdp.session_id
        )
        assert (res.get("result") or {}).get("value") == "clicked"
    finally:
        await session.kill()


