import os
import asyncio

import pytest

from browser_use.browser import BrowserProfile, BrowserSession
from browser_use.browser.events import NavigateToUrlEvent, SetCheckedEvent


pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


TEST_HTML = """
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Label Toggle</title>
    <style>
      .hidden { display:none; }
      .overlay { position:absolute; top:0; left:0; right:0; height:60px; background:rgba(0,0,0,0.1); }
    </style>
  </head>
  <body>
    <h1>Label Toggle</h1>
    <div id="status"></div>

    <!-- DOM: hidden checkbox with visible label -->
    <input type="checkbox" id="domchk" class="hidden">
    <label for="domchk" id="domlbl">Enable</label>

    <div id="shadow-host"></div>
    <script>
      const host = document.getElementById('shadow-host');
      const sr = host.attachShadow({mode:'open'});
      sr.innerHTML = `
        <input type="checkbox" id="schk" style="display:none">
        <label for="schk" id="slbl">S-Enable</label>
      `;
    </script>

    <iframe id="child" srcdoc='<!doctype html><html><body>
      <input type="checkbox" id="ichk" style="display:none">
      <label for="ichk" id="ilbl">I-Enable</label>
    </body></html>'></iframe>

    <script>
      window.getVals = () => ({
        d: document.getElementById('domchk').checked,
        s: document.getElementById('shadow-host').shadowRoot.getElementById('schk').checked,
        i: (function(){ const f=document.getElementById('child'); return f.contentDocument.getElementById('ichk').checked; })(),
      });
    </script>
  </body>
  </html>
"""


@pytest.mark.parametrize("headless", [True, False])
async def test_label_based_toggle_dom_shadow_iframe(tmp_path, headless):
    chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    assert os.path.exists(chrome_path), "Google Chrome not found at expected path"

    html_path = tmp_path / "label_toggle.html"
    html_path.write_text(TEST_HTML, encoding="utf-8")

    profile = BrowserProfile(headless=headless, enable_default_extensions=False, executable_path=chrome_path)
    session = BrowserSession(browser_profile=profile)
    await session.start()
    try:
        await session.event_bus.dispatch(NavigateToUrlEvent(url=f"file://{html_path}"))
        await asyncio.sleep(0.4)

        # DOM
        dom_node = await session.build_node_from_selector('#domchk')
        assert dom_node is not None
        await session.event_bus.dispatch(SetCheckedEvent(node=dom_node, checked=True))
        await asyncio.sleep(0.2)

        # Shadow
        s_node = await session.build_node_from_selector('#shadow-host>>>#schk')
        assert s_node is not None
        await session.event_bus.dispatch(SetCheckedEvent(node=s_node, checked=True))
        await asyncio.sleep(0.2)

        # Iframe
        i_node = await session.build_node_from_selector('iframe#child>>>#ichk')
        assert i_node is not None
        await session.event_bus.dispatch(SetCheckedEvent(node=i_node, checked=True))
        await asyncio.sleep(0.2)

        cdp = await session.get_or_create_cdp_session()
        res = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "window.getVals()", "returnByValue": True}, session_id=cdp.session_id
        )
        vals = (res.get("result") or {}).get("value") or {}
        assert vals.get('d') is True
        assert vals.get('s') is True
        assert vals.get('i') is True
    finally:
        await session.kill()


@pytest.mark.xfail(reason="Occlusion-aware fallback not yet implemented; pending feature.")
@pytest.mark.parametrize("headless", [True])
async def test_occlusion_covered_click(tmp_path, headless):
    chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    assert os.path.exists(chrome_path), "Google Chrome not found at expected path"

    html = """
    <!doctype html><html><body style="margin:0">
    <button id="btn" style="position:absolute; top:40px; left:20px; width:150px; height:50px;" onclick="document.getElementById('out').textContent='clicked';">ClickMe</button>
    <div id="cover" style="position:absolute; top:0; left:0; right:0; height:80px; background:rgba(0,0,0,0.2);"></div>
    <div id="out"></div>
    </body></html>
    """
    html_path = tmp_path / "occlusion.html"
    html_path.write_text(html, encoding="utf-8")

    profile = BrowserProfile(headless=headless, enable_default_extensions=False, executable_path=chrome_path)
    session = BrowserSession(browser_profile=profile)
    await session.start()
    try:
        await session.event_bus.dispatch(NavigateToUrlEvent(url=f"file://{html_path}"))
        await asyncio.sleep(0.4)
        node = await session.build_node_from_selector('#btn')
        assert node is not None
        from browser_use.browser.events import ClickElementEvent
        await session.event_bus.dispatch(ClickElementEvent(node=node))
        await asyncio.sleep(0.2)

        cdp = await session.get_or_create_cdp_session()
        res = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "document.getElementById('out').textContent", "returnByValue": True}, session_id=cdp.session_id
        )
        assert (res.get("result") or {}).get("value") == "clicked"
    finally:
        await session.kill()


