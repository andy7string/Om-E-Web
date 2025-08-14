import os
import asyncio

import pytest

from browser_use.browser import BrowserProfile, BrowserSession
from browser_use.browser.events import NavigateToUrlEvent, ClickElementEvent, TypeTextEvent


pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


TEST_HTML = """
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Cross Contexts</title></head>
  <body>
    <h1>Contexts</h1>
    <div id="status"></div>

    <div id="shadow-host"></div>
    <script>
      const host = document.getElementById('shadow-host');
      const sr = host.attachShadow({mode:'open'});
      sr.innerHTML = `<input id="sinput" type="text"><button id="sbtn">S-Click</button>`;
      sr.getElementById('sbtn').addEventListener('click', () => {
        document.getElementById('status').textContent = 'shadow clicked';
      });
    </script>

    <iframe id="child" srcdoc='<!doctype html><html><body>\
      <input id="cinput" type="text"><button id="cbtn">C-Click</button>\
      <div id="cstatus"></div>\
      <script>\
        document.getElementById("cbtn").addEventListener("click", ()=>{\
          document.getElementById("cstatus").textContent = "iframe clicked";\
        });\
      </script>\
    </body></html>'></iframe>

    <script>
      // expose helpers
      window.getShadowStatus = () => document.getElementById('status').textContent;
      window.getIframeStatus = () => {
        const f = document.getElementById('child');
        return f.contentDocument.getElementById('cstatus').textContent;
      };
    </script>
  </body>
</html>
"""


@pytest.mark.parametrize("headless", [True, False])
async def test_shadow_dom_and_iframe_click_and_type(tmp_path, headless):
    chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    assert os.path.exists(chrome_path), "Google Chrome not found at expected path"

    # write test file
    html_path = tmp_path / "cross_contexts.html"
    html_path.write_text(TEST_HTML, encoding="utf-8")

    profile = BrowserProfile(headless=headless, enable_default_extensions=False, executable_path=chrome_path)
    session = BrowserSession(browser_profile=profile)
    await session.start()
    try:
        await session.event_bus.dispatch(
            NavigateToUrlEvent(url=f"file://{html_path}")
        )
        await asyncio.sleep(0.5)

        # Shadow DOM: Playwright-first interactions via selector-derived node
        shadow_input = await session.build_node_from_selector('#shadow-host>>>#sinput')
        assert shadow_input is not None
        await session.event_bus.dispatch(TypeTextEvent(node=shadow_input, text="Shadow Text"))
        await asyncio.sleep(0.3)

        shadow_btn = await session.build_node_from_selector('#shadow-host>>>#sbtn')
        assert shadow_btn is not None
        await session.event_bus.dispatch(ClickElementEvent(node=shadow_btn))
        await asyncio.sleep(0.3)

        # Verify shadow status
        cdp = await session.get_or_create_cdp_session()
        r1 = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "window.getShadowStatus()", "returnByValue": True}, session_id=cdp.session_id
        )
        assert (r1.get("result") or {}).get("value") == "shadow clicked"

        # Iframe: query inside iframe document
        # Iframe: use node helper and event dispatch (PW-first type/click inside handler where possible)
        iframe_input = await session.build_node_from_selector('iframe#child')
        assert iframe_input is not None
        # Use shadow-piercing style for iframe content traversal
        inner_input = await session.build_node_from_selector('iframe#child>>>#cinput')
        assert inner_input is not None
        await session.event_bus.dispatch(TypeTextEvent(node=inner_input, text="Iframe Text"))
        await asyncio.sleep(0.3)

        inner_btn = await session.build_node_from_selector('iframe#child>>>#cbtn')
        assert inner_btn is not None
        await session.event_bus.dispatch(ClickElementEvent(node=inner_btn))
        await asyncio.sleep(0.3)

        # Verify iframe status
        r2 = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "window.getIframeStatus()", "returnByValue": True}, session_id=cdp.session_id
        )
        assert (r2.get("result") or {}).get("value") == "iframe clicked"
    finally:
        await session.kill()


