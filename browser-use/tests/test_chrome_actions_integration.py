import asyncio
import os

import pytest

from browser_use.browser import BrowserProfile, BrowserSession
from browser_use.browser.cdp_actions import ChromeActions
from browser_use.browser.events import NavigateToUrlEvent, ClickElementEvent, TypeTextEvent
from browser_use.dom.views import EnhancedDOMTreeNode, NodeType


pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def build_node_from_selector(session: BrowserSession, selector: str) -> EnhancedDOMTreeNode:
	cdp = await session.get_or_create_cdp_session()
	# Always get fresh nodeId from current document tree
	doc = await cdp.cdp_client.send.DOM.getDocument(params={"depth": -1, "pierce": True}, session_id=cdp.session_id)
	qs = await cdp.cdp_client.send.DOM.querySelector(
		params={"nodeId": doc["root"]["nodeId"], "selector": selector}, session_id=cdp.session_id
	)
	assert qs.get("nodeId"), f"Selector not found: {selector}"
	desc = await cdp.cdp_client.send.DOM.describeNode(params={"nodeId": qs["nodeId"]}, session_id=cdp.session_id)
	n = desc.get("node", {})
	backend_id = n.get("backendNodeId")
	node_name = (n.get("nodeName") or "").lower() or "div"
	node_value = (n.get("nodeValue") or "")
	attrs_list = n.get("attributes", [])
	attrs = {attrs_list[i]: attrs_list[i + 1] for i in range(0, len(attrs_list), 2)} if attrs_list else {}
	return EnhancedDOMTreeNode(
		node_id=qs["nodeId"],
		backend_node_id=backend_id,
		node_type=NodeType.ELEMENT_NODE,
		node_name=node_name,
		node_value=node_value,
		attributes=attrs,
		is_scrollable=None,
		is_visible=None,
		absolute_position=None,
		session_id=cdp.session_id,
		target_id=cdp.target_id,
		frame_id=None,
		content_document=None,
		shadow_root_type=None,
		shadow_roots=None,
		parent_node=None,
		children_nodes=None,
		ax_node=None,
		snapshot_node=None,
	)


@pytest.mark.timeout(120)
async def test_chrome_actions_with_events_exact_typing():
	# Pre-conditions
	chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
	assert os.path.exists(chrome_path), "Google Chrome not found at expected path"

	profile = BrowserProfile(
		headless=False,
		enable_default_extensions=False,
		executable_path=chrome_path,
	)
	session = BrowserSession(browser_profile=profile)

	try:
		await session.start()

		page_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "pages", "form_elements.html"))
		file_url = f"file://{page_path}"
		evt = session.event_bus.dispatch(NavigateToUrlEvent(url=file_url))
		await evt
		await asyncio.sleep(0.5)

		# Attach simple listener to verify click
		cdp = await session.get_or_create_cdp_session()
		await cdp.cdp_client.send.Runtime.evaluate(
			params={
				"expression": """
				(function(){
				  const btn = document.getElementById('go');
				  if (btn && !btn.__hooked) {
				    btn.addEventListener('click', ()=>{
				      const s = document.getElementById('status');
				      if (s) s.textContent = 'Button clicked';
				    });
				    btn.__hooked = true;
				  }
				  return true;
				})();
				""",
				"returnByValue": True,
			},
			session_id=cdp.session_id,
		)

		actions = ChromeActions(session)

		# Resolve button
		res_btn = await actions.resolve_target("button")
		assert res_btn.get("status") == "success"

		# Wait visible
		wait_btn = await actions.wait_for_selector("button", state="visible", timeout_ms=5000)
		assert wait_btn.get("status") == "success"

		# Resolve input
		res_input = await actions.resolve_target("#name")
		assert res_input.get("status") == "success"

		# Wait enabled
		wait_input = await actions.wait_for_selector("#name", state="enabled", timeout_ms=3000)
		assert wait_input.get("status") == "success"

		# Build nodes for events
		name_node = await build_node_from_selector(session, "#name")
		go_node = await build_node_from_selector(session, "button")

		# Type exact value
		evt = session.event_bus.dispatch(TypeTextEvent(node=name_node, text="Test User", clear_existing=True))
		await evt
		val = await cdp.cdp_client.send.Runtime.evaluate(
			params={"expression": "document.getElementById('name')?.value", "returnByValue": True},
			session_id=cdp.session_id,
		)
		assert val.get("result", {}).get("value") == "Test User"

		# Click and verify
		evt = session.event_bus.dispatch(ClickElementEvent(node=go_node))
		await evt
		status = await cdp.cdp_client.send.Runtime.evaluate(
			params={"expression": "document.getElementById('status')?.textContent || ''", "returnByValue": True},
			session_id=cdp.session_id,
		)
		assert status.get("result", {}).get("value") == "Button clicked"

	finally:
		await session.stop()

import asyncio
import os

