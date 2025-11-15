# YouTube Prompt Generation Improvements

## Current State Analysis

### What's Working
- ✅ Search inputs are properly prioritized
- ✅ Navigation menu items are detected and grouped
- ✅ Account menu items are detected
- ✅ Footer menu items are detected
- ✅ Actions are deduplicated and ordered by DOM index

### What's Missing (Based on Screenshot vs Current Output)

#### 1. **Section-Based Organization**
- **Problem**: `page.jsonl` contains rich section information (`section-0`, `section-1`, `section-2`, etc.) with parent-child relationships, but `generate_llm_prompt()` ignores this structure
- **Impact**: All videos, Shorts, channels, and content are dumped into "Other Actions" without context
- **Evidence**: Screenshot shows clear sections (Sidebar, Top Bar, Category Filters, Featured Videos, Shorts), but prompt shows flat list

#### 2. **YouTube-Specific Content Types**
- **Problem**: No detection for:
  - **Shorts** (vertical videos, `/shorts/` URLs, "Shorts" section headers)
  - **Regular Videos** (watch URLs, video titles)
  - **Channels** (channel URLs like `/@channelname`, channel names)
  - **Category Filters** (horizontal filter chips like "All", "Podcasts", "AI", "Music")
- **Impact**: LLM can't distinguish between different content types or understand page structure

#### 3. **Navigation vs Content Separation**
- **Problem**: Navigation sidebar items are mixed with main content
- **Impact**: Hard to understand page hierarchy and where actions are located

#### 4. **Subscription Channels**
- **Problem**: Subscribed channels in sidebar are not grouped separately
- **Impact**: Can't easily identify "my subscriptions" vs other navigation

## Proposed Improvements

### Improvement 1: Leverage Section Hierarchy

**Current Code** (lines 1100-1142 in `ws_server.py`):
- Reads `page.jsonl` but only extracts action records
- Ignores `section` records and parent relationships

**Proposed Change**:
```python
# Build section hierarchy while reading page.jsonl
sections = {}  # section_id -> section_info
section_children = {}  # section_id -> [child_section_ids]
section_actions = {}  # section_id -> [action_records]

for line in f:
    rec = json.loads(line)
    if rec.get('type') == 'section':
        section_id = rec.get('id')
        sections[section_id] = rec
        parent_id = rec.get('parent')
        if parent_id:
            if parent_id not in section_children:
                section_children[parent_id] = []
            section_children[parent_id].append(section_id)
    elif rec.get('type') == 'action':
        # Track which section this action belongs to
        # (need to track current section context or use parent field)
```

### Improvement 2: YouTube-Specific Content Detection

**Add Detection Functions**:
```python
def _is_youtube_short(href: str, label: str, record: Dict) -> bool:
    """Detect YouTube Shorts"""
    if not href:
        return False
    return (
        '/shorts/' in href or
        'shortsLockupViewModelHostEndpoint' in record.get('attributes', {}).get('cssClasses', []) or
        label.lower() == 'shorts'
    )

def _is_youtube_video(href: str, label: str) -> bool:
    """Detect regular YouTube videos"""
    if not href:
        return False
    return '/watch' in href and '/shorts/' not in href

def _is_youtube_channel(href: str, label: str) -> bool:
    """Detect YouTube channel links"""
    if not href:
        return False
    return '/@' in href or '/channel/' in href or '/user/' in href

def _is_category_filter(label: str, record: Dict) -> bool:
    """Detect category filter chips"""
    # Category filters are typically buttons/chips in a horizontal row
    # Common labels: "All", "Podcasts", "AI", "Music", "Gaming", etc.
    category_keywords = ['all', 'podcasts', 'ai', 'music', 'gaming', 'mixes', 
                        'live', 'test drives', 'rock', 'mythology', 'nature', 
                        'blues', 'gadgets', 'folk', 'animated', 'recently uploaded']
    label_lower = label.lower()
    # Check if it's a button/chip in the filter area
    tag = (record.get('tag') or '').lower()
    role = (record.get('attributes', {}).get('role') or '').lower()
    is_chip = tag == 'button' or role == 'tab' or 'chip' in str(record.get('attributes', {}).get('cssClasses', [])).lower()
    return is_chip and any(keyword in label_lower for keyword in category_keywords)
```

### Improvement 3: Enhanced Grouping Logic

**New Grouping Structure**:
```python
# YouTube-specific groups
youtube_groups = {
    'Top Bar': [],  # Search, Create, Notifications, Account
    'Navigation Sidebar': [],  # Home, Shorts, Subscriptions, etc.
    'Subscriptions': [],  # Subscribed channels
    'Category Filters': [],  # All, Podcasts, AI, Music, etc.
    'Featured Videos': [],  # First row of videos
    'Shorts': [],  # Shorts section
    'Videos': [],  # Regular video content
    'Channels': [],  # Channel links in content area
    'Footer Menu': []  # About, Terms, Privacy, etc.
}
```

### Improvement 4: Section-Aware Prompt Generation

