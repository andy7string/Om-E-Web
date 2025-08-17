#!/usr/bin/env python3
"""
🧪 Test File Saving Functionality

This script tests the new file saving logic in ws_server.py
"""

import asyncio
import websockets
import json
import os

async def test_file_saving():
    """Test that generateSiteMap automatically saves files"""
    uri = 'ws://127.0.0.1:17892'
    
    try:
        async with websockets.connect(uri) as ws:
            print('🔌 Connected to WebSocket server')
            
            # Test generateSiteMap - this should now automatically save to JSONL
            print('🧪 Testing generateSiteMap with automatic file saving...')
            await ws.send(json.dumps({'id': 'test_file_save', 'command': 'generateSiteMap'}))
            response = await ws.recv()
            result = json.loads(response)
            
            if result.get('ok'):
                data = result.get('result', {})
                stats = data.get('statistics', {})
                print(f'✅ generateSiteMap completed!')
                print(f'📊 Total Elements: {stats.get("totalElements", 0)}')
                print(f'🔍 Interactive Elements: {len(data.get("interactiveElements", []))}')
                print(f'📚 Page Structure: {len(data.get("pageStructure", {}).get("headings", []))} headings')
                
                # Check if file was created
                print(f'\n🔍 Checking for saved file...')
                if os.path.exists('@site_structures'):
                    files = os.listdir('@site_structures')
                    jsonl_files = [f for f in files if f.endswith('.jsonl')]
                    if jsonl_files:
                        print(f'💾 Found saved files: {jsonl_files}')
                        for file in jsonl_files:
                            filepath = os.path.join('@site_structures', file)
                            size = os.path.getsize(filepath)
                            print(f'   📁 {file}: {size} bytes')
                    else:
                        print(f'❌ No JSONL files found in @site_structures/')
                else:
                    print(f'❌ @site_structures directory not found')
                
            else:
                print(f'❌ Error: {result.get("error")}')
                
    except Exception as e:
        print(f'❌ Connection error: {e}')

if __name__ == "__main__":
    asyncio.run(test_file_saving())
