#!/usr/bin/env python3
"""
Custom System Prompt Demo for Browser-Use

This script demonstrates how to customize the system prompt
that guides the AI agent's behavior.
"""

import asyncio
import os
import sys

# Add the parent directory to the path so we can import browser_use
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from browser_use import Agent
from browser_use.llm.openai.chat import ChatOpenAI
from browser_use.browser.profile import BrowserProfile

async def main():
    print("🚀 Starting Custom System Prompt Demo...")
    
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
    
    # Custom system prompt extension
    custom_prompt = """
    SPECIAL INSTRUCTIONS FOR THIS DEMO:
    - Always be very descriptive about what you're doing
    - Take screenshots frequently to document your progress
    - If you encounter any errors, explain what went wrong and how to fix it
    - Be extra careful with clicking elements - double-check the index numbers
    - Provide detailed explanations of your reasoning process
    """
    
    # Define a simple task
    task = "Go to https://example.com and tell me what the main heading says"
    
    print(f"📋 Task: {task}")
    print("🔧 Using custom system prompt...")
    
    # Create and run the agent with custom prompt
    agent = Agent(
        task=task, 
        llm=llm,
        browser_profile=chrome_profile,
        extend_system_message=custom_prompt  # This extends the default prompt
    )
    
    print("🤖 Agent starting with custom prompt...")
    history = await agent.run()
    
    print("\n✅ Demo completed!")
    print(f"📊 Agent took {len(history)} steps to complete the task")

if __name__ == '__main__':
    asyncio.run(main())
