import os
import asyncio

import pytest

from browser_use.browser import BrowserProfile, BrowserSession
from browser_use.browser.events import NavigateToUrlEvent, ClickElementEvent


pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


TEST_HTML = """
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Occlusion Cross Contexts</title>
    <style>
      body { margin:0; height: 2000px; }
      #cover { position:absolute; top:0; left:0; right:0; height:160px; background:rgba(0,0,0,0.25); z-index:9999; }
      #sHost { position:absolute; top:120px; left:40px; }
      #frame { position:absolute; top:120px; left:260px; width:320px; height:200px; border:1px solid #ccc; }
      #btn { position:absolute; top:120px; left:40px; width:160px; height:50px; }
    </style>
  </head>
  <body>
    <button id="btn" onclick="document.getElementById('out').textContent='clicked-dom'">DOM-Click</button>
    <div id="sHost"></div>
    <iframe id="frame" srcdoc="<!doctype html><html><body style='margin:0'>
      <button id='ibtn' style='position:absolute; top:0; left:0; width:150px; height:50px;' onclick='document.getElementById(\"iout\").textContent=\"clicked-iframe\"'>I-Click</button>
      <div id='iout'></div>
    </body></html>"></iframe>
    <div id="cover"></div>
    <div id="out"></div>

    <script>
      const host = document.getElementById('sHost');
      const sr = host.attachShadow({mode:'open'});
      sr.innerHTML = `
        <button id="sbtn" style="position:absolute; top:0; left:0; width:150px; height:50px;"
          onclick="this.getRootNode().host.parentElement.querySelector('#sout').textContent='clicked-shadow'">S-Click</button>
      `;
    </script>
    <div id="sout"></div>
  </body>
  </html>
"""


@pytest.mark.parametrize("headless", [True, False])
async def test_occlusion_cross_contexts(tmp_path, headless):
    chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    assert os.path.exists(chrome_path), "Google Chrome not found at expected path"

    html_path = tmp_path / "occ_cross.html"
    html_path.write_text(TEST_HTML, encoding="utf-8")

    profile = BrowserProfile(headless=headless, enable_default_extensions=False, executable_path=chrome_path)
    session = BrowserSession(browser_profile=profile)
    await session.start()
    try:
        await session.event_bus.dispatch(NavigateToUrlEvent(url=f"file://{html_path}"))
        await asyncio.sleep(1.5)

        # DOM occluded
        n_dom = await session.build_node_from_selector('#btn')
        assert n_dom is not None
        await session.event_bus.dispatch(ClickElementEvent(node=n_dom))
        await asyncio.sleep(0.2)

        # Shadow occluded
        n_sha = await session.build_node_from_selector('#sHost>>>#sbtn')
        assert n_sha is not None
        await session.event_bus.dispatch(ClickElementEvent(node=n_sha))
        await asyncio.sleep(0.2)

        # Iframe occluded
        n_ifr = await session.build_node_from_selector('iframe#frame>>>#ibtn')
        assert n_ifr is not None
        await session.event_bus.dispatch(ClickElementEvent(node=n_ifr))
        await asyncio.sleep(1.0)

        cdp = await session.get_or_create_cdp_session()
        # DOM
        res = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "document.getElementById('out').textContent", "returnByValue": True}, session_id=cdp.session_id
        )
        assert (res.get("result") or {}).get("value") == "clicked-dom"
        # Shadow
        res = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "document.getElementById('sout').textContent", "returnByValue": True}, session_id=cdp.session_id
        )
        assert (res.get("result") or {}).get("value") == "clicked-shadow"
        # Iframe (poll for contentDocument + iout availability)
        iframe_text = None
        for _ in range(50):  # up to ~5s
            res = await cdp.cdp_client.send.Runtime.evaluate(
                params={
                    "expression": "(() => { const f = document.getElementById('frame'); if (!f || !f.contentDocument) return null; const d = f.contentDocument.getElementById('iout'); return d ? d.textContent : null; })()",
                    "returnByValue": True,
                },
                session_id=cdp.session_id,
            )
            iframe_text = (res.get("result") or {}).get("value")
            if iframe_text:
                break
            await asyncio.sleep(0.1)
        assert iframe_text == "clicked-iframe"
    finally:
        # Leave the window visible a moment before teardown in headed runs
        if not headless:
            await asyncio.sleep(1.5)
        await session.kill()