import pytest

from browser_use.browser import BrowserProfile, BrowserSession
from browser_use.browser.cdp_actions import ChromeActions
from browser_use.browser.events import NavigateToUrlEvent, ClickElementEvent, TypeTextEvent
from browser_use.dom.views import EnhancedDOMTreeNode, NodeType


pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def build_node_from_selector(session: BrowserSession, selector: str) -> EnhancedDOMTreeNode:
	cdp = await session.get_or_create_cdp_session()
	# Always get fresh nodeId from current document tree
	doc = await cdp.cdp_client.send.DOM.getDocument(params={"depth": -1, "pierce": True}, session_id=cdp.session_id)
	qs = await cdp.cdp_client.send.DOM.querySelector(
		params={"nodeId": doc["root"]["nodeId"], "selector": selector}, session_id=cdp.session_id
	)
	assert qs.get("nodeId"), f"Selector not found: {selector}"
	desc = await cdp.cdp_client.send.DOM.describeNode(params={"nodeId": qs["nodeId"]}, session_id=cdp.session_id)
	n = desc.get("node", {})
	backend_id = n.get("backendNodeId")
	node_name = (n.get("nodeName") or "").lower() or "div"
	node_value = (n.get("nodeValue") or "")
	attrs_list = n.get("attributes", [])
	attrs = {attrs_list[i]: attrs_list[i + 1] for i in range(0, len(attrs_list), 2)} if attrs_list else {}
	return EnhancedDOMTreeNode(
		node_id=qs["nodeId"],
		backend_node_id=backend_id,
		node_type=NodeType.ELEMENT_NODE,
		node_name=node_name,
		node_value=node_value,
		attributes=attrs,
		is_scrollable=None,
		is_visible=None,
		absolute_position=None,
		session_id=cdp.session_id,
		target_id=cdp.target_id,
		frame_id=None,
		content_document=None,
		shadow_root_type=None,
		shadow_roots=None,
		parent_node=None,
		children_nodes=None,
		ax_node=None,
		snapshot_node=None,
	)


@pytest.mark.timeout(120)
async def test_chrome_actions_with_events_exact_typing():
	# Pre-conditions
	chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
	assert os.path.exists(chrome_path), "Google Chrome not found at expected path"
	assert os.path.exists("test_chrome_cdp.html"), "test_chrome_cdp.html missing in browser-use/"

	profile = BrowserProfile(
		headless=False,
		enable_default_extensions=False,
		executable_path=chrome_path,
	)
	session = BrowserSession(browser_profile=profile)

	try:
		await session.start()

		file_url = f"file://{os.path.abspath('test_chrome_cdp.html')}"
		evt = session.event_bus.dispatch(NavigateToUrlEvent(url=file_url))
		await evt
		await asyncio.sleep(0.5)

		# Attach simple listener to verify click
		cdp = await session.get_or_create_cdp_session()
		await cdp.cdp_client.send.Runtime.evaluate(
			params={
				"expression": """
				(function(){
				  const btn = document.getElementById('go');
				  if (btn && !btn.__hooked) {
				    btn.addEventListener('click', ()=>{
				      const s = document.getElementById('status');
				      if (s) s.textContent = 'Button clicked';
				    });
				    btn.__hooked = true;
				  }
				  return true;
				})();
				""",
				"returnByValue": True,
			},
			session_id=cdp.session_id,
		)

		actions = ChromeActions(session)

		# Resolve button
		res_btn = await actions.resolve_target("button")
		assert res_btn.get("status") == "success"

		# Wait visible
		wait_btn = await actions.wait_for_selector("button", state="visible", timeout_ms=5000)
		assert wait_btn.get("status") == "success"

		# Resolve input
		res_input = await actions.resolve_target("#name")
		assert res_input.get("status") == "success"

		# Wait enabled
		wait_input = await actions.wait_for_selector("#name", state="enabled", timeout_ms=3000)
		assert wait_input.get("status") == "success"

		# Build nodes for events
		name_node = await build_node_from_selector(session, "#name")
		go_node = await build_node_from_selector(session, "button")

		# Type exact value
		evt = session.event_bus.dispatch(TypeTextEvent(node=name_node, text="Test User", clear_existing=True))
		await evt
		val = await cdp.cdp_client.send.Runtime.evaluate(
			params={"expression": "document.getElementById('name')?.value", "returnByValue": True},
			session_id=cdp.session_id,
		)
		assert val.get("result", {}).get("value") == "Test User"

		# Click and verify
		evt = session.event_bus.dispatch(ClickElementEvent(node=go_node))
		await evt
		status = await cdp.cdp_client.send.Runtime.evaluate(
			params={"expression": "document.getElementById('status')?.textContent || ''", "returnByValue": True},
			session_id=cdp.session_id,
		)
		assert status.get("result", {}).get("value") == "Button clicked"

	finally:
		await session.stop()


