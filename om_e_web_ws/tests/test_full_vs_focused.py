#!/usr/bin/env python3
"""
🧪 Compare Full vs Focused Site Map

See what we're missing from the focused scanner
"""

import asyncio
import json
import websockets

async def compare_site_maps():
    """Compare full vs focused site maps"""
    uri = 'ws://127.0.0.1:17892'
    
    try:
        async with websockets.connect(uri) as ws:
            print("🔌 Connected to WebSocket server")
            
            # Test 1: Full Site Map (163 elements)
            print("\n1️⃣ Testing FULL Site Map (generateSiteMap)...")
            await ws.send(json.dumps({
                'id': 'full', 
                'command': 'generateSiteMap'
            }))
            
            response = await ws.recv()
            full_result = json.loads(response)
            
            if full_result.get('ok'):
                full_data = full_result.get('result', {})
                full_stats = full_data.get('statistics', {})
                print(f"✅ Full Site Map: {full_stats.get('totalElements', 0)} elements")
                
                # Look for key elements we might be missing
                interactive = full_data.get('interactiveElements', [])
                print(f"🔍 Interactive Elements: {len(interactive)}")
                
                # Look for logo/home button
                logo_elements = [el for el in interactive if 
                    'logo' in (el.get('text', '').lower()) or 
                    'logo' in (el.get('className', '').lower()) or
                    'home' in (el.get('text', '').lower())]
                
                if logo_elements:
                    print(f"🏠 Logo/Home elements found: {len(logo_elements)}")
                    for el in logo_elements[:2]:
                        print(f"   - {el.get('text', 'No text')} ({el.get('type')}) - {el.get('selector')}")
                
                # Look for menu/hamburger button
                menu_elements = [el for el in interactive if 
                    'menu' in (el.get('text', '').lower()) or 
                    'menu' in (el.get('className', '').lower()) or
                    'hamburger' in (el.get('text', '').lower()) or
                    '☰' in (el.get('text', ''))]
                
                if menu_elements:
                    print(f"☰ Menu elements found: {len(menu_elements)}")
                    for el in menu_elements[:2]:
                        print(f"   - {el.get('text', 'No text')} ({el.get('type')}) - {el.get('selector')}")
                
                # Look for navigation elements
                nav_elements = [el for el in interactive if 
                    el.get('type') == 'a' and 
                    ('nav' in (el.get('className', '').lower()) or
                     'menu' in (el.get('className', '').lower()))]
                
                if nav_elements:
                    print(f"🧭 Navigation elements found: {len(nav_elements)}")
                    for el in nav_elements[:3]:
                        print(f"   - {el.get('text', 'No text')} ({el.get('type')}) - {el.get('className', '')}")
                
            else:
                print(f"❌ Full Site Map failed: {full_result.get('error')}")
            
            # Test 2: Focused Site Map (5 elements)
            print("\n2️⃣ Testing FOCUSED Site Map (generateFocusedSiteMap)...")
            await ws.send(json.dumps({
                'id': 'focused', 
                'command': 'generateFocusedSiteMap'
            }))
            
            response = await ws.recv()
            focused_result = json.loads(response)
            
            if focused_result.get('ok'):
                focused_data = focused_result.get('result', {})
                focused_stats = focused_data.get('statistics', {})
                print(f"✅ Focused Site Map: {focused_stats.get('totalElements', 0)} elements")
                
                # Show what we got
                elements = focused_data.get('elements', {})
                for category, items in elements.items():
                    if items:
                        print(f"   {category}: {len(items)} items")
                        for item in items[:2]:
                            print(f"     - {item.get('text', 'No text')} ({item.get('type')})")
                
            else:
                print(f"❌ Focused Site Map failed: {focused_result.get('error')}")
            
            # Analysis
            print("\n🔍 ANALYSIS:")
            if full_result.get('ok') and focused_result.get('ok'):
                full_count = full_result.get('result', {}).get('statistics', {}).get('totalElements', 0)
                focused_count = focused_result.get('result', {}).get('statistics', {}).get('totalElements', 0)
                reduction = ((full_count - focused_count) / full_count) * 100
                print(f"📊 Reduction: {full_count} → {focused_count} elements ({reduction:.1f}% reduction)")
                
                if logo_elements or menu_elements:
                    print("⚠️  POTENTIAL MISSING ELEMENTS:")
                    if logo_elements:
                        print("   - Logo/Home button (important for navigation)")
                    if menu_elements:
                        print("   - Menu button (important for navigation)")
                    if nav_elements:
                        print("   - Navigation menu items (important for site structure)")
                    print("   Consider adjusting focused scanner to include these!")
                
    except Exception as e:
        print(f"❌ Connection error: {e}")

if __name__ == "__main__":
    asyncio.run(compare_site_maps())
