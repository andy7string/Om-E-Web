#!/usr/bin/env python3
"""
Quick script to scan the currently active YouTube tab
"""
import asyncio
import websockets
import json

async def scan_youtube():
    """Scan the currently active YouTube tab"""
    try:
        async with websockets.connect('ws://127.0.0.1:17892') as websocket:
            print("🔌 Connected to WebSocket server")
            print("🎯 Scanning currently active YouTube tab...")
            
            # Send generateSiteMap command
            await websocket.send(json.dumps({
                'id': 'scan_youtube',
                'command': 'generateSiteMap'
            }))
            
            # Wait for response
            print("⏳ Waiting for YouTube scan response...")
            response = await websocket.recv()
            result = json.loads(response)
            
            if result.get('ok') and result.get('result'):
                metadata = result['result'].get('metadata', {})
                url = metadata.get('url', 'Unknown')
                elements = result['result'].get('statistics', {}).get('totalElements', 0)
                print(f"✅ YouTube scan completed!")
                print(f"🌐 URL: {url}")
                print(f"📊 Elements found: {elements}")
                print(f"⏱️ Processing time: {metadata.get('processingTime', 0):.2f}ms")
                
                # Check if it's actually YouTube
                if 'youtube.com' in url and 'RotateCookiesPage' not in url:
                    print("🎯 SUCCESS: Main YouTube page scanned!")
                else:
                    print("⚠️ Scanned YouTube-related page (may be redirect/cookies)")
            else:
                print(f"❌ Scan failed: {result.get('error', 'Unknown error')}")
                
    except Exception as e:
        print(f"❌ Scan failed: {e}")

if __name__ == "__main__":
    print("🧪 Scanning YouTube Tab")
    print("=" * 50)
    asyncio.run(scan_youtube())
