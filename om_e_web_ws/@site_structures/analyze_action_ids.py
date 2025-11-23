#!/usr/bin/env python3
"""
Analyze action ID delta between llm_prompt.md and raw_page.html
"""
import re
from collections import Counter, defaultdict

def extract_action_ids_from_prompt(prompt_path):
    """Extract all action IDs from llm_prompt.md"""
    with open(prompt_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Match patterns like: return (a_id_1_123) or return (a_id_2_456,{...})
    pattern = r'\(a_id_\d+_\d+(?:,|\))'
    matches = re.findall(pattern, content)

    # Clean up to just get the action ID
    action_ids = [m.replace('(', '').replace(')', '').replace(',', '') for m in matches]

    return action_ids

def extract_action_ids_from_html(html_path):
    """Extract all data-ome-action-id attributes from raw HTML"""
    with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    # Match: data-ome-action-id="a_id_1_123"
    pattern = r'data-ome-action-id="(a_id_\d+_\d+)"'
    matches = re.findall(pattern, content)

    return matches

def analyze_action_ids(prompt_path, html_path):
    """Compare action IDs between llm_prompt and raw HTML"""

    print("=" * 80)
    print("ACTION ID DELTA ANALYSIS")
    print("=" * 80)
    print()

    # Extract action IDs
    print("📖 Reading llm_prompt.md...")
    prompt_ids = extract_action_ids_from_prompt(prompt_path)
    print(f"   Found {len(prompt_ids)} action IDs in llm_prompt.md")

    print("📖 Reading raw_page.html...")
    html_ids = extract_action_ids_from_html(html_path)
    print(f"   Found {len(html_ids)} action IDs in raw_page.html")
    print()

    # Convert to sets for comparison
    prompt_set = set(prompt_ids)
    html_set = set(html_ids)

    # Count by scan number
    def get_scan_number(action_id):
        parts = action_id.split('_')
        return int(parts[2]) if len(parts) > 2 else 0

    prompt_by_scan = Counter(get_scan_number(aid) for aid in prompt_ids)
    html_by_scan = Counter(get_scan_number(aid) for aid in html_ids)

    print("📊 ACTION ID COUNTS BY SCAN")
    print("-" * 80)
    print(f"llm_prompt.md:")
    for scan in sorted(prompt_by_scan.keys()):
        print(f"  Scan {scan} (a_id_{scan}_*): {prompt_by_scan[scan]} actions")
    print(f"  TOTAL: {len(prompt_ids)} actions ({len(prompt_set)} unique)")
    print()

    print(f"raw_page.html:")
    for scan in sorted(html_by_scan.keys()):
        print(f"  Scan {scan} (a_id_{scan}_*): {html_by_scan[scan]} actions")
    print(f"  TOTAL: {len(html_ids)} actions ({len(html_set)} unique)")
    print()

    # Find delta
    in_prompt_not_html = prompt_set - html_set
    in_html_not_prompt = html_set - prompt_set
    in_both = prompt_set & html_set

    print("🔍 DELTA ANALYSIS")
    print("-" * 80)
    print(f"✅ In BOTH:                  {len(in_both)} action IDs")
    print(f"⚠️  In llm_prompt ONLY:       {len(in_prompt_not_html)} action IDs (STALE - not on page)")
    print(f"❌ In raw_page ONLY:         {len(in_html_not_prompt)} action IDs (MISSING from prompt)")
    print()

    # Show duplicates in llm_prompt
    prompt_duplicates = [(aid, count) for aid, count in Counter(prompt_ids).items() if count > 1]
    if prompt_duplicates:
        print("⚠️  DUPLICATES IN llm_prompt.md:")
        print("-" * 80)
        for aid, count in sorted(prompt_duplicates, key=lambda x: x[1], reverse=True)[:10]:
            print(f"  {aid}: appears {count} times")
        if len(prompt_duplicates) > 10:
            print(f"  ... and {len(prompt_duplicates) - 10} more")
        print()

    # Show stale elements (in prompt but not on page)
    if in_prompt_not_html:
        print("⚠️  STALE ACTION IDs (in llm_prompt but NOT on current page):")
        print("-" * 80)
        stale_by_scan = defaultdict(list)
        for aid in in_prompt_not_html:
            scan = get_scan_number(aid)
            stale_by_scan[scan].append(aid)

        for scan in sorted(stale_by_scan.keys()):
            print(f"  Scan {scan}: {len(stale_by_scan[scan])} stale actions")
            print(f"    Examples: {', '.join(stale_by_scan[scan][:5])}")
        print()

    # Show missing elements (on page but not in prompt)
    if in_html_not_prompt:
        print("❌ MISSING ACTION IDs (on page but NOT in llm_prompt):")
        print("-" * 80)
        missing_by_scan = defaultdict(list)
        for aid in in_html_not_prompt:
            scan = get_scan_number(aid)
            missing_by_scan[scan].append(aid)

        for scan in sorted(missing_by_scan.keys()):
            print(f"  Scan {scan}: {len(missing_by_scan[scan])} missing actions")
            print(f"    Examples: {', '.join(missing_by_scan[scan][:5])}")
        print()

    # Summary
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)

    if len(prompt_by_scan) > 1:
        print("🚨 ISSUE DETECTED: Multiple scan versions in llm_prompt.md")
        print("   This indicates accumulation across scans is happening.")
        print()

    if prompt_duplicates:
        print(f"🚨 ISSUE DETECTED: {len(prompt_duplicates)} duplicate action IDs in llm_prompt.md")
        print("   Same action ID appearing multiple times with different labels.")
        print()

    if in_prompt_not_html:
        print(f"🚨 ISSUE DETECTED: {len(in_prompt_not_html)} stale action IDs")
        print("   Elements from previous scans still in llm_prompt but not on current page.")
        print()

    if in_html_not_prompt:
        print(f"⚠️  WARNING: {len(in_html_not_prompt)} action IDs on page but not extracted")
        print("   Possible under-extraction issue.")
        print()

    if not (prompt_duplicates or in_prompt_not_html or len(prompt_by_scan) > 1):
        print("✅ No major issues detected!")
        print()

if __name__ == "__main__":
    prompt_path = "llm_prompt.md"
    html_path = "raw_page.html"

    analyze_action_ids(prompt_path, html_path)
