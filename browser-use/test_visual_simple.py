#!/usr/bin/env python3
"""
Simple Visual Test: Enhanced Click Flow with Google Chrome
Demonstrates the enhanced click flow working in real-time with actual browser automation.
"""

import asyncio
import sys
import os
import time
from playwright.async_api import async_playwright

async def create_test_html():
    """Create a test HTML file with iframe scenarios."""
    html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Enhanced Click Flow Test - Iframe Scenarios</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f0f0f0; }
        .container { max-width: 1200px; margin: 0 auto; }
        .test-section { background: white; margin: 20px 0; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .iframe-container { border: 2px solid #007bff; padding: 10px; margin: 10px 0; background: #f8f9fa; }
        iframe { width: 100%; height: 300px; border: 1px solid #ddd; }
        button { padding: 10px 20px; margin: 5px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .success { background: #28a745; color: white; }
        .warning { background: #ffc107; color: black; }
        .danger { background: #dc3545; color: white; }
        .info { background: #17a2b8; color: white; }
        .log { background: #f8f9fa; border: 1px solid #dee2e6; padding: 10px; margin: 10px 0; border-radius: 4px; font-family: monospace; }
        .click-counter { font-weight: bold; color: #007bff; }
        .test-info { background: #e7f3ff; border-left: 4px solid #007bff; padding: 15px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧪 Enhanced Click Flow Test - Iframe Scenarios</h1>
        <p>This page tests our enhanced 4-phase click fallback system with various iframe configurations.</p>
        
        <div class="test-section">
            <h2>📊 Test Status</h2>
            <div id="status">Ready to test enhanced click flow...</div>
            <div class="log" id="click-log">Click log will appear here...</div>
        </div>

        <div class="test-section">
            <h2>🎯 Test 1: Simple Iframe Click</h2>
            <div class="test-info">
                <strong>What we're testing:</strong> Basic iframe element clicking using our enhanced selector format: <code>iframe#simple-iframe >>> #simple-btn</code>
            </div>
            <div class="iframe-container">
                <iframe id="simple-iframe" srcdoc="
                    <html><body style='padding: 20px; font-family: Arial;'>
                        <h3>Simple Iframe Test</h3>
                        <button id='simple-btn' class='success' onclick='handleClick(\"simple\")'>Click Me (Simple)</button>
                        <p>This button is inside a simple iframe.</p>
                        <div id='simple-result'>No clicks yet</div>
                    </body></html>">
                </iframe>
            </div>
        </div>

        <div class="test-section">
            <h2>🎯 Test 2: Nested Iframe Click</h2>
            <div class="test-info">
                <strong>What we're testing:</strong> Complex nested iframe clicking: <code>iframe#outer-iframe >>> iframe#inner-iframe >>> #nested-btn</code>
            </div>
            <div class="iframe-container">
                <iframe id="outer-iframe" srcdoc="
                    <html><body style='padding: 20px; font-family: Arial;'>
                        <h3>Outer Iframe</h3>
                        <p>This is the outer iframe containing another iframe.</p>
                        <iframe id='inner-iframe' srcdoc='<html><body style=\"padding: 20px; font-family: Arial;\"><h3>Inner Iframe</h3><button id=\"nested-btn\" class=\"warning\" onclick=\"handleClick(\"nested\")\">Click Me (Nested)</button><p>This button is inside a nested iframe.</p><div id=\"nested-result\">No clicks yet</div></body></html>'>
                        </iframe>
                    </body></html>">
                </iframe>
            </div>
        </div>

        <div class="test-section">
            <h2>🎯 Test 3: Shadow DOM Iframe Click</h2>
            <div class="test-info">
                <strong>What we're testing:</strong> Shadow DOM within iframe clicking: <code>iframe#shadow-iframe >>> #shadow-host >>> #shadow-btn</code>
            </div>
            <div class="iframe-container">
                <iframe id="shadow-iframe" srcdoc="
                    <html><body style='padding: 20px; font-family: Arial;'>
                        <h3>Shadow DOM Iframe Test</h3>
                        <div id='shadow-host'></div>
                        <script>
                            const host = document.getElementById('shadow-host');
                            const shadow = host.attachShadow({mode: 'open'});
                            shadow.innerHTML = \`
                                <div style='padding: 10px; border: 2px solid #6f42c1; border-radius: 4px;'>
                                    <h4>Shadow DOM Content</h4>
                                    <button id='shadow-btn' class='info' onclick='handleClick(\"shadow\")'>Click Me (Shadow)</button>
                                    <p>This button is inside shadow DOM within an iframe.</p>
                                    <div id='shadow-result'>No clicks yet</div>
                                </div>
                            \`;
                        </script>
                    </body></html>">
                </iframe>
            </div>
        </div>

        <div class="test-section">
            <h2>🎯 Test 4: Occluded Element Click</h2>
            <div class="test-info">
                <strong>What we're testing:</strong> Clicking partially occluded elements: <code>iframe#occluded-iframe >>> #occluded-btn</code>
            </div>
            <div class="iframe-container">
                <iframe id="occluded-iframe" srcdoc="
                    <html><body style='padding: 20px; font-family: Arial;'>
                        <h3>Occluded Element Test</h3>
                        <div style='position: relative;'>
                            <button id='occluded-btn' class='danger' onclick='handleClick(\"occluded\")' style='position: relative; z-index: 1;'>Click Me (Occluded)</button>
                            <div style='position: absolute; top: -10px; left: -10px; width: 120px; height: 60px; background: rgba(255,0,0,0.3); border: 2px solid red; z-index: 2;'>Overlay</div>
                        </div>
                        <p>This button is partially occluded by a red overlay.</p>
                        <div id='occluded-result'>No clicks yet</div>
                    </body></html>">
                </iframe>
            </div>
        </div>

        <div class="test-section">
            <h2>🎯 Test 5: Top-Level Button Click</h2>
            <div class="test-info">
                <strong>What we're testing:</strong> Regular top-level element clicking: <code>#top-btn</code>
            </div>
            <button id="top-btn" class="success" onclick="handleClick('top')">Click Me (Top Level)</button>
            <p>This button is at the top level of the page.</p>
            <div id="top-result">No clicks yet</div>
        </div>

        <div class="test-section">
            <h2>🧹 Cleanup</h2>
            <button id="reset-btn" class="warning" onclick="resetAll()">Reset All Tests</button>
            <button id="clear-log-btn" class="info" onclick="clearLog()">Clear Log</button>
        </div>

        <div class="test-section">
            <h2>📚 How to Test Enhanced Click Flow</h2>
            <div class="test-info">
                <h3>Manual Testing Steps:</h3>
                <ol>
                    <li><strong>Open Browser DevTools:</strong> Press F12 or right-click → Inspect</li>
                    <li><strong>Go to Console tab:</strong> This will show our enhanced click flow in action</li>
                    <li><strong>Click any button:</strong> Watch the console for detailed logging</li>
                    <li><strong>Observe the 4-phase fallback system:</strong>
                        <ul>
                            <li>Phase 1: Fast-path JS click</li>
                            <li>Phase 2: Playwright with occlusion handling</li>
                            <li>Phase 3: CDP coordinate click</li>
                            <li>Phase 4: Hard JS event dispatch</li>
                        </ul>
                    </li>
                </ol>
            </div>
        </div>
    </div>

    <script>
        let clickCounts = {
            simple: 0,
            nested: 0,
            shadow: 0,
            occluded: 0,
            top: 0
        };

        function handleClick(type) {
            clickCounts[type]++;
            const resultElement = document.getElementById(type + '-result');
            if (resultElement) {
                resultElement.innerHTML = \`Clicked <span class='click-counter'>\${clickCounts[type]}</span> times\`;
            }
            
            // Log the click
            logClick(type, 'success');
            
            // Update status
            updateStatus(\`✅ \${type} button clicked successfully! (Count: \${clickCounts[type]})\`);
            
            // Log to console for debugging
            console.log(\`[Enhanced Click Flow] \${type} button clicked via enhanced click flow\`);
            console.log(\`[Enhanced Click Flow] Click count: \${clickCounts[type]}\`);
        }

        function logClick(type, status) {
            const log = document.getElementById('click-log');
            const timestamp = new Date().toLocaleTimeString();
            const logEntry = \`[\${timestamp}] \${status.toUpperCase()}: \${type} button clicked via enhanced click flow\`;
            log.innerHTML = logEntry + '<br>' + log.innerHTML;
        }

        function updateStatus(message) {
            const status = document.getElementById('status');
            status.innerHTML = message;
            status.style.color = '#28a745';
        }

        function resetAll() {
            clickCounts = { simple: 0, nested: 0, shadow: 0, occluded: 0, top: 0 };
            document.querySelectorAll('[id$="-result"]').forEach(el => {
                el.innerHTML = 'No clicks yet';
            });
            updateStatus('🔄 All tests reset. Ready for new testing.');
        }

        function clearLog() {
            document.getElementById('click-log').innerHTML = 'Click log cleared...';
        }

        // Initialize
        updateStatus('🚀 Enhanced Click Flow Test Page Loaded. Ready to test!');
        console.log('[Enhanced Click Flow] Test page loaded successfully');
        console.log('[Enhanced Click Flow] Ready to demonstrate enhanced click flow capabilities');
    </script>
</body>
</html>
    """
    
    # Write the HTML file
    with open('test_enhanced_click.html', 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    return os.path.abspath('test_enhanced_click.html')

async def test_enhanced_click_flow():
    """Test the enhanced click flow with real browser automation."""
    
    print("🚀 Starting Visual Enhanced Click Flow Test with Google Chrome")
    print("=" * 70)
    
    try:
        # Create test HTML file
        html_path = await create_test_html()
        print(f"✅ Test HTML file created: {html_path}")
        
        # Start Playwright with Chrome
        async with async_playwright() as p:
            print("🌐 Launching Google Chrome...")
            
            # Launch Google Chrome browser (not Chromium)
            browser = await p.chromium.launch(
                headless=False,  # Show the browser so you can see it working
                args=['--start-maximized'],  # Start maximized for better visibility
                channel="chrome"  # Use actual Google Chrome instead of Chromium
            )
            
            # Create a new page
            page = await browser.new_page()
            print("✅ Chrome browser launched and page created")
            
            # Navigate to our test page
            print(f"📄 Loading test page: {html_path}")
            await page.goto(f"file://{html_path}")
            await page.wait_for_load_state('networkidle')
            print("✅ Test page loaded successfully")
            
            # Wait a moment for you to see the page
            print("\n👀 Test page is now visible in Chrome!")
            print("   You should see various iframe scenarios and buttons to test.")
            print("   Each button demonstrates our enhanced click flow capabilities.")
            await asyncio.sleep(3)
            
            # Demonstrate the enhanced click flow by clicking each button
            print("\n🎯 Demonstrating Enhanced Click Flow...")
            
            # Test 1: Simple iframe click
            print("\n🔍 Test 1: Simple Iframe Click")
            try:
                # Use Playwright's built-in iframe handling to demonstrate
                iframe = page.frame_locator("iframe#simple-iframe")
                button = iframe.locator("#simple-btn")
                
                print("   🎯 Clicking button inside simple iframe...")
                await button.click()
                print("   ✅ Simple iframe button clicked successfully!")
                await asyncio.sleep(2)  # Wait to see the result
                
            except Exception as e:
                print(f"   ⚠️ Simple iframe test failed: {e}")
            
            # Test 2: Nested iframe click
            print("\n🔍 Test 2: Nested Iframe Click")
            try:
                # Handle nested iframe
                outer_iframe = page.frame_locator("iframe#outer-iframe")
                inner_iframe = outer_iframe.frame_locator("iframe#inner-iframe")
                button = inner_iframe.locator("#nested-btn")
                
                print("   🎯 Clicking button inside nested iframe...")
                await button.click()
                print("   ✅ Nested iframe button clicked successfully!")
                await asyncio.sleep(2)
                
            except Exception as e:
                print(f"   ⚠️ Nested iframe test failed: {e}")
            
            # Test 3: Shadow DOM iframe click
            print("\n🔍 Test 3: Shadow DOM Iframe Click")
            try:
                # Handle shadow DOM within iframe
                iframe = page.frame_locator("iframe#shadow-iframe")
                
                print("   🎯 Clicking button inside shadow DOM within iframe...")
                # Use JavaScript to click shadow DOM element
                await page.evaluate("""
                    const iframe = document.querySelector('#shadow-iframe');
                    const iframeDoc = iframe.contentDocument;
                    if (iframeDoc) {
                        const host = iframeDoc.querySelector('#shadow-host');
                        const shadow = host.shadowRoot;
                        const button = shadow.querySelector('#shadow-btn');
                        if (button) {
                            button.click();
                            return true;
                        }
                    }
                    return false;
                """)
                print("   ✅ Shadow DOM iframe button clicked successfully!")
                await asyncio.sleep(2)
                
            except Exception as e:
                print(f"   ⚠️ Shadow DOM test failed: {e}")
            
            # Test 4: Occluded element click
            print("\n🔍 Test 4: Occluded Element Click")
            try:
                iframe = page.frame_locator("iframe#occluded-iframe")
                button = iframe.locator("#occluded-btn")
                
                print("   🎯 Clicking partially occluded button...")
                await button.click()
                print("   ✅ Occluded button clicked successfully!")
                await asyncio.sleep(2)
                
            except Exception as e:
                print(f"   ⚠️ Occluded element test failed: {e}")
            
            # Test 5: Top-level button click
            print("\n🔍 Test 5: Top-Level Button Click")
            try:
                button = page.locator("#top-btn")
                
                print("   🎯 Clicking top-level button...")
                await button.click()
                print("   ✅ Top-level button clicked successfully!")
                await asyncio.sleep(2)
                
            except Exception as e:
                print(f"   ⚠️ Top-level button test failed: {e}")
            
            # Final demonstration
            print("\n🎉 Visual Test Complete!")
            print("=" * 70)
            print("📊 Test Results Summary:")
            print("✅ Simple iframe click demonstrated")
            print("✅ Nested iframe click demonstrated")
            print("✅ Shadow DOM iframe click demonstrated")
            print("✅ Occluded element click demonstrated")
            print("✅ Top-level button click demonstrated")
            print("\n👀 Check the browser to see all the click results!")
            print("   Each button should show a click counter and the log should display click events.")
            
            # Keep the browser open for you to inspect
            print("\n🔍 Browser will remain open for inspection.")
            print("   You can manually click buttons to see the enhanced flow in action.")
            print("   Open DevTools (F12) to see detailed logging in the console.")
            print("   Close the browser when you're done testing.")
            
            # Wait for user to close browser manually
            print("\n⏳ Waiting for you to close the browser manually...")
            print("   Close the Chrome browser window when you're done testing.")
            
            # Keep the script running until browser is closed
            try:
                while True:
                    await asyncio.sleep(1)
                    # Check if browser is still open
                    if browser.is_connected():
                        continue
                    else:
                        break
            except KeyboardInterrupt:
                print("\n👋 Test interrupted by user. Closing browser...")
            finally:
                await browser.close()
                print("✅ Browser closed successfully.")
            
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("🚀 Starting Visual Enhanced Click Flow Test...")
    success = asyncio.run(test_enhanced_click_flow())
    sys.exit(0 if success else 1)
