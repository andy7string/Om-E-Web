import os
import asyncio

import pytest

from browser_use.browser import BrowserProfile, BrowserSession
from browser_use.browser.events import (
    NavigateToUrlEvent,
    SelectOptionEvent,
    SetCheckedEvent,
)


pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


TEST_HTML = """
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Form Controls</title>
    <style>
      body { height: 3000px; }
      .spacer { height: 1200px; }
    </style>
  </head>
  <body>
    <div class="spacer"></div>
    <select id="sel">
      <option value="a">Alpha</option>
      <option value="b">Beta</option>
      <option value="c">Gamma</option>
    </select>
    <input id="chk" type="checkbox" />
    <input id="r1" type="radio" name="grp" />
    <input id="r2" type="radio" name="grp" />

    <div id="shadow-host"></div>
    <script>
      const host = document.getElementById('shadow-host');
      const sr = host.attachShadow({mode:'open'});
      sr.innerHTML = `
        <div class="spacer"></div>
        <select id="s">
          <option value="x">Ex</option>
          <option value="y">Why</option>
        </select>
        <input id="schk" type="checkbox" />
        <input id="sr1" type="radio" name="sgrp" />
        <input id="sr2" type="radio" name="sgrp" />
      `;
    </script>

    <iframe id="child" srcdoc='<!doctype html><html><body>
      <div style="height: 1200px;"></div>
      <select id="is">
        <option value="m">Em</option>
        <option value="n">En</option>
      </select>
      <input id="ichk" type="checkbox" />
      <input id="ir1" type="radio" name="igrp" />
      <input id="ir2" type="radio" name="igrp" />
    </body></html>'></iframe>

    <script>
      window.getValues = () => ({
        sel: document.getElementById('sel').value,
        chk: document.getElementById('chk').checked,
        r1: document.getElementById('r1').checked,
        r2: document.getElementById('r2').checked,
        s_sel: document.getElementById('shadow-host').shadowRoot.getElementById('s').value,
        s_chk: document.getElementById('shadow-host').shadowRoot.getElementById('schk').checked,
        s_r1: document.getElementById('shadow-host').shadowRoot.getElementById('sr1').checked,
        s_r2: document.getElementById('shadow-host').shadowRoot.getElementById('sr2').checked,
        i_sel: (function(){ const f=document.getElementById('child'); return f.contentDocument.getElementById('is').value; })(),
        i_chk: (function(){ const f=document.getElementById('child'); return f.contentDocument.getElementById('ichk').checked; })(),
        i_r1: (function(){ const f=document.getElementById('child'); return f.contentDocument.getElementById('ir1').checked; })(),
        i_r2: (function(){ const f=document.getElementById('child'); return f.contentDocument.getElementById('ir2').checked; })(),
      });
    </script>
  </body>
  </html>
"""


@pytest.mark.parametrize("headless", [True, False])
async def test_select_and_checked_controls(tmp_path, headless):
    chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    assert os.path.exists(chrome_path), "Google Chrome not found at expected path"

    html_path = tmp_path / "form_controls.html"
    html_path.write_text(TEST_HTML, encoding="utf-8")

    profile = BrowserProfile(headless=headless, enable_default_extensions=False, executable_path=chrome_path)
    session = BrowserSession(browser_profile=profile)
    await session.start()
    try:
        await session.event_bus.dispatch(NavigateToUrlEvent(url=f"file://{html_path}"))
        await asyncio.sleep(0.5)

        # Select by value (page)
        sel_node = await session.build_node_from_selector('#sel')
        assert sel_node is not None
        await session.event_bus.dispatch(SelectOptionEvent(node=sel_node, value='b'))
        await asyncio.sleep(0.2)

        # Checkbox true (page)
        chk_node = await session.build_node_from_selector('#chk')
        assert chk_node is not None
        await session.event_bus.dispatch(SetCheckedEvent(node=chk_node, checked=True))
        await asyncio.sleep(0.2)

        # Radio select r2 (page)
        r2_node = await session.build_node_from_selector('#r2')
        assert r2_node is not None
        await session.event_bus.dispatch(SetCheckedEvent(node=r2_node, checked=True))
        await asyncio.sleep(0.2)

        # Shadow: select by label
        ssel_node = await session.build_node_from_selector('#shadow-host>>>#s')
        assert ssel_node is not None
        await session.event_bus.dispatch(SelectOptionEvent(node=ssel_node, label='Why'))
        await asyncio.sleep(0.2)

        # Shadow: checkbox false
        schk_node = await session.build_node_from_selector('#shadow-host>>>#schk')
        assert schk_node is not None
        await session.event_bus.dispatch(SetCheckedEvent(node=schk_node, checked=False))
        await asyncio.sleep(0.2)

        # Shadow: radio sr1 true
        sr1_node = await session.build_node_from_selector('#shadow-host>>>#sr1')
        assert sr1_node is not None
        await session.event_bus.dispatch(SetCheckedEvent(node=sr1_node, checked=True))
        await asyncio.sleep(0.2)

        # Iframe: select by index
        isel_node = await session.build_node_from_selector('iframe#child>>>#is')
        assert isel_node is not None
        await session.event_bus.dispatch(SelectOptionEvent(node=isel_node, index=1))
        await asyncio.sleep(0.2)

        # Iframe: checkbox true
        ichk_node = await session.build_node_from_selector('iframe#child>>>#ichk')
        assert ichk_node is not None
        await session.event_bus.dispatch(SetCheckedEvent(node=ichk_node, checked=True))
        await asyncio.sleep(0.2)

        # Iframe: radio ir2 true
        ir2_node = await session.build_node_from_selector('iframe#child>>>#ir2')
        assert ir2_node is not None
        await session.event_bus.dispatch(SetCheckedEvent(node=ir2_node, checked=True))
        await asyncio.sleep(0.2)

        # Verify via JS
        cdp = await session.get_or_create_cdp_session()
        res = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "window.getValues()", "returnByValue": True}, session_id=cdp.session_id
        )
        vals = (res.get("result") or {}).get("value") or {}
        assert vals.get('sel') == 'b'
        assert vals.get('chk') is True
        assert vals.get('r2') is True and vals.get('r1') is False
        assert vals.get('s_sel') == 'y'
        assert vals.get('s_chk') is False
        assert vals.get('s_r1') is True and vals.get('s_r2') is False
        assert vals.get('i_sel') in ('n', 1, '1')  # index=1 selects second option
        assert vals.get('i_chk') is True
        assert vals.get('i_r2') is True and vals.get('i_r1') is False
    finally:
        await session.kill()


