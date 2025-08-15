#!/bin/bash
# Unified Environment Activation Script
# This script activates the single Python 3.11.9 environment for the entire project

echo "🔄 Activating unified Python environment..."
echo "📍 Project: Om_E_Web"
echo "🐍 Python: 3.11.9"
echo "📁 Environment: .venv/"

# Activate the virtual environment
source .venv/bin/activate

# Verify activation
echo ""
echo "✅ Environment activated successfully!"
echo "🐍 Python version: $(python --version)"
echo "📍 Virtual env: $VIRTUAL_ENV"
echo ""
echo "🚀 You can now run:"
echo "   • browser-use scripts from browser-use/ directory"
echo "   • web-ui scripts from web-ui/ directory"
echo "   • All dependencies are available in one environment"
echo ""
echo "💡 To deactivate: run 'deactivate'"








