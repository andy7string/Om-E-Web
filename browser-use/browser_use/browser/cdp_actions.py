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

	def _to_playwright_shadow_selector(self, selector: str) -> str:
		"""Convert '>>>' shadow selector to a Playwright-friendly selector.

		Strategy: for shadow-piercing, prefer :light(last_segment) which pierces open shadow roots.
		Keep original selector if no '>>>'.
		"""
		if '>>>' in selector:
			last = selector.split('>>>')[-1].strip()
			return f":light({last})"
		return selector

	async def resolve_target(self, selector: str) -> dict[str, Any]:
		cdp = await self._session.get_or_create_cdp_session()
		await cdp.cdp_client.send.DOM.enable(session_id=cdp.session_id)

		# Shadow-piercing support with '>>>' using JS and DOM.requestNode
		if '>>>' in selector:
			try:
				# Get document object and call a function that traverses shadow roots
				doc_eval = await cdp.cdp_client.send.Runtime.evaluate(
					params={"expression": "document", "returnByValue": False}, session_id=cdp.session_id
				)
				doc_obj_id = (doc_eval.get("result") or {}).get("objectId")
				if not doc_obj_id:
					return {"status": "error", "message": "Failed to resolve document for shadow query"}
				res = await cdp.cdp_client.send.Runtime.callFunctionOn(
					params={
						"functionDeclaration": """
						function(sel){
						  const parts = sel.split('>>>').map(s => s.trim()).filter(Boolean);
						  let root = this;
						  let el = null;
						  for (const part of parts) {
						    el = root.querySelector(part);
						    if (!el) return null;
						    if (el.shadowRoot) {
						      root = el.shadowRoot;
						    } else if (el.tagName && el.tagName.toLowerCase() === 'iframe' && el.contentDocument) {
						      root = el.contentDocument;
						    } else {
						      root = el;
						    }
						  }
						  return el;
						}
						""",
						"objectId": doc_obj_id,
						"arguments": [{"value": selector}],
						"returnByValue": False
					},
					session_id=cdp.session_id,
				)
				obj = (res.get("result") or {})
				object_id = obj.get("objectId")
				if object_id:
					req = await cdp.cdp_client.send.DOM.requestNode(
						params={"objectId": object_id}, session_id=cdp.session_id
					)
					node_id = req.get("nodeId")
					if node_id:
						return {"status": "success", "nodeId": node_id}
			except Exception:
				pass

		# Fallback to normal querySelector with pierce
		doc = await cdp.cdp_client.send.DOM.getDocument(
			params={"depth": -1, "pierce": True}, session_id=cdp.session_id
		)
		qs = await cdp.cdp_client.send.DOM.querySelector(
			params={"nodeId": doc["root"]["nodeId"], "selector": selector}, session_id=cdp.session_id
		)
		if qs.get("nodeId"):
			return {"status": "success", "nodeId": qs["nodeId"]}

		# Last fallback: DOM.performSearch (includes UA shadow)
		try:
			search = await cdp.cdp_client.send.DOM.performSearch(
				params={"query": selector, "includeUserAgentShadowDOM": True}, session_id=cdp.session_id
			)
			if search.get("resultCount", 0) > 0:
				res_nodes = await cdp.cdp_client.send.DOM.getSearchResults(
					params={"searchId": search["searchId"], "fromIndex": 0, "toIndex": 1}, session_id=cdp.session_id
				)
				nodes = res_nodes.get("nodeIds") or []
				if nodes:
					return {"status": "success", "nodeId": nodes[0]}
		except Exception:
			pass

		return {"status": "error", "message": f"Selector not found: {selector}"}

	async def wait_for_selector(self, selector: str, state: str = "visible", timeout_ms: int = 5000) -> dict[str, Any]:
		deadline = asyncio.get_event_loop().time() + max(0, timeout_ms) / 1000.0

		# Playwright-first: robust for visibility/enabled and shadow DOM
		try:
			page = await self._session.get_or_create_playwright_page()
			remaining_ms = max(0, int((deadline - asyncio.get_event_loop().time()) * 1000)) or timeout_ms
			if '>>>' in selector:
				# Prefer native Playwright support for >>>
				locator = page.locator(selector)
				try:
					if state in ("attached", "present"):
						await locator.wait_for(state="attached", timeout=remaining_ms)
					elif state == "visible":
						await locator.wait_for(state="visible", timeout=remaining_ms)
					elif state == "enabled":
						await page.wait_for_function(
							"(sel) => { const parts = sel.split('>>>').map(s=>s.trim()).filter(Boolean); let root=document, el=null; for (const p of parts){ el=root.querySelector(p); if(!el) return false; root = el.shadowRoot ? el.shadowRoot : (el.tagName && el.tagName.toLowerCase()==='iframe' && el.contentDocument ? el.contentDocument : el);} return el && !(el.disabled || el.getAttribute('aria-disabled')==='true'); }",
							selector,
							timeout=remaining_ms,
						)
					else:
						await page.wait_for_function(
							"(sel) => { const parts = sel.split('>>>').map(s=>s.trim()).filter(Boolean); let root=document, el=null; for (const p of parts){ el=root.querySelector(p); if(!el) return false; root = el.shadowRoot ? el.shadowRoot : (el.tagName && el.tagName.toLowerCase()==='iframe' && el.contentDocument ? el.contentDocument : el);} const r=el.getBoundingClientRect(); const cs=getComputedStyle(el); return r.width>0 && r.height>0 && cs.visibility!=='hidden' && cs.display!=='none' && cs.opacity!=='0'; }",
							selector,
							timeout=remaining_ms,
						)
				except Exception:
					# fall through to mapping and/or CDP fallback
					pass

				# Best-effort: map found element to nodeId for downstream use
				try:
					cdp = await self._session.get_or_create_cdp_session()
					await cdp.cdp_client.send.DOM.enable(session_id=cdp.session_id)
					res_doc = await cdp.cdp_client.send.Runtime.evaluate(
						params={"expression": "document", "returnByValue": False}, session_id=cdp.session_id
					)
					doc_obj_id = (res_doc.get("result") or {}).get("objectId")
					if doc_obj_id:
						call = await cdp.cdp_client.send.Runtime.callFunctionOn(
							params={
								"functionDeclaration": "function(sel){ const parts=sel.split('>>>').map(s=>s.trim()).filter(Boolean); let root=this, el=null; for (const p of parts){ el=root.querySelector(p); if(!el) return null; root = el.shadowRoot ? el.shadowRoot : (el.tagName && el.tagName.toLowerCase()==='iframe' && el.contentDocument ? el.contentDocument : el);} return el; }",
								"objectId": doc_obj_id,
								"arguments": [{"value": selector}],
								"returnByValue": False,
							},
							session_id=cdp.session_id,
						)
						obj = (call.get("result") or {})
						object_id = obj.get("objectId")
						if object_id:
							try:
								desc_obj = await cdp.cdp_client.send.DOM.describeNode(params={"objectId": object_id}, session_id=cdp.session_id)
								node = (desc_obj.get("node") or {})
								nid = node.get("nodeId")
								if nid:
									return {"status": "success", "nodeId": nid}
							except Exception:
								pass
							req = await cdp.cdp_client.send.DOM.requestNode(
								params={"objectId": object_id}, session_id=cdp.session_id
							)
							nid2 = req.get("nodeId")
							if nid2:
								return {"status": "success", "nodeId": nid2}
				except Exception:
					pass
				return {"status": "success"}

			# Non-shadow selectors
			pw_selector = self._to_playwright_shadow_selector(selector)
			locator = page.locator(pw_selector)
			if state in ("attached", "present"):
				await locator.wait_for(state="attached", timeout=remaining_ms)
				# Optional nodeId mapping
				try:
					cdp = await self._session.get_or_create_cdp_session()
					doc = await cdp.cdp_client.send.DOM.getDocument(params={"depth": -1, "pierce": True}, session_id=cdp.session_id)
					qs = await cdp.cdp_client.send.DOM.querySelector(params={"nodeId": doc["root"]["nodeId"], "selector": selector}, session_id=cdp.session_id)
					nid = qs.get("nodeId")
					if nid:
						return {"status": "success", "nodeId": nid}
				except Exception:
					pass
				return {"status": "success"}
			if state == "visible":
				await locator.wait_for(state="visible", timeout=remaining_ms)
				try:
					cdp = await self._session.get_or_create_cdp_session()
					doc = await cdp.cdp_client.send.DOM.getDocument(params={"depth": -1, "pierce": True}, session_id=cdp.session_id)
					qs = await cdp.cdp_client.send.DOM.querySelector(params={"nodeId": doc["root"]["nodeId"], "selector": selector}, session_id=cdp.session_id)
					nid = qs.get("nodeId")
					if nid:
						return {"status": "success", "nodeId": nid}
				except Exception:
					pass
				return {"status": "success"}
			if state == "enabled":
				while asyncio.get_event_loop().time() < deadline:
					try:
						if await locator.is_enabled():
							return {"status": "success"}
					except Exception:
						pass
					await asyncio.sleep(0.05)
		except Exception:
			# Fall back to CDP-based waits
			pass

		# CDP fallback polling
		cdp = await self._session.get_or_create_cdp_session()
		await cdp.cdp_client.send.DOM.enable(session_id=cdp.session_id)
		while asyncio.get_event_loop().time() < deadline:
			# Resolve node id with shadow support if needed
			node_id: int | None = None
			if '>>>' in selector:
				try:
					res_doc = await cdp.cdp_client.send.Runtime.evaluate(params={"expression": "document", "returnByValue": False}, session_id=cdp.session_id)
					doc_obj_id = (res_doc.get("result") or {}).get("objectId")
					if doc_obj_id:
						call = await cdp.cdp_client.send.Runtime.callFunctionOn(
							params={
								"functionDeclaration": "function(sel){ const parts=sel.split('>>>').map(s=>s.trim()).filter(Boolean); let root=this, el=null; for (const p of parts){ el=root.querySelector(p); if(!el) return null; root = el.shadowRoot ? el.shadowRoot : (el.tagName && el.tagName.toLowerCase()==='iframe' && el.contentDocument ? el.contentDocument : el);} return el; }",
								"objectId": doc_obj_id,
								"arguments": [{"value": selector}],
								"returnByValue": False,
							},
							session_id=cdp.session_id,
						)
						obj = (call.get("result") or {})
						object_id = obj.get("objectId")
						if object_id:
							try:
								desc_obj = await cdp.cdp_client.send.DOM.describeNode(params={"objectId": object_id}, session_id=cdp.session_id)
								node = (desc_obj.get("node") or {})
								node_id = node.get("nodeId")
							except Exception:
								node_id = None
							if not node_id:
								req = await cdp.cdp_client.send.DOM.requestNode(params={"objectId": object_id}, session_id=cdp.session_id)
								node_id = req.get("nodeId")
				except Exception:
					pass
			if node_id is None:
				doc = await cdp.cdp_client.send.DOM.getDocument(params={"depth": -1, "pierce": True}, session_id=cdp.session_id)
				qs = await cdp.cdp_client.send.DOM.querySelector(params={"nodeId": doc["root"]["nodeId"], "selector": selector}, session_id=cdp.session_id)
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
				resolved = await cdp.cdp_client.send.DOM.resolveNode(params={"backendNodeId": backend_id}, session_id=cdp.session_id)
				object_id = (resolved.get("object") or {}).get("objectId")
				if not object_id:
					await asyncio.sleep(0.1)
					continue
				if state == "visible":
					eval_res = await cdp.cdp_client.send.Runtime.callFunctionOn(
						params={
							"functionDeclaration": "function(){ const r=this.getBoundingClientRect(); const s=getComputedStyle(this); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&s.opacity!=='0'; }",
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


