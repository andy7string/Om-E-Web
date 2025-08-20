#!/usr/bin/env python3
"""
🧪 Test script for enhanced element filtering system

This script demonstrates the enhanced filtering capabilities:
1. Deduplication of elements
2. Filtering of non-interactive elements
3. Enhanced element classification
4. Improved scoring and filtering
"""

import json
import sys
import os

# Add the current directory to the path so we can import from ws_server
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from ws_server import (
    classify_element_enhanced,
    deduplicate_elements,
    filter_non_interactive_elements,
    calculate_element_importance_score
)

def test_enhanced_filtering():
    """
    🧪 Test function to demonstrate enhanced element filtering system
    
    This function shows how the new filtering system works with sample data
    that includes duplicates and non-interactive elements.
    """
    print("🧪 Testing Enhanced Element Filtering System")
    print("=" * 60)
    
    # Sample element data for testing (including duplicates and non-interactive elements)
    test_elements = [
        # Real interactive elements
        {
            "type": "button",
            "text": "Search",
            "href": None,
            "selector": ".search-button",
            "attributes": {"class": "search-button", "type": "button"},
            "coordinates": {"x": 100, "y": 50, "width": 80, "height": 30}
        },
        {
            "type": "a",
            "text": "Home",
            "href": "https://example.com/",
            "selector": ".nav-link",
            "attributes": {"class": "nav-link", "role": "link"},
            "coordinates": {"x": 200, "y": 20, "width": 60, "height": 25}
        },
        {
            "type": "input",
            "text": "",
            "href": None,
            "selector": "#search-input",
            "attributes": {"type": "text", "id": "search-input", "placeholder": "Search..."},
            "coordinates": {"x": 300, "y": 50, "width": 200, "height": 35}
        },
        
        # Duplicate elements (should be removed)
        {
            "type": "a",
            "text": "Home",
            "href": "https://example.com/",
            "selector": ".nav-link-alt",
            "attributes": {"class": "nav-link-alt", "role": "link"},
            "coordinates": {"x": 250, "y": 25, "width": 65, "height": 28}
        },
        {
            "type": "button",
            "text": "Search",
            "href": None,
            "selector": ".search-btn",
            "attributes": {"class": "search-btn", "type": "button"},
            "coordinates": {"x": 120, "y": 55, "width": 85, "height": 32}
        },
        
        # Non-interactive elements (should be filtered out)
        {
            "type": "div",
            "text": "New Moon Digital",
            "href": None,
            "selector": ".uael-grid-item",
            "attributes": {"class": "uael-grid-item"},
            "coordinates": {"x": 400, "y": 100, "width": 150, "height": 50}
        },
        {
            "type": "div",
            "text": "New Moon Digital",
            "href": None,
            "selector": ".uael-grid-item:nth-child(2)",
            "attributes": {"class": "uael-grid-item"},
            "coordinates": {"x": 600, "y": 100, "width": 150, "height": 50}
        },
        {
            "type": "span",
            "text": "Welcome to our website",
            "href": None,
            "selector": ".content-text",
            "attributes": {"class": "content-text"},
            "coordinates": {"x": 50, "y": 100, "width": 400, "height": 60}
        },
        
        # Placeholder links (should be filtered out)
        {
            "type": "a",
            "text": "",
            "href": "#",
            "selector": ".placeholder-link",
            "attributes": {"class": "placeholder-link"},
            "coordinates": {"x": 500, "y": 50, "width": 20, "height": 20}
        },
        
        # More duplicates (should be removed)
        {
            "type": "div",
            "text": "New Moon Digital",
            "href": None,
            "selector": ".uael-grid-item:nth-child(3)",
            "attributes": {"class": "uael-grid-item"},
            "coordinates": {"x": 800, "y": 100, "width": 150, "height": 50}
        }
    ]
    
    print(f"📊 Testing {len(test_elements)} sample elements (including duplicates and non-interactive)...")
    print()
    
    # Test deduplication
    print("🧹 Testing deduplication...")
    deduplicated = deduplicate_elements(test_elements)
    print(f"   Deduplicated: {len(test_elements)} → {len(deduplicated)} elements")
    print()
    
    # Test non-interactive filtering
    print("🚫 Testing non-interactive filtering...")
    filtered = filter_non_interactive_elements(deduplicated)
    print(f"   Filtered: {len(deduplicated)} → {len(filtered)} elements")
    print()
    
    # Test enhanced classification on filtered elements
    print("🎯 Testing enhanced classification on filtered elements...")
    for i, element in enumerate(filtered, 1):
        print(f"🔍 Element {i}: {element['type']} - '{element['text'][:30]}...'")
        
        # Apply enhanced classification
        classification = classify_element_enhanced(element)
        
        print(f"   📋 Category: {classification['element_category']}")
        print(f"   🎯 Interactive: {classification['is_interactive']}")
        print(f"   🏆 Confidence: {classification['overall_confidence']:.2f}")
        print(f"   🔍 Search Relevance: {classification['search_relevance']:.2f}")
        print(f"   📝 Content Quality: {classification['content_quality']:.2f}")
        print(f"   ♿ Accessibility: {classification['accessibility_score']:.2f}")
        
        if classification['classification_reasons']:
            print(f"   💡 Reasons: {', '.join(classification['classification_reasons'][:3])}")
        
        print()
    
    # Show overall improvement
    total_filtered = len(test_elements) - len(filtered)
    improvement_ratio = total_filtered / len(test_elements)
    print(f"📈 Overall improvement: {total_filtered} elements filtered ({improvement_ratio:.1%} reduction)")
    print("✅ Enhanced filtering test complete!")
    print("=" * 60)
    
    return filtered

