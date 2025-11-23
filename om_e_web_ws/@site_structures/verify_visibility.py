#!/usr/bin/env python3
"""
Verify visibility filtering by extracting and analyzing HTML elements
"""
import re
from bs4 import BeautifulSoup

def extract_action_ids_from_prompt(prompt_path):
    """Extract all action IDs from llm_prompt.md"""
    with open(prompt_path, 'r', encoding='utf-8') as f:
        content = f.read()

    pattern = r'\(a_id_\d+_\d+(?:,|\))'
    matches = re.findall(pattern, content)
    action_ids = [m.replace('(', '').replace(')', '').replace(',', '') for m in matches]

    return list(set(action_ids))  # Unique IDs only

def analyze_element_visibility(element):
    """Analyze if element appears visible based on HTML attributes/styles"""

    # Check inline style
    style = element.get('style', '')

    # Check for hidden attributes
    checks = {
        'display:none': 'display: none' in style or 'display:none' in style,
        'visibility:hidden': 'visibility: hidden' in style or 'visibility:hidden' in style,
        'opacity:0': 'opacity: 0' in style or 'opacity:0' in style,
        'hidden attribute': element.has_attr('hidden'),
        'aria-hidden': element.get('aria-hidden') == 'true',
        'zero width': 'width: 0' in style or 'width:0' in style,
        'zero height': 'height: 0' in style or 'height:0' in style,
    }

    # Check class names for common hidden patterns
    class_name = ' '.join(element.get('class', []))
    hidden_classes = ['hidden', 'hide', 'invisible', 'collapsed', 'offscreen']
    has_hidden_class = any(hc in class_name.lower() for hc in hidden_classes)

    checks['hidden class'] = has_hidden_class

    is_likely_hidden = any(checks.values())

    return {
        'is_likely_hidden': is_likely_hidden,
        'checks': checks,
        'style': style,
        'class': class_name
    }

