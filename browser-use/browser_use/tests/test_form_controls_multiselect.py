import os
import asyncio

import pytest

from browser_use.browser import BrowserProfile, BrowserSession
from browser_use.browser.events import NavigateToUrlEvent, SelectOptionEvent


pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


TEST_HTML = """
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>MultiSelect</title></head>
  <body>
    <select id="ms" multiple>
      <option value="a">A</option>
      <option value="b">B</option>
      <option value="c">C</option>
    </select>
    <div id="out"></div>
    <script>
      window.getSelected = () => Array.from(document.getElementById('ms').selectedOptions).map(o=>o.value);
    </script>
  </body>
  </html>
"""


@pytest.mark.parametrize("headless", [True, False])
async def test_multiselect_values(tmp_path, headless):
    chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    assert os.path.exists(chrome_path), "Google Chrome not found at expected path"

    html_path = tmp_path / "multiselect.html"
    html_path.write_text(TEST_HTML, encoding="utf-8")

    profile = BrowserProfile(headless=headless, enable_default_extensions=False, executable_path=chrome_path)
    session = BrowserSession(browser_profile=profile)
    await session.start()
    try:
        await session.event_bus.dispatch(NavigateToUrlEvent(url=f"file://{html_path}"))
        await asyncio.sleep(0.4)

        node = await session.build_node_from_selector('#ms')
        assert node is not None
        # Select multiple by value
        await session.event_bus.dispatch(SelectOptionEvent(node=node, value=['a','c']))
        await asyncio.sleep(0.2)

        cdp = await session.get_or_create_cdp_session()
        res = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "window.getSelected()", "returnByValue": True}, session_id=cdp.session_id
        )
        vals = (res.get("result") or {}).get("value") or []
        assert set(vals) == { 'a', 'c' }

        # Deselect to single value
        await session.event_bus.dispatch(SelectOptionEvent(node=node, value=['b']))
        await asyncio.sleep(0.2)
        res = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "window.getSelected()", "returnByValue": True}, session_id=cdp.session_id
        )
        vals = (res.get("result") or {}).get("value") or []
        assert vals == ['b']
    finally:
        await session.kill()


