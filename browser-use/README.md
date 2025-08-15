# Enhanced Browser-Use: Chrome-Only AI Browser Automation

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./static/browser-use-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="./static/browser-use.png">
  <img alt="Shows a black Browser Use Logo in light color mode and a white one in dark color mode." src="./static/browser-use.png"  width="full">
</picture>

<h1 align="center">Enhanced AI Browser Automation with Chrome-Only Architecture 🚀</h1>

[![GitHub stars](https://img.shields.io/github/stars/gregpr07/browser-use?style=social)](https://github.com/gregpr07/browser-use/stargazers)
[![Discord](https://img.shields.io/badge/Discord-1303749220842340412-blue?logo=discord)](https://link.browser-use.com/discord)
[![Cloud](https://img.shields.io/badge/Cloud-☁️-blue)](https://cloud.browser-use.com)
[![Documentation](https://img.shields.io/badge/Documentation-📕-blue)](https://docs.browser-use.com)

## 🎯 **Project Overview**

This enhanced browser-use system represents a complete architectural overhaul designed for **Chrome-only AI browser automation**. Built on top of the original browser-use foundation, this system provides:

- **Chrome-Only Architecture**: Optimized specifically for Google Chrome with CDP (Chrome DevTools Protocol)
- **Event-Driven Architecture**: Robust event bus system with watchdog components
- **Enhanced BrowserSession**: Advanced session management with Playwright integration
- **Web-UI Compatibility**: Full compatibility with browser-use web-ui interface
- **Production-Ready**: Comprehensive error handling, logging, and monitoring

## 🏗️ **System Architecture**

### **Core Components**

```
Enhanced Browser-Use System
├── BrowserSession (Core)
│   ├── Event Bus System
│   ├── CDP Integration
│   └── Playwright Bridge
├── Watchdog System
│   ├── Security Watchdog
│   ├── Crash Watchdog
│   ├── Downloads Watchdog
│   ├── DOM Watchdog
│   └── Permissions Watchdog
├── DOM Processing
│   ├── Enhanced DOM Tree
│   ├── Serialization Engine
│   └── Element Detection
└── Web-UI Compatibility Layer
    ├── Browser Class
    ├── BrowserContext Class
    └── Configuration Classes
```

### **Event-Driven Architecture**

The system uses a sophisticated event bus that coordinates between:
- **Browser Operations**: Navigation, page creation, element interaction
- **Watchdog Monitoring**: Security, crashes, downloads, DOM changes
- **State Management**: Browser state, DOM state, session state
- **External Integration**: Web-UI, MCP clients, custom actions

## 📁 **Project Structure & Components**

### **`browser_use/browser/` - Core Browser Management**

#### **`session.py` - BrowserSession (Main Engine)**
- **Purpose**: Central orchestrator for all browser operations
- **Features**:
  - Event-driven architecture with comprehensive event bus
  - CDP (Chrome DevTools Protocol) integration
  - Playwright bridge for robust page interactions
  - Multi-tab management with focus tracking
  - Automatic watchdog registration and management
  - State caching and optimization

#### **`profile.py` - BrowserProfile (Configuration)**
- **Purpose**: Comprehensive browser configuration management
- **Features**:
  - Chrome-specific optimization flags
  - Security and permission settings
  - Viewport and window configuration
  - Extension management (uBlock Origin, cookie handling)
  - Download and recording path configuration
  - Cross-origin iframe support options

#### **`browser.py` - Browser Class (Web-UI Compatibility)**
- **Purpose**: Compatibility wrapper for web-ui integration
- **Features**:
  - Delegates to enhanced BrowserSession
  - Maintains original web-ui interface
  - BrowserConfig with comprehensive options
  - Chrome-only enforcement
  - Proxy and security configuration

#### **`context.py` - BrowserContext Class (Page Management)**
- **Purpose**: Page-level operations and context management
- **Features**:
  - Page creation and navigation
  - Tab management and switching
  - Screenshot and DOM extraction
  - JavaScript execution
  - Viewport and scroll management
  - BrowserContextConfig with validation

### **`browser_use/browser/watchdog_*.py` - Monitoring System**

#### **`watchdog_base.py` - BaseWatchdog**
- **Purpose**: Foundation for all watchdog components
- **Features**:
  - Event listening and emission contracts
  - Automatic event handler registration
  - Session attachment and cleanup
  - Error handling and logging

#### **`security_watchdog.py` - SecurityWatchdog**
- **Purpose**: URL access control and security enforcement
- **Features**:
  - Domain allowlist/blocklist management
  - Navigation security validation
  - Cross-origin iframe protection
  - Security policy enforcement

#### **`crash_watchdog.py` - CrashWatchdog**
- **Purpose**: Browser health monitoring and crash detection
- **Features**:
  - Network timeout detection
  - Target crash monitoring
  - Browser responsiveness checks
  - Automatic error reporting

#### **`downloads_watchdog.py` - DownloadsWatchdog**
- **Purpose**: File download management and monitoring
- **Features**:
  - Automatic PDF download handling
  - Download progress tracking
  - File type detection
  - Download path management

#### **`dom_watchdog.py` - DOMWatchdog**
- **Purpose**: DOM tree management and state building
- **Features**:
  - Enhanced DOM tree construction
  - Element caching and optimization
  - State serialization
  - Frame hierarchy management

#### **`permissions_watchdog.py` - PermissionsWatchdog**
- **Purpose**: Browser permission management
- **Features**:
  - CDP permission granting
  - Clipboard access management
  - Notification permissions
  - Security policy compliance

### **`browser_use/dom/` - DOM Processing Engine**

#### **`service.py` - DomService**
- **Purpose**: Core DOM tree building and management
- **Features**:
  - Accessibility tree integration
  - Frame hierarchy processing
  - Element coordinate calculation
  - Viewport ratio detection

#### **`serializer/serializer.py` - DOMTreeSerializer**
- **Purpose**: DOM state serialization for LLM consumption
- **Features**:
  - Interactive element detection
  - Bounding box filtering
  - Tree optimization
  - Markdown serialization

#### **`enhanced_snapshot.py` - Enhanced DOM Snapshots**
- **Purpose**: High-performance DOM state capture
- **Features**:
  - Fast element collection
  - Style computation
  - Layout information
  - Performance optimization

### **`browser_use/agent/` - AI Agent System**

#### **`service.py` - Agent (Main Agent Class)**
- **Purpose**: AI agent orchestration and task execution
- **Features**:
  - Multi-step task execution
  - LLM integration
  - Action execution and validation
  - History management
  - Error handling and retry logic

#### **`message_manager/` - Message Management**
- **Purpose**: LLM message construction and management
- **Features**:
  - System prompt management
  - State message construction
  - History integration
  - Sensitive data filtering

### **`browser_use/controller/` - Action System**

#### **`service.py` - Controller**
- **Purpose**: Action registry and execution
- **Features**:
  - Built-in browser actions
  - Custom action registration
  - Parameter validation
  - Domain-specific action filtering

#### **`registry/` - Action Registry**
- **Purpose**: Dynamic action management
- **Features**:
  - Action discovery and registration
  - Parameter model generation
  - Domain filtering
  - Action documentation

### **`browser_use/llm/` - LLM Integration**

#### **Multiple Provider Support**
- **OpenAI**: GPT-4, GPT-4o, GPT-3.5
- **Anthropic**: Claude-3, Claude-4
- **Google**: Gemini Pro, Gemini Flash
- **Azure OpenAI**: Enterprise OpenAI integration
- **AWS Bedrock**: Claude via AWS
- **Groq**: Ultra-fast inference
- **DeepSeek**: Alternative models
- **Ollama**: Local model support

#### **Features**
- **Unified Interface**: Consistent API across providers
- **Cost Tracking**: Token usage and cost monitoring
- **Caching**: Response caching for efficiency
- **Error Handling**: Robust error handling and retry logic

### **`browser_use/mcp/` - Model Context Protocol**

#### **MCP Server & Client**
- **Purpose**: Integration with external AI systems
- **Features**:
  - Claude Desktop integration
  - External MCP server connection
  - Tool registration and management
  - Protocol compliance

## 🚀 **Key Features & Capabilities**

### **Chrome-Only Optimization**
- **Native Chrome Integration**: Direct Chrome binary usage
- **CDP Protocol**: Full Chrome DevTools Protocol support
- **Extension Support**: uBlock Origin, cookie management, URL cleaning
- **Performance**: Optimized for Chrome's rendering engine

### **Advanced Browser Management**
- **Multi-Tab Support**: Sophisticated tab management with focus tracking
- **Session Persistence**: State preservation across operations
- **Error Recovery**: Automatic crash detection and recovery
- **Resource Management**: Efficient memory and process management

### **AI-Powered Automation**
- **Vision Integration**: Screenshot analysis and visual understanding
- **DOM Intelligence**: Smart element detection and interaction
- **Context Awareness**: Page state understanding and adaptation
- **Learning Capabilities**: Action optimization based on results

### **Production Features**
- **Comprehensive Logging**: Detailed operation logging and debugging
- **Telemetry**: Performance monitoring and metrics
- **Error Handling**: Robust error handling with user feedback
- **Security**: URL validation and security policy enforcement

## 🔧 **Installation & Setup**

### **Prerequisites**
- Python 3.11+
- Google Chrome browser
- OpenAI API key (or other LLM provider)

### **Installation**
```bash
# Clone the repository
git clone https://github.com/andy7string/Om-E-Web.git
cd Om-E-Web/browser-use

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install chromium --with-deps
```

### **Environment Configuration**
```bash
# Create .env file
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GOOGLE_API_KEY=your_google_api_key_here

# Optional: Custom paths
BROWSER_USE_DOWNLOADS_PATH=~/Downloads/browser-use
BROWSER_USE_SCREENSHOTS_PATH=~/Pictures/browser-use
```

## 📖 **Usage Examples**

### **Basic Browser Automation**
```python
import asyncio
from browser_use import Agent
from browser_use.llm import ChatOpenAI

async def main():
    agent = Agent(
        task="Search for 'AI automation' on Google and summarize the first 3 results",
        llm=ChatOpenAI(model="gpt-4o", temperature=0.7),
    )
    await agent.run()

asyncio.run(main())
```

### **Custom Browser Profile**
```python
from browser_use.browser.profile import BrowserProfile

profile = BrowserProfile(
    headless=False,
    window_size={'width': 1920, 'height': 1080},
    downloads_path='~/Downloads/automation',
    enable_default_extensions=True,
    stealth=True
)
```

### **Advanced Session Management**
```python
from browser_use.browser.session import BrowserSession

session = BrowserSession(browser_profile=profile)
await session.start()

# Navigate and interact
await session.on_NavigateToUrlEvent(
    NavigateToUrlEvent(url="https://example.com")
)

# Get browser state
state = await session.get_browser_state_summary()
```

## 🧪 **Testing & Validation**

### **Test Suite**
The project includes comprehensive test coverage:
- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end workflow testing
- **Browser Tests**: Real browser interaction testing
- **Performance Tests**: Load and stress testing

### **Test Execution**
```bash
# Run all tests
python -m pytest tests/

# Run specific test categories
python -m pytest tests/browser/
python -m pytest tests/agent/
python -m pytest tests/dom/
```

## 🔍 **Debugging & Monitoring**

### **Logging System**
- **Structured Logging**: JSON-formatted logs for analysis
- **Performance Metrics**: Execution time tracking
- **Error Tracking**: Detailed error context and stack traces
- **Event Logging**: Complete event flow documentation

### **Debug Tools**
- **CDP Inspector**: Direct Chrome DevTools access
- **Event Monitor**: Real-time event bus monitoring
- **State Inspector**: Browser state visualization
- **Performance Profiler**: Operation timing analysis

## 🌐 **Web-UI Integration**

### **Compatibility Layer**
The system maintains full compatibility with the original browser-use web-ui:
- **Browser Class**: Wrapper around enhanced BrowserSession
- **BrowserContext**: Page management interface
- **Configuration**: Comprehensive browser and context configuration
- **Actions**: All original web-ui actions supported

### **Enhanced Features**
- **Chrome-Only**: Optimized for Google Chrome
- **Advanced DOM**: Enhanced element detection and interaction
- **Performance**: Improved page loading and interaction speed
- **Reliability**: Better error handling and recovery

## 🚀 **Performance & Optimization**

### **Optimization Features**
- **DOM Caching**: Intelligent DOM state caching
- **Element Filtering**: Bounding box and visibility filtering
- **Lazy Loading**: On-demand resource loading
- **Memory Management**: Efficient memory usage patterns

### **Performance Metrics**
- **Page Load Time**: Optimized navigation and loading
- **DOM Processing**: Fast element detection and serialization
- **Action Execution**: Efficient interaction and validation
- **Memory Usage**: Optimized resource consumption

## 🔒 **Security & Privacy**

### **Security Features**
- **URL Validation**: Domain allowlist/blocklist enforcement
- **Permission Management**: Controlled browser permission access
- **Cross-Origin Protection**: Secure iframe and popup handling
- **Data Isolation**: Session-level data separation

### **Privacy Features**
- **Stealth Mode**: Anti-detection capabilities
- **Cookie Management**: Controlled cookie handling
- **Extension Privacy**: Privacy-focused browser extensions
- **Data Minimization**: Minimal data collection and storage

## 🤝 **Contributing & Development**

### **Development Setup**
```bash
# Clone and setup
git clone https://github.com/andy7string/Om-E-Web.git
cd Om-E_Web/browser-use

# Install development dependencies
pip install -e ".[dev]"

# Setup pre-commit hooks
pre-commit install
```

### **Code Standards**
- **Type Hints**: Full type annotation coverage
- **Documentation**: Comprehensive docstrings and comments
- **Testing**: High test coverage requirements
- **Linting**: Strict code quality enforcement

### **Architecture Principles**
- **Event-Driven**: Asynchronous event-based architecture
- **Modular Design**: Clear separation of concerns
- **Extensibility**: Easy addition of new features
- **Maintainability**: Clean, readable code structure

## 📊 **Project Status & Roadmap**

### **Current Status** ✅
- **Core Architecture**: Complete and production-ready
- **Chrome Integration**: Full Chrome-only optimization
- **Web-UI Compatibility**: Complete compatibility layer
- **Testing Suite**: Comprehensive test coverage
- **Documentation**: Complete technical documentation

### **Recent Achievements** 🎉
- **Enhanced BrowserSession**: Advanced session management
- **Watchdog System**: Comprehensive monitoring and automation
- **DOM Processing**: High-performance DOM handling
- **Event Architecture**: Robust event-driven system
- **Chrome Optimization**: Native Chrome integration

### **Future Roadmap** 🚀
- **Performance Optimization**: Further speed improvements
- **Advanced AI Features**: Enhanced LLM integration
- **Cloud Integration**: Scalable cloud deployment
- **Mobile Support**: Mobile browser automation
- **Enterprise Features**: Advanced security and compliance

## 📚 **Documentation & Resources**

### **Technical Documentation**
- **API Reference**: Complete API documentation
- **Architecture Guide**: System design and implementation
- **Integration Guide**: Web-UI and external system integration
- **Performance Guide**: Optimization and tuning

### **Examples & Tutorials**
- **Getting Started**: Quick start guide
- **Use Cases**: Common automation scenarios
- **Advanced Features**: Complex automation patterns
- **Troubleshooting**: Common issues and solutions

## 🌟 **Community & Support**

### **Community Channels**
- **Discord**: Active community discussions
- **GitHub Issues**: Bug reports and feature requests
- **Discussions**: Community Q&A and sharing
- **Contributions**: Open source collaboration

### **Support Resources**
- **Documentation**: Comprehensive guides and references
- **Examples**: Working code examples and templates
- **Troubleshooting**: Common issues and solutions
- **Performance Tips**: Optimization and best practices

---

## 🎯 **Mission Statement**

**Enable AI to control browsers with enterprise-grade reliability, performance, and security.**

This enhanced browser-use system represents the next generation of AI browser automation, combining the power of Chrome with sophisticated AI capabilities to create a robust, scalable, and user-friendly automation platform.

---

<div align="center">
Made with ❤️ by the Enhanced Browser-Use Team
</div>
