import os
import asyncio

import pytest

from browser_use.browser import BrowserProfile, BrowserSession
from browser_use.browser.events import (
    NavigateToUrlEvent,
    SetSelectionRangeEvent,
    InsertTextAtCaretEvent,
)


pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


TEST_HTML = """
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Text Selection</title></head>
  <body>
    <input id="in" value="abcdefghij" />
    <textarea id="ta">klmnopqrst</textarea>
    <div id="ce" contenteditable="true">abcde</div>
    <script>
      window.getVals = () => ({
        inVal: document.getElementById('in').value,
        taVal: document.getElementById('ta').value,
        ceVal: document.getElementById('ce').textContent,
      });
    </script>
  </body>
  </html>
"""


@pytest.mark.parametrize("headless", [True, False])
async def test_selection_range_and_insert_at_caret(tmp_path, headless):
    chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    assert os.path.exists(chrome_path), "Google Chrome not found at expected path"

    html_path = tmp_path / "sel.html"
    html_path.write_text(TEST_HTML, encoding="utf-8")

    profile = BrowserProfile(headless=headless, enable_default_extensions=False, executable_path=chrome_path)
    session = BrowserSession(browser_profile=profile)
    await session.start()
    try:
        await session.event_bus.dispatch(NavigateToUrlEvent(url=f"file://{html_path}"))
        await asyncio.sleep(0.4)

        # Input: replace range [3,7) with 'XYZ' -> abcXYZhij
        in_node = await session.build_node_from_selector('#in')
        assert in_node is not None
        await session.event_bus.dispatch(SetSelectionRangeEvent(node=in_node, start=3, end=7))
        await session.event_bus.dispatch(InsertTextAtCaretEvent(node=in_node, text='XYZ'))
        await asyncio.sleep(0.1)

        # Textarea: replace range [0,2) with 'AA' -> AAmnopqrst
        ta_node = await session.build_node_from_selector('#ta')
        assert ta_node is not None
        await session.event_bus.dispatch(SetSelectionRangeEvent(node=ta_node, start=0, end=2))
        await session.event_bus.dispatch(InsertTextAtCaretEvent(node=ta_node, text='AA'))
        await asyncio.sleep(0.1)

        # Contenteditable: insert at end -> abcde!
        ce_node = await session.build_node_from_selector('#ce')
        assert ce_node is not None
        await session.event_bus.dispatch(SetSelectionRangeEvent(node=ce_node, start=5, end=5))
        await session.event_bus.dispatch(InsertTextAtCaretEvent(node=ce_node, text='!'))
        await asyncio.sleep(0.1)

        cdp = await session.get_or_create_cdp_session()
        res = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "window.getVals()", "returnByValue": True}, session_id=cdp.session_id
        )
        vals = (res.get("result") or {}).get("value") or {}
        assert vals.get('inVal') == 'abcXYZhij'
        assert vals.get('taVal') == 'AAmnopqrst'
        assert vals.get('ceVal') == 'abcde!'
    finally:
        await session.kill()


