#!/usr/bin/env python3
"""
🧪 Test script for menu consolidation function
"""

import asyncio
import json
import sys
import os

# Add the current directory to Python path so we can import ws_server
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import our function from ws_server
from ws_server import consolidate_actionable_elements_to_menus

async def test_menu_consolidation():
    """Test the menu consolidation function with sample data"""
    
    # Sample actionable elements (similar to what we see in page.jsonl)
    sample_actionable_elements = [
        {
            "actionId": "action_navigate_a_1",
            "actionType": "navigate",
            "tagName": "a",
            "textContent": "HOME",
            "selectors": [".menu-link", "a.menu-link", "li:nth-child(1)"],
            "attributes": {"href": "https://brighttreedigital.com.au/"}
        },
        {
            "actionId": "action_navigate_a_2", 
            "actionType": "navigate",
            "tagName": "a",
            "textContent": "ABOUT",
            "selectors": [".menu-link", "a.menu-link", "li:nth-child(1)"],
            "attributes": {"href": "https://brighttreedigital.com.au/about/"}
        },
        {
            "actionId": "action_click_button_3",
            "actionType": "click", 
            "tagName": "button",
            "textContent": "Menu Toggle",
            "selectors": [".ast-menu-toggle", "button.ast-menu-toggle", "li:nth-child(2)"],
            "attributes": {"aria-label": "Toggle menu"}
        },
        {
            "actionId": "action_navigate_a_4",
            "actionType": "navigate",
            "tagName": "a", 
            "textContent": "Banner Design",
            "selectors": [".menu-link", "a.menu-link", "li:nth-child(1)"],
            "attributes": {"href": "https://brighttreedigital.com.au/banner-design-portfolio/"}
        }
    ]
    
    print("🧪 Testing menu consolidation function...")
    print(f"📊 Input: {len(sample_actionable_elements)} actionable elements")
    
    # Test the function
    try:
        result = await consolidate_actionable_elements_to_menus(sample_actionable_elements)
        
        print("\n✅ Menu consolidation result:")
        print(json.dumps(result, indent=2))
        
        # Check the structure
        if "menus" in result:
            print(f"\n📊 Summary:")
            print(f"   Total menus: {result.get('summary', {}).get('total_menus', 0)}")
            print(f"   Total items: {result.get('summary', {}).get('total_items', 0)}")
            print(f"   Navigation links: {result.get('summary', {}).get('navigation_links', 0)}")
            print(f"   Toggle buttons: {result.get('summary', {}).get('toggle_buttons', 0)}")
            
            # Check if we have the expected structure
            if result.get('summary', {}).get('total_menus', 0) > 0:
                print("\n🎉 SUCCESS! Menu consolidation is working!")
            else:
                print("\n⚠️ Menu consolidation returned no menus")
        else:
            print("\n❌ Menu consolidation failed - no 'menus' key in result")
            
    except Exception as e:
        print(f"\n❌ Error testing menu consolidation: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("🚀 Menu Consolidation Test")
    print("=" * 50)
    
    # Run the test
    asyncio.run(test_menu_consolidation())
