#!/usr/bin/env python3
"""
Test script for the new utility methods in ws_server.py
"""
import sys
import os

# Add the current directory to Python path so we can import from ws_server
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the utility functions from ws_server
from ws_server import list_site_structures, read_site_structure, get_active_tab_info

def test_utilities():
    """Test the utility methods"""
    print("🧪 Testing Utility Methods from ws_server.py")
    print("=" * 50)
    
    # Test 1: List site structures
    print("\n📁 TEST 1: list_site_structures()")
    files = list_site_structures()
    if files:
        print(f"✅ Found {len(files)} JSONL files:")
        for file in files:
            print(f"   📄 {file}")
    else:
        print("⚠️ No JSONL files found")
    
    # Test 2: Read a specific file (if any exist)
    if files:
        print(f"\n📖 TEST 2: read_site_structure('{files[0]}')")
        data = read_site_structure(files[0])
        if data:
            print(f"✅ Successfully read file")
            print(f"   📊 Elements: {data.get('statistics', {}).get('totalElements', 'Unknown')}")
            print(f"   🌐 URL: {data.get('metadata', {}).get('url', 'Unknown')}")
        else:
            print("❌ Failed to read file")
    
    # Test 3: Get active tab info
    print(f"\n📱 TEST 3: get_active_tab_info()")
    tab_info = get_active_tab_info()
    if tab_info:
        print(f"✅ Active tab: {tab_info}")
    else:
        print("⚠️ get_active_tab_info not implemented yet")
    
    print("\n✅ Utility method tests completed!")

if __name__ == "__main__":
    test_utilities()
