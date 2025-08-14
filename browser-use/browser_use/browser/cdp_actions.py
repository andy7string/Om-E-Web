from __future__ import annotations

import asyncio
from typing import Any

from browser_use.browser.session import BrowserSession


class ChromeActions:
	"""
	Minimal actions helper backed by the active BrowserSession's CDP client.
	Implements selector-based resolution and waiting used by integration tests.
	"""

	def __init__(self, session: BrowserSession):
		self._session = session

	async def resolve_target(self, selector: str) -> dict[str, Any]:
		cdp = await self._session.get_or_create_cdp_session()
		# Ensure DOM is enabled
		await cdp.cdp_client.send.DOM.enable(session_id=cdp.session_id)
		doc = await cdp.cdp_client.send.DOM.getDocument(
			params={"depth": -1, "pierce": True}, session_id=cdp.session_id
		)
		qs = await cdp.cdp_client.send.DOM.querySelector(
			params={"nodeId": doc["root"]["nodeId"], "selector": selector}, session_id=cdp.session_id
		)
		if qs.get("nodeId"):
			return {"status": "success", "nodeId": qs["nodeId"]}
		return {"status": "error", "message": f"Selector not found: {selector}"}

	async def wait_for_selector(self, selector: str, state: str = "visible", timeout_ms: int = 5000) -> dict[str, Any]:
		deadline = asyncio.get_event_loop().time() + max(0, timeout_ms) / 1000.0
		cdp = await self._session.get_or_create_cdp_session()
		await cdp.cdp_client.send.DOM.enable(session_id=cdp.session_id)
		while asyncio.get_event_loop().time() < deadline:
			doc = await cdp.cdp_client.send.DOM.getDocument(
				params={"depth": -1, "pierce": True}, session_id=cdp.session_id
			)
			qs = await cdp.cdp_client.send.DOM.querySelector(
				params={"nodeId": doc["root"]["nodeId"], "selector": selector}, session_id=cdp.session_id
			)
			node_id = qs.get("nodeId")
			if not node_id:
				await asyncio.sleep(0.1)
				continue

			if state in ("attached", "present"):
				return {"status": "success", "nodeId": node_id}

			# For visibility/enabled, resolve and evaluate via JS
			try:
				desc = await cdp.cdp_client.send.DOM.describeNode(params={"nodeId": node_id}, session_id=cdp.session_id)
				backend_id = (desc.get("node") or {}).get("backendNodeId")
				resolved = await cdp.cdp_client.send.DOM.resolveNode(
					params={"backendNodeId": backend_id}, session_id=cdp.session_id
				)
				object_id = (resolved.get("object") or {}).get("objectId")
				if not object_id:
					await asyncio.sleep(0.1)
					continue

				if state == "visible":
					eval_res = await cdp.cdp_client.send.Runtime.callFunctionOn(
						params={
							"functionDeclaration": """
							function(){
							  const r = this.getBoundingClientRect();
							  const style = window.getComputedStyle(this);
							  return (r.width>0 && r.height>0 && style.visibility!=='hidden' && style.display!=='none' && style.opacity!=='0');
							}
							""",
							"objectId": object_id,
							"returnByValue": True,
						},
						session_id=cdp.session_id,
					)
					if (eval_res.get("result") or {}).get("value") is True:
						return {"status": "success", "nodeId": node_id}

				elif state == "enabled":
					eval_res = await cdp.cdp_client.send.Runtime.callFunctionOn(
						params={
							"functionDeclaration": "function(){ return !(this.disabled || this.getAttribute('aria-disabled')==='true'); }",
							"objectId": object_id,
							"returnByValue": True,
						},
						session_id=cdp.session_id,
					)
					if (eval_res.get("result") or {}).get("value") is True:
						return {"status": "success", "nodeId": node_id}
			except Exception:
				pass

			await asyncio.sleep(0.1)

		return {"status": "timeout", "message": f"Timed out waiting for {selector} to be {state}"}