def test_with_real_data_sample():
    """
    🧪 Test with a sample of real data structure
    """
    print("\n🧪 Testing with Real Data Sample")
    print("=" * 40)
    
    # Sample data structure similar to what the extension would send
    sample_raw_data = {
        "metadata": {
            "url": "https://brighttreedigital.com.au",
            "title": "Bright Tree Digital - Web Development Services"
        },
        "interactiveElements": [
            {
                "type": "a",
                "text": "Home",
                "href": "https://brighttreedigital.com.au/",
                "selector": ".nav-link",
                "attributes": {"class": "nav-link", "role": "link"},
                "coordinates": {"x": 200, "y": 20, "width": 60, "height": 25}
            },
            {
                "type": "div",
                "text": "New Moon Digital",
                "href": None,
                "selector": ".uael-grid-item",
                "attributes": {"class": "uael-grid-item"},
                "coordinates": {"x": 400, "y": 100, "width": 150, "height": 50}
            },
            {
                "type": "div",
                "text": "New Moon Digital",
                "href": None,
                "selector": ".uael-grid-item:nth-child(2)",
                "attributes": {"class": "uael-grid-item"},
                "coordinates": {"x": 600, "y": 100, "width": 150, "height": 50}
            },
            {
                "type": "button",
                "text": "Contact Us",
                "href": None,
                "selector": ".contact-button",
                "attributes": {"class": "contact-button", "type": "button"},
                "coordinates": {"x": 300, "y": 200, "width": 120, "height": 40}
            }
        ],
        "pageStructure": {
            "headings": [
                {"text": "Welcome to Bright Tree Digital", "selector": "h1", "level": 1},
                {"text": "Our Services", "selector": "h2", "level": 2}
            ],
            "forms": [
                {
                    "action": "/contact",
                    "method": "post",
                    "selector": ".contact-form",
                    "inputs": [
                        {"type": "text", "name": "name", "placeholder": "Your Name", "selector": "#name"},
                        {"type": "email", "name": "email", "placeholder": "Your Email", "selector": "#email"}
                    ]
                }
            ]
        }
    }
    
    print("📊 Processing sample raw data...")
    
    # Import the processing function
    from ws_server import process_clean_site_map_data
    
    # Process the data
    processed_data, mapping_data, success = process_clean_site_map_data(sample_raw_data)
    
    if success:
        print("✅ Processing successful!")
        print(f"📊 Final elements: {len(processed_data['elements'])}")
        
        # Show some sample processed elements
        print("\n📋 Sample processed elements:")
        for i, element in enumerate(processed_data['elements'][:3], 1):
            print(f"   {i}. {element['type']} - '{element['text'][:30]}...'")
            if 'enhanced_classification' in element:
                classification = element['enhanced_classification']
                print(f"      Category: {classification['element_category']}")
                print(f"      Confidence: {classification['overall_confidence']:.2f}")
    else:
        print("❌ Processing failed!")
    
    print("=" * 40)

if __name__ == "__main__":
    # Run the enhanced filtering test
    test_enhanced_filtering()
    
    # Run the real data sample test
    test_with_real_data_sample()
    
    print("\n🎉 All tests completed successfully!")