def extract_and_analyze_elements(prompt_path, html_path, output_path):
    """Extract elements from HTML and analyze their visibility"""

    print("=" * 80)
    print("VISIBILITY VERIFICATION ANALYSIS")
    print("=" * 80)
    print()

    # Load action IDs from llm_prompt
    print("📖 Reading llm_prompt.md...")
    action_ids = extract_action_ids_from_prompt(prompt_path)
    print(f"   Found {len(action_ids)} unique action IDs")
    print()

    # Load HTML
    print("📖 Parsing raw_page.html...")
    with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    print("   HTML parsed successfully")
    print()

    # Extract and analyze each element
    results = []
    visible_count = 0
    hidden_count = 0
    not_found_count = 0

    print("🔍 Analyzing elements...")
    for action_id in action_ids:
        # Find element by data-ome-action-id
        element = soup.find(attrs={'data-ome-action-id': action_id})

        if not element:
            not_found_count += 1
            results.append({
                'action_id': action_id,
                'found': False,
                'status': 'NOT_FOUND'
            })
            continue

        # Analyze visibility
        visibility = analyze_element_visibility(element)

        # Get element info
        tag = element.name
        text = element.get_text(strip=True)[:100]  # First 100 chars
        href = element.get('href', '')
        aria_label = element.get('aria-label', '')

        status = 'HIDDEN' if visibility['is_likely_hidden'] else 'VISIBLE'

        if visibility['is_likely_hidden']:
            hidden_count += 1
        else:
            visible_count += 1

        results.append({
            'action_id': action_id,
            'found': True,
            'status': status,
            'tag': tag,
            'text': text,
            'href': href,
            'aria_label': aria_label,
            'visibility': visibility
        })

    print(f"   Analyzed {len(action_ids)} elements")
    print()

    # Summary
    print("📊 VISIBILITY SUMMARY")
    print("-" * 80)
    print(f"✅ VISIBLE elements:   {visible_count} ({visible_count/len(action_ids)*100:.1f}%)")
    print(f"❌ HIDDEN elements:    {hidden_count} ({hidden_count/len(action_ids)*100:.1f}%)")
    print(f"⚠️  NOT FOUND:          {not_found_count} ({not_found_count/len(action_ids)*100:.1f}%)")
    print()

    # Show hidden elements (if any)
    hidden_elements = [r for r in results if r.get('status') == 'HIDDEN']
    if hidden_elements:
        print("⚠️  HIDDEN ELEMENTS THAT WERE EXTRACTED:")
        print("-" * 80)
        for elem in hidden_elements[:10]:
            print(f"\n{elem['action_id']} ({elem['tag']}):")
            print(f"  Text: {elem['text']}")
            if elem['href']:
                print(f"  Href: {elem['href']}")
            print(f"  Reasons hidden:")
            for check, is_true in elem['visibility']['checks'].items():
                if is_true:
                    print(f"    - {check}")

        if len(hidden_elements) > 10:
            print(f"\n  ... and {len(hidden_elements) - 10} more hidden elements")
        print()

    # Show sample visible elements
    visible_elements = [r for r in results if r.get('status') == 'VISIBLE']
    if visible_elements:
        print("✅ SAMPLE VISIBLE ELEMENTS:")
        print("-" * 80)
        for elem in visible_elements[:10]:
            print(f"\n{elem['action_id']} ({elem['tag']}):")
            print(f"  Text: {elem['text']}")
            if elem['href']:
                print(f"  Href: {elem['href']}")
            if elem['aria_label']:
                print(f"  Aria: {elem['aria_label']}")
        print()

    # Write detailed results to file
    print(f"💾 Writing detailed analysis to {output_path}...")
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("# Visibility Verification Report\n\n")
        f.write(f"Total elements analyzed: {len(action_ids)}\n")
        f.write(f"Visible: {visible_count} ({visible_count/len(action_ids)*100:.1f}%)\n")
        f.write(f"Hidden: {hidden_count} ({hidden_count/len(action_ids)*100:.1f}%)\n")
        f.write(f"Not found: {not_found_count} ({not_found_count/len(action_ids)*100:.1f}%)\n\n")

        f.write("## Hidden Elements\n\n")
        for elem in hidden_elements:
            f.write(f"### {elem['action_id']}\n")
            f.write(f"- Tag: {elem['tag']}\n")
            f.write(f"- Text: {elem['text']}\n")
            if elem['href']:
                f.write(f"- Href: {elem['href']}\n")
            f.write(f"- Hidden reasons:\n")
            for check, is_true in elem['visibility']['checks'].items():
                if is_true:
                    f.write(f"  - {check}\n")
            if elem['visibility']['style']:
                f.write(f"- Style: {elem['visibility']['style']}\n")
            if elem['visibility']['class']:
                f.write(f"- Class: {elem['visibility']['class']}\n")
            f.write("\n")

        f.write("\n## Visible Elements (sample)\n\n")
        for elem in visible_elements[:50]:
            f.write(f"### {elem['action_id']}\n")
            f.write(f"- Tag: {elem['tag']}\n")
            f.write(f"- Text: {elem['text']}\n")
            if elem['href']:
                f.write(f"- Href: {elem['href']}\n")
            if elem['aria_label']:
                f.write(f"- Aria: {elem['aria_label']}\n")
            f.write("\n")

    print(f"✅ Analysis complete! Results written to {output_path}")
    print()

    # Final verdict
    print("=" * 80)
    print("VERDICT")
    print("=" * 80)

    if hidden_count == 0:
        print("✅ PERFECT! All extracted elements appear to be visible.")
        print("   The visibility filter is working correctly.")
    elif hidden_count < visible_count * 0.1:  # Less than 10% hidden
        print(f"✅ GOOD! Only {hidden_count} hidden elements ({hidden_count/len(action_ids)*100:.1f}%).")
        print("   The visibility filter is working well with minor edge cases.")
    else:
        print(f"⚠️  WARNING! {hidden_count} hidden elements ({hidden_count/len(action_ids)*100:.1f}%).")
        print("   The visibility filter may need improvement.")

    print()

if __name__ == "__main__":
    prompt_path = "llm_prompt.md"
    html_path = "raw_page.html"
    output_path = "visibility_analysis.md"

    extract_and_analyze_elements(prompt_path, html_path, output_path)
