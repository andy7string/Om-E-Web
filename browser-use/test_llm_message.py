#!/usr/bin/env python3
# ruff: noqa
"""
LLM Message Demo

This script shows you exactly what gets sent to the LLM,
including the DOM extraction output and all context.
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
    print("🤖 LLM Message Demo - Let's see what gets sent to the AI!")
    
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
    
    # Create agent
    agent = Agent(
        task="Go to Google and search for 'browser automation'",
        llm=llm,
        browser_profile=chrome_profile
    )
    
    print("🚀 Starting browser session...")
    
    # Start the browser session
    await agent.browser_session.start()
    
    try:
        # Navigate to Google
        print("📄 Navigating to Google...")
        from browser_use.browser.events import NavigateToUrlEvent
        await agent.browser_session.on_NavigateToUrlEvent(
            NavigateToUrlEvent(url="https://google.com")
        )
        
        # Wait for page to load
        await asyncio.sleep(3)
        
        # Get the browser state
        print("🔍 Getting browser state...")
        state = await agent.browser_session.get_browser_state_summary()
        
        print("\n" + "="*80)
        print("📤 COMPLETE LLM MESSAGE BREAKDOWN")
        print("="*80)
        
        # Show what gets sent to LLM
        print("\n🔧 1. SYSTEM PROMPT (from system_prompt.md):")
        print("-" * 60)
        system_prompt = agent._message_manager.system_prompt.content
        print(f"Length: {len(system_prompt)} characters")
        print("First 500 chars:")
        print(system_prompt[:500] + "..." if len(system_prompt) > 500 else system_prompt)
        
        # Show browser state description
        print("\n🌐 2. BROWSER STATE DESCRIPTION:")
        print("-" * 60)
        browser_state_desc = agent._message_manager.create_state_messages(
            browser_state_summary=state,
            use_vision=False  # Don't include screenshot for this demo
        )
        
        # Get the actual message that would be sent
        from browser_use.agent.prompts import AgentMessagePrompt
        from browser_use.file_system import FileSystem
        
        prompt = AgentMessagePrompt(
            browser_state_summary=state,
            file_system=FileSystem(base_dir='./tmp'),
            task="Go to Google and search for 'browser automation'",
            step_info=None,
        )
        
        user_message = prompt.get_user_message(use_vision=False)
        
        print(f"Message length: {len(user_message.content)} characters")
        print("\n📋 BROWSER STATE CONTENT:")
        print("-" * 60)
        
        # Parse the message to show different sections
        content = user_message.content
        
        # Extract different sections
        sections = {
            'agent_history': content.split('<agent_history>')[1].split('</agent_history>')[0] if '<agent_history>' in content else 'N/A',
            'agent_state': content.split('<agent_state>')[1].split('</agent_state>')[0] if '<agent_state>' in content else 'N/A',
            'browser_state': content.split('<browser_state>')[1].split('</browser_state>')[0] if '<browser_state>' in content else 'N/A',
        }
        
        print("\n📚 AGENT HISTORY:")
        print("-" * 30)
        print(sections['agent_history'].strip())
        
        print("\n🎯 AGENT STATE:")
        print("-" * 30)
        print(sections['agent_state'].strip())
        
        print("\n🌐 BROWSER STATE:")
        print("-" * 30)
        browser_state = sections['browser_state'].strip()
        print(browser_state)
        
        # Show interactive elements specifically
        print("\n🎯 INTERACTIVE ELEMENTS (what the AI sees):")
        print("-" * 60)
        
        # Extract the interactive elements section
        if 'Interactive Elements:' in browser_state:
            elements_start = browser_state.find('Interactive Elements:')
            elements_end = browser_state.find('\n\n', elements_start)
            if elements_end == -1:
                elements_end = len(browser_state)
            
            elements_section = browser_state[elements_start:elements_end]
            print(elements_section)
        
        # Show DOM state structure
        print("\n🔧 DOM STATE STRUCTURE:")
        print("-" * 60)
        print(f"Total interactive elements: {len(state.dom_state.selector_map)}")
        print(f"Element indexes: {list(state.dom_state.selector_map.keys())}")
        
        # Show a few sample elements
        print("\n📋 SAMPLE ELEMENTS:")
        print("-" * 30)
        for i, (index, element) in enumerate(list(state.dom_state.selector_map.items())[:5]):
            print(f"[{index}] <{element.node_name}>")
            text = element.node_value or element.get_all_children_text(max_depth=2)
            if text:
                print(f"    Text: {text[:50]}{'...' if len(text) > 50 else ''}")
            if element.attributes.get('placeholder'):
                print(f"    Placeholder: {element.attributes['placeholder']}")
            print()
        
        # Show the complete message structure
        print("\n📤 COMPLETE MESSAGE STRUCTURE:")
        print("-" * 60)
        print("1. System Message (instructions)")
        print("2. User Message containing:")
        print("   - Agent History")
        print("   - Agent State (task, files, etc.)")
        print("   - Browser State (URL, elements, etc.)")
        print("   - Screenshot (if use_vision=True)")
        
        print(f"\n📊 MESSAGE STATISTICS:")
        print("-" * 30)
        print(f"System prompt length: {len(system_prompt)} chars")
        print(f"User message length: {len(user_message.content)} chars")
        print(f"Total message length: {len(system_prompt) + len(user_message.content)} chars")
        print(f"Interactive elements: {len(state.dom_state.selector_map)}")
        print(f"Current URL: {state.url}")
        print(f"Page title: {state.title}")
        
        print("\n✅ LLM message demo completed!")
        print("This shows you exactly what context the AI receives for each decision.")
        
    finally:
        # Clean up
        await agent.browser_session.stop()

if __name__ == '__main__':
    asyncio.run(main())
