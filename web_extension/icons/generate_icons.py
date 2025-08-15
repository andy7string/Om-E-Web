#!/usr/bin/env python3
"""
Generate PNG icons from SVG for Chrome extension.
Requires: pip install cairosvg
"""

import os
import sys

try:
    import cairosvg
except ImportError:
    print("cairosvg not found. Installing...")
    os.system("pip install cairosvg")
    try:
        import cairosvg
    except ImportError:
        print("Failed to install cairosvg. Please install manually:")
        print("pip install cairosvg")
        sys.exit(1)

def generate_icons():
    """Generate PNG icons from SVG."""
    svg_file = "icon.svg"
    
    if not os.path.exists(svg_file):
        print(f"SVG file {svg_file} not found!")
        return False
    
    sizes = [16, 48, 128]
    
    for size in sizes:
        png_file = f"icon{size}.png"
        print(f"Generating {png_file} ({size}x{size})...")
        
        try:
            cairosvg.svg2png(
                url=svg_file,
                write_to=png_file,
                output_width=size,
                output_height=size
            )
            print(f"✓ Created {png_file}")
        except Exception as e:
            print(f"✗ Failed to create {png_file}: {e}")
            return False
    
    return True

if __name__ == "__main__":
    print("Generating Chrome extension icons...")
    
    if generate_icons():
        print("\n✓ All icons generated successfully!")
        print("You can now load the extension in Chrome.")
    else:
        print("\n✗ Icon generation failed!")
        sys.exit(1)
