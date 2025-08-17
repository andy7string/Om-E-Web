#!/usr/bin/env python3
import asyncio
import websockets
import json

async def test():
    uri = 'ws://127.0.0.1:17892'
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({'id': 'test', 'command': 'generateFocusedSiteMap'}))
        response = await ws.recv()
        result = json.loads(response)
        
        if result.get('ok'):
            data = result.get('result', {})
            print('✅ Focused Site Map Generated!')
            print(f'📊 Total Elements: {data.get("statistics", {}).get("totalElements", 0)}')
            
            categories = data.get('statistics', {}).get('categories', {})
            print(f'🏆 Headings: {categories.get("headings", 0)}')
            print(f'🏠 Navigation: {categories.get("navigation", 0)}')
            print(f'🎯 Primary Actions: {categories.get("primary_actions", 0)}')
            print(f'🔗 Content Links: {categories.get("content_links", 0)}')
            print(f'📝 Forms: {categories.get("forms", 0)}')
            print(f'📚 Main Content: {categories.get("main_content", 0)}')
        else:
            print(f'❌ Error: {result.get("error")}')

asyncio.run(test())
