import os
import asyncio

import pytest

from browser_use.browser import BrowserProfile, BrowserSession
from browser_use.browser.events import NavigateToUrlEvent, SetCheckedEvent


pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


TEST_HTML = """
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Radio Groups</title>
    <style>
      body { height: 2000px; }
      label { margin-right: 8px; }
    </style>
  </head>
  <body>
    <div>
      <input id="r1" type="radio" name="grp" />
      <label for="r1">R1</label>
      <input id="r2" type="radio" name="grp" />
      <label for="r2">R2</label>
    </div>

    <div id="shadow-host"></div>
    <script>
      const host = document.getElementById('shadow-host');
      const sr = host.attachShadow({mode:'open'});
      sr.innerHTML = `
        <input id="sr1" type="radio" name="sgrp" />
        <label for="sr1">SR1</label>
        <input id="sr2" type="radio" name="sgrp" />
        <label for="sr2">SR2</label>
      `;
    </script>

    <iframe id="child" srcdoc='<!doctype html><html><body>
      <input id="ir1" type="radio" name="igrp" />
      <label for="ir1">IR1</label>
      <input id="ir2" type="radio" name="igrp" />
      <label for="ir2">IR2</label>
    </body></html>'></iframe>

    <script>
      window.getDom = () => ({
        r1: document.getElementById('r1').checked,
        r2: document.getElementById('r2').checked,
      });
      window.getShadow = () => ({
        sr1: document.getElementById('shadow-host').shadowRoot.getElementById('sr1').checked,
        sr2: document.getElementById('shadow-host').shadowRoot.getElementById('sr2').checked,
      });
      window.getIframe = () => ({
        ir1: document.getElementById('child').contentDocument.getElementById('ir1').checked,
        ir2: document.getElementById('child').contentDocument.getElementById('ir2').checked,
      });
    </script>
  </body>
  </html>
"""


@pytest.mark.parametrize("headless", [True, False])
async def test_radio_group_label_toggle(tmp_path, headless):
    chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    assert os.path.exists(chrome_path), "Google Chrome not found at expected path"

    html_path = tmp_path / "radios.html"
    html_path.write_text(TEST_HTML, encoding="utf-8")

    profile = BrowserProfile(headless=headless, enable_default_extensions=False, executable_path=chrome_path)
    session = BrowserSession(browser_profile=profile)
    await session.start()
    try:
        await session.event_bus.dispatch(NavigateToUrlEvent(url=f"file://{html_path}"))
        await asyncio.sleep(0.4)

        # DOM group: toggle r1 then r2 via SetCheckedEvent
        r1 = await session.build_node_from_selector('#r1')
        r2 = await session.build_node_from_selector('#r2')
        assert r1 and r2
        await session.event_bus.dispatch(SetCheckedEvent(node=r1, checked=True))
        await asyncio.sleep(0.1)
        await session.event_bus.dispatch(SetCheckedEvent(node=r2, checked=True))
        await asyncio.sleep(0.1)

        cdp = await session.get_or_create_cdp_session()
        res = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "window.getDom()", "returnByValue": True}, session_id=cdp.session_id
        )
        dom = (res.get("result") or {}).get("value") or {}
        assert dom.get('r1') is False and dom.get('r2') is True

        # Shadow group: sr1 then sr2
        sr1 = await session.build_node_from_selector('#shadow-host>>>#sr1')
        sr2 = await session.build_node_from_selector('#shadow-host>>>#sr2')
        assert sr1 and sr2
        await session.event_bus.dispatch(SetCheckedEvent(node=sr1, checked=True))
        await asyncio.sleep(0.1)
        await session.event_bus.dispatch(SetCheckedEvent(node=sr2, checked=True))
        await asyncio.sleep(0.1)

        res = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "window.getShadow()", "returnByValue": True}, session_id=cdp.session_id
        )
        sh = (res.get("result") or {}).get("value") or {}
        assert sh.get('sr1') is False and sh.get('sr2') is True

        # Iframe group: ir1 then ir2
        ir1 = await session.build_node_from_selector('iframe#child>>>#ir1')
        ir2 = await session.build_node_from_selector('iframe#child>>>#ir2')
        assert ir1 and ir2
        await session.event_bus.dispatch(SetCheckedEvent(node=ir1, checked=True))
        await asyncio.sleep(0.1)
        await session.event_bus.dispatch(SetCheckedEvent(node=ir2, checked=True))
        await asyncio.sleep(0.1)

        res = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "window.getIframe()", "returnByValue": True}, session_id=cdp.session_id
        )
        ifr = (res.get("result") or {}).get("value") or {}
        assert ifr.get('ir1') is False and ifr.get('ir2') is True
    finally:
        await session.kill()


