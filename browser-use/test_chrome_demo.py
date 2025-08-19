#!/usr/bin/env python3
"""
Chrome Demo for Browser-Use System

This script demonstrates the browser-use system working with Google Chrome
to perform a simple web automation task.
"""

import asyncio
import os
import sys

# Add the parent directory to the path so we can import browser_use
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from browser_use import Agent
from browser_use.browser.profile import BrowserProfile
from browser_use.llm.openai.chat import ChatOpenAI
from dotenv import load_dotenv

load_dotenv()

async def main():
    print("🚀 Starting Browser-Use Chrome Demo...")
    
    # Initialize the model
    llm = ChatOpenAI(
        model='gpt-4o-mini',  # Using a faster model for demo
        temperature=0.1
    )
    
    # Create a Chrome-specific browser profile
    chrome_profile = BrowserProfile(
        headless=False,  # Show the browser window so you can see it working
        channel='chrome',  # Use Google Chrome specifically
        executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        window_size={'width': 1200, 'height': 800},
        enable_default_extensions=True,  # Enable ad blocking and cookie handling
        stealth=True,  # Use stealth mode to avoid detection
    )
    
    # Define a simple task to demonstrate the system
    task = """
    Go to https://youtube.com and:
    1. search for andy7string
    2. Find and click on the 3rd video that comes up
    3. Tell me what the new page title is
    """
    
    print(f"📋 Task: {task}")
    print("🔧 Using Google Chrome with enhanced profile...")
    
    # Create and run the agent
    agent = Agent(
        task=task, 
        llm=llm,
        browser_profile=chrome_profile
    )
    
    print("🤖 Agent starting...")
    history = await agent.run()
    
    print("\n✅ Demo completed!")
    print(f"📊 Agent took {len(history)} steps to complete the task")
    
    # Show the final result
    if history:
        last_message = history[-1]
        if hasattr(last_message, 'content'):
            print(f"\n🎯 Final Result: {last_message.content}")
        else:
            print(f"\n🎯 Final Result: {last_message}")

if __name__ == '__main__':
    asyncio.run(main())
