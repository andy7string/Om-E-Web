#!/usr/bin/env python3
"""
🧪 Test Site Map Timing

Measure performance of generateSiteMap function
"""

import asyncio
import websockets
import json
import time

async def test_timing():
    """Test generateSiteMap with detailed timing"""
    uri = 'ws://127.0.0.1:17892'
    
    try:
        async with websockets.connect(uri) as ws:
            print("🔌 Connected to WebSocket server")
            
            # Test generateSiteMap with timing
            print("\n🧪 Testing generateSiteMap with timing...")
            
            # Start timing
            start_time = time.time()
            
            await ws.send(json.dumps({
                'id': 'test', 
                'command': 'generateSiteMap'
            }))
            
            # Time the response
            response_start = time.time()
            response = await ws.recv()
            response_time = time.time() - response_start
            
            total_time = time.time() - start_time
            
            result = json.loads(response)
            
            if result.get('ok'):
                data = result.get('result', {})
                stats = data.get('statistics', {})
                
                print(f"\n✅ generateSiteMap completed!")
                print(f"📊 Total Elements: {stats.get('totalElements', 0)}")
                print(f"🔍 Interactive Elements: {len(data.get('interactiveElements', []))}")
                print(f"📚 Page Structure: {len(data.get('pageStructure', {}).get('headings', []))} headings")
                
                # Timing breakdown
                print(f"\n⏱️ TIMING BREAKDOWN:")
                print(f"   Total Time: {total_time:.3f}s")
                print(f"   Response Time: {response_time:.3f}s")
                print(f"   Processing Time (reported): {stats.get('processingTime', 0)}ms")
                
                # Performance metrics
                elements_per_second = stats.get('totalElements', 0) / (total_time * 1000) if total_time > 0 else 0
                print(f"\n🚀 PERFORMANCE METRICS:")
                print(f"   Elements per second: {elements_per_second:.1f}")
                print(f"   Processing efficiency: {stats.get('processingTime', 0):.1f}ms for {stats.get('totalElements', 0)} elements")
                
            else:
                print(f"❌ Error: {result.get('error')}")
                
    except Exception as e:
        print(f"❌ Connection error: {e}")

if __name__ == "__main__":
    asyncio.run(test_timing())
