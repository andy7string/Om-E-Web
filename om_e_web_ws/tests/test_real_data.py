#!/usr/bin/env python3
"""
Test enhanced classification on real data
"""

import json
from ws_server import enhanced_element_classification

def test_real_data():
    """Test enhanced classification on real website data"""
    print("🧪 Testing enhanced classification on real data...")
    
    # Load the real data
    with open('@site_structures/brighttreedigital.com.au_processed_cleaned.jsonl', 'r') as f:
        data = json.load(f)
    
    elements = data.get('elements', [])
    print(f"📊 Testing on {len(elements)} real elements from brighttreedigital.com.au")
    
    # Test first 15 elements
    test_elements = elements[:15]
    results = []
    
    for i, element in enumerate(test_elements):
        text = element.get('text', 'No text')[:40]
        enhanced = enhanced_element_classification(element)
        
        if enhanced:
            print(f"✅ Element {i+1}: '{text}'...")
            print(f"   🏷️ Classification: {enhanced['classification']}")
            print(f"   🎯 Confidence: {enhanced['confidence_score']:.2f}")
            print(f"   🧠 Context: {enhanced['semantic_context']}")
            results.append(True)
        else:
            print(f"❌ Element {i+1}: '{text}'... - FILTERED")
            results.append(False)
    
    kept_count = sum(results)
    total_count = len(results)
    filtering_ratio = (total_count - kept_count) / total_count * 100
    
    print(f"\n📊 Results Summary:")
    print(f"   🔍 Elements tested: {total_count}")
    print(f"   ✅ Elements kept: {kept_count}")
    print(f"   ❌ Elements filtered: {total_count - kept_count}")
    print(f"   📉 Filtering ratio: {filtering_ratio:.1f}%")
    
    # Show some examples of what was kept vs filtered
    print(f"\n🎯 Examples of kept elements:")
    kept_examples = []
    filtered_examples = []
    
    for i, element in enumerate(test_elements):
        enhanced = enhanced_element_classification(element)
        text = element.get('text', 'No text')[:30]
        
        if enhanced:
            if len(kept_examples) < 3:
                kept_examples.append(f"'{text}' ({enhanced['classification']})")
        else:
            if len(filtered_examples) < 3:
                filtered_examples.append(f"'{text}'")
    
    for example in kept_examples:
        print(f"   ✅ {example}")
    
    print(f"\n🚫 Examples of filtered elements:")
    for example in filtered_examples:
        print(f"   ❌ {example}")

if __name__ == "__main__":
    test_real_data()
