#!/usr/bin/env python3
# ruff: noqa
"""
DOM Extraction Demo

This script shows you exactly what the DOM extraction system outputs
so you can understand how interactive elements are detected and indexed.
"""

import asyncio
import os
import sys
import json

# Add the parent directory to the path so we can import browser_use
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from browser_use import Agent
from browser_use.llm.openai.chat import ChatOpenAI
from browser_use.browser.profile import BrowserProfile

async def main():
    print("🔍 DOM Extraction Demo - Let's see what the system detects!")
    
    # Initialize the model
    llm = ChatOpenAI(
        model='gpt-4o-mini',
        temperature=0.1
    )
    
    # Create a Chrome-specific browser profile
    chrome_profile = BrowserProfile(
        headless=False,
        channel='chrome',
        executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        window_size={'width': 1200, 'height': 800},
        enable_default_extensions=True,
        stealth=True,
    )
    
    # Create agent but don't run it yet
    agent = Agent(
        task="Just navigate to a simple page so we can see DOM extraction",
        llm=llm,
        browser_profile=chrome_profile
    )
    
    print("🚀 Starting browser session...")
    
    # Start the browser session
    await agent.browser_session.start()
    
    try:
        # Navigate to a simple page
        print("📄 Navigating to example.com...")
        from browser_use.browser.events import NavigateToUrlEvent
        await agent.browser_session.on_NavigateToUrlEvent(
            NavigateToUrlEvent(url="https://example.com")
        )
        
        # Wait for page to load
        await asyncio.sleep(3)
        
        # Get the browser state (this triggers DOM extraction)
        print("🔍 Extracting DOM and interactive elements...")
        state = await agent.browser_session.get_browser_state_summary()
        
        print("\n" + "="*60)
        print("📊 DOM EXTRACTION RESULTS")
        print("="*60)
        
        print(f"\n📍 Current URL: {state.url}")
        print(f"📝 Page Title: {state.title}")
        print(f"📸 Screenshot taken: {'Yes' if state.screenshot else 'No'}")
        
        # Show interactive elements
        print(f"\n🎯 INTERACTIVE ELEMENTS FOUND: {len(state.dom_state.selector_map)}")
        print("-" * 60)
        
        for index, element in state.dom_state.selector_map.items():
            print(f"[{index}] <{element.node_name}>")
            
            # Get element text
            text = element.node_value or element.get_all_children_text(max_depth=2)
            if text:
                print(f"    Text: {text[:100]}{'...' if len(text) > 100 else ''}")
            
            # Show attributes
            attrs = []
            if element.attributes.get('href'):
                attrs.append(f"href={element.attributes['href']}")
            if element.attributes.get('placeholder'):
                attrs.append(f"placeholder={element.attributes['placeholder']}")
            if element.attributes.get('type'):
                attrs.append(f"type={element.attributes['type']}")
            if element.attributes.get('aria-label'):
                attrs.append(f"aria-label={element.attributes['aria-label']}")
            
            if attrs:
                print(f"    Attributes: {', '.join(attrs)}")
            
            # Show position
            if element.absolute_position:
                pos = element.absolute_position
                print(f"    Position: x={pos.x}, y={pos.y}, w={pos.width}, h={pos.height}")
            
            print()
        
        # Show the raw DOM state structure
        print("\n🔧 RAW DOM STATE STRUCTURE:")
        print("-" * 60)
        print(f"Selector map keys: {list(state.dom_state.selector_map.keys())}")
        print(f"Total elements: {len(state.dom_state.selector_map)}")
        
        # Show a sample element in detail
        if state.dom_state.selector_map:
            sample_index = list(state.dom_state.selector_map.keys())[0]
            sample_element = state.dom_state.selector_map[sample_index]
            print(f"\n📋 SAMPLE ELEMENT [{sample_index}] DETAILS:")
            print(json.dumps({
                'node_name': sample_element.node_name,
                'node_value': sample_element.node_value,
                'attributes': sample_element.attributes,
                'is_visible': sample_element.is_visible,
                'absolute_position': {
                    'x': sample_element.absolute_position.x if sample_element.absolute_position else None,
                    'y': sample_element.absolute_position.y if sample_element.absolute_position else None,
                    'width': sample_element.absolute_position.width if sample_element.absolute_position else None,
                    'height': sample_element.absolute_position.height if sample_element.absolute_position else None,
                }
            }, indent=2))
        
        print("\n✅ DOM extraction demo completed!")
        print("This shows you exactly what the AI agent sees when analyzing a webpage.")
        
    finally:
        # Clean up
        await agent.browser_session.stop()

if __name__ == '__main__':
    asyncio.run(main())