**Enhanced Prompt Structure**:
```markdown
# YouTube

**URL:** https://www.youtube.com/

## Actions

### Top Bar
- return (a_id_363,{yourValue}) to set value for 'Search'. Add submit:true to submit.
- return (a_id_367) to click 'Search with your voice'
- return (a_id_368) to click 'Create'
- return (a_id_369) to interact with '9+' (Notifications)
- return (a_id_371) to click 'Account menu'

### Navigation Sidebar
- return (a_id_374) to click 'Home'
- return (a_id_22) to navigate to 'Shorts'
- return (a_id_23) to navigate to 'Subscriptions'
- return (a_id_24) to navigate to 'YouTube Music'
- return (a_id_25) to navigate to 'You'
- return (a_id_26) to navigate to 'Downloads'

### Subscriptions
- return (a_id_439) to navigate to 'Peppa Pig - Official Channel'
- return (a_id_440) to navigate to 'BattleBots'
- return (a_id_441) to navigate to 'Emily's Playhouse - Learning Videos for Kids'
- return (a_id_442) to navigate to 'Net Ninja'
- return (a_id_443) to navigate to 'Cristina Gomez'
- return (a_id_444) to navigate to 'Julia McCoy'

### Category Filters
- return (a_id_XXX) to click 'All'
- return (a_id_XXX) to click 'Podcasts'
- return (a_id_XXX) to click 'AI'
- return (a_id_XXX) to click 'Music'
- return (a_id_XXX) to click 'Gaming'
- ... (etc)

### Featured Videos
- return (a_id_417) to navigate to 'Claude Code 2.0 + Sonnet 4.5 (Complete Tutorial)'
- return (a_id_418) to navigate to 'Chris Akrigg: Up & Over | Whyte Kado RSX'
- return (a_id_419) to navigate to 'Full endurance workout for shredders'
- return (a_id_420) to navigate to 'Easiest Reinforcement Learning Explanation You'll Ever See! 🤖'

### Shorts
- return (a_id_457) to navigate to 'What exactly is the black goo in Prometheus? #movie #scifi #moviebreakdown #xenomorphs #alien'
- return (a_id_XXX) to navigate to 'I'll get ready faster next time 😳'
- ... (more shorts)

### Videos
- return (a_id_421) to navigate to 'LEAK: Anthropic has revealed Claude's internal prompt!! (and it changes EVERYTHING)'
- return (a_id_422) to navigate to 'Cursor Full Guide To AI Coding Apps'
- ... (more videos)

### Channels
- return (a_id_27) to navigate to 'Leon van Zyl'
- return (a_id_28) to navigate to 'Whyte Bikes'
- return (a_id_29) to navigate to 'Thomas Polychuck'
- ... (more channels)

### Footer Menu
- return (a_id_445) to navigate to 'About'
- return (a_id_452) to navigate to 'Terms'
- return (a_id_453) to navigate to 'Privacy'
- ... (etc)
```

## Implementation Plan

### Phase 1: Section Tracking
1. Modify `generate_llm_prompt()` to build section hierarchy while reading `page.jsonl`
2. Track which actions belong to which sections
3. Use section labels/selectors to identify section types

### Phase 2: YouTube-Specific Detection
1. Add detection functions for Shorts, Videos, Channels, Category Filters
2. Integrate with existing menu detection logic
3. Test with current YouTube page structure

### Phase 3: Enhanced Grouping
1. Create YouTube-specific grouping logic
2. Preserve DOM order within each group
3. Handle edge cases (mixed content, dynamic sections)

### Phase 4: Site Config Integration
1. Add YouTube-specific grouping rules to `site_configs.json`
2. Make grouping logic extensible for other sites
3. Document pattern for adding site-specific grouping

## Code Changes Required

### File: `om_e_web_ws/ws_server.py`

**Function to Modify**: `generate_llm_prompt()` (starts at line 1083)

**Key Changes**:
1. **Add section tracking** (around line 1104):
   ```python
   sections = {}
   section_actions = defaultdict(list)
   current_section_id = None
   ```

2. **Process sections while reading** (around line 1106):
   ```python
   if rec.get('type') == 'section':
       section_id = rec.get('id')
       sections[section_id] = rec
   elif rec.get('type') == 'action':
       # Determine which section this action belongs to
       # (could use parent field or track current section)
   ```

3. **Add YouTube detection functions** (before `generate_llm_prompt`):
   ```python
   def _detect_youtube_content_type(href, label, record):
       """Detect YouTube-specific content types"""
       # Implementation as shown above
   ```

4. **Enhance grouping logic** (around line 1187):
   ```python
   # Add YouTube-specific groups
   youtube_groups = {...}
   # Use section information + content type detection
   ```

5. **Update prompt generation** (around line 1255):
   ```python
   # Generate sections based on detected groups
   # Use section labels when available
   ```

## Benefits

1. **Better LLM Understanding**: Clear page structure helps LLM understand context
2. **Easier Navigation**: Grouped actions make it easier to find what you need
3. **Scalable**: Pattern can be applied to other sites (Gmail, Wikipedia, etc.)
4. **Maintainable**: Site-specific logic can be moved to `site_configs.json`
5. **User-Friendly**: More intuitive prompt structure for both humans and LLMs

## Testing Strategy

1. **Test with current YouTube homepage**: Verify all sections are properly identified
2. **Test with YouTube video page**: Ensure different page types work
3. **Test with other sites**: Ensure generic sites still work correctly
4. **Test edge cases**: Empty sections, mixed content, dynamic loading

## Next Steps

1. Review and approve this plan
2. Implement Phase 1 (Section Tracking)
3. Test and iterate
4. Implement Phase 2 (YouTube Detection)
5. Continue through phases
6. Update documentation


