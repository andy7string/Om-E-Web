import os

import pytest

from browser_use.browser import BrowserProfile, BrowserSession
from browser_use.browser.cdp_actions import ChromeActions
from browser_use.browser.events import NavigateToUrlEvent


pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


TEST_HTML = """
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Shadow Waits</title></head>
  <body>
    <div id="host"></div>
    <script>
      const host = document.getElementById('host');
      const sr = host.attachShadow({mode:'open'});
      sr.innerHTML = `<style>#sbtn{display:none;}</style><button id="sbtn">Go</button>`;
      setTimeout(()=>{ sr.getElementById('sbtn').style.display = 'block'; }, 300);
    </script>
  </body>
  </html>
"""


async def test_waits_shadow_visible(tmp_path):
    chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    assert os.path.exists(chrome_path), "Google Chrome not found at expected path"

    html_path = tmp_path / "shadow_waits.html"
    html_path.write_text(TEST_HTML, encoding="utf-8")

    profile = BrowserProfile(headless=False, enable_default_extensions=False, executable_path=chrome_path)
    session = BrowserSession(browser_profile=profile)
    await session.start()
    try:
        await session.event_bus.dispatch(NavigateToUrlEvent(url=f"file://{html_path}"))
        actions = ChromeActions(session)

        # Wait for shadow button to become visible via >>> piercing
        sel = "#host>>>#sbtn"
        res = await actions.wait_for_selector(sel, state="visible", timeout_ms=5000)
        assert res.get("status") == "success"
    finally:
        await session.kill()


