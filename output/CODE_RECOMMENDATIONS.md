# Code Recommendations for Om_E_Web

## 1. For ws_server.py - Prompt Generation

### Filter Unknown Action Types
```python
# In generate_llm_prompt() function
def should_include_action(action_data):
    """Filter out noise actions"""
    # Skip unknown action types
    if action_data.get('action_type') == 'unknown':
        return False

    # Skip hidden elements
    description = action_data.get('description', '')
    if 'display:none' in description or 'visibility:hidden' in description:
        return False

    # Skip CSS-heavy descriptions
    if description.startswith('.') and '{' in description:
        return False

    return True

# When building actions section
filtered_actions = {
    aid: data for aid, data in actions.items()
    if should_include_action(data)
}
```

### Add Page Layout Context
```python
def generate_page_context(url, actions):
    """Generate contextual description based on page type"""

    if 'google.com' in url and len(url.split('/')) <= 4:
        return """
## 🗺️ Page Layout Overview

This is Google's homepage - a minimalist search interface. The page has a top navigation bar with links to Gmail, Images, and account settings. The center features the Google logo above a search box with voice and image search options. Below the search box are two buttons: "Google Search" and "I'm Feeling Lucky". The bottom contains footer links for settings and information.
"""

    # Add more page-specific contexts
    return "## Page Layout\n\n[Standard page layout]"
```

### Group Actions by Location
```python
def group_actions_by_type(actions):
    """Group actions into logical sections"""

    groups = {
        'primary': [],     # Main CTAs
        'navigation': [],  # Nav links
        'forms': [],       # Input fields
        'settings': [],    # Settings/preferences
        'footer': []       # Footer links
    }

    for aid, data in actions.items():
        desc = data.get('description', '').lower()
        action_type = data.get('action_type', '')

        # Classification logic
        if 'search' in desc and action_type in ['button', 'submit', 'textarea']:
            groups['primary'].append((aid, data))
        elif action_type == 'link' and any(x in desc for x in ['gmail', 'images', 'maps']):
            groups['navigation'].append((aid, data))
        elif 'settings' in desc or 'privacy' in desc or 'terms' in desc:
            groups['settings'].append((aid, data))
        # ... more classification

    return groups
```

---

## 2. For content.js - Better Element Detection

### Improve Action Labeling
```javascript
function getElementLabel(element) {
    // Priority order for getting meaningful labels
    return element.getAttribute('aria-label') ||
           element.getAttribute('title') ||
           element.innerText?.trim().substring(0, 50) ||
           element.getAttribute('placeholder') ||
           element.getAttribute('name') ||
           element.value ||
           'Unlabeled element';
}
```

### Track Element Visibility
```javascript
function isElementVisible(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           element.offsetParent !== null &&
           style.opacity !== '0';
}

// When registering actions
if (!isElementVisible(element)) {
    actionData.visibility = 'hidden';
    actionData.skip_in_prompt = true;
}
```

### Filter Noise Elements
```javascript
function shouldRegisterElement(element) {
    // Skip style and script tags
    if (['STYLE', 'SCRIPT', 'LINK', 'META', 'NOSCRIPT'].includes(element.tagName)) {
        return false;
    }

    // Skip elements with no meaningful interaction
    if (!element.getAttribute('onclick') &&
        !element.getAttribute('href') &&
        !element.getAttribute('role') &&
        !['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) {
        return false;
    }

    // Skip very small elements (likely decorative)
    const rect = element.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) {
        return false;
    }

    return true;
}
```

---

## 3. For site_configs.json - Google-Specific Configuration

```json
{
  "google.com": {
    "name": "Google Search",
    "primary_selectors": {
      "search_box": "#APjFqb, textarea[name='q'], input[name='q']",
      "search_button": "input[name='btnK']",
      "lucky_button": "input[name='btnI']"
    },
    "action_groups": {
      "main_search": {
        "container": ".A8SBwf",
        "elements": ["search_box", "search_button", "lucky_button"]
      },
      "top_nav": {
        "container": "#gb",
        "selectors": ["a[data-pid]", ".gb_B"]
      }
    },
    "ignore_patterns": [
      ".csi",
      "[style*='display:none']",
      "[style*='visibility:hidden']",
      "link[rel]",
      "style",
      "meta",
      "[data-ved]button:not([name])"
    ],
    "element_labels": {
      ".XDyW0e": "Search by voice",
      ".nDcEnd": "Search by image",
      ".plR5qb": "AI Mode"
    }
  }
}
```

---

## 4. Extension Architecture Improvements

### Add Page Type Detection
```javascript
// In content.js
function detectPageType(url, elements) {
    const patterns = {
        'search_home': {
            urls: [/^https:\/\/(www\.)?google\.com\/?$/],
            required_elements: ['textarea[name="q"]', 'input[name="btnK"]']
        },
        'search_results': {
            urls: [/google\.com\/search/],
            required_elements: ['#search', '.g']
        },
        // ... more patterns
    };

    for (const [type, config] of Object.entries(patterns)) {
        if (config.urls.some(pattern => pattern.test(url))) {
            const hasElements = config.required_elements.every(
                sel => document.querySelector(sel)
            );
            if (hasElements) return type;
        }
    }
    return 'generic';
}
```

### Implement Action Priority
```javascript
function assignActionPriority(element, pageType) {
    const priorities = {
        'search_home': {
            'textarea[name="q"]': 1,
            'input[name="btnK"]': 2,
            'input[name="btnI"]': 3,
            // ... more
        }
    };

    // Return priority based on selector match
    // Lower number = higher priority
}
```

---

## 5. Testing Recommendations

### Unit Tests for Filtering
```python
# test_prompt_generation.py
def test_filter_unknown_actions():
    actions = {
        'a_id_1': {'action_type': 'button', 'description': 'Search'},
        'a_id_2': {'action_type': 'unknown', 'description': 'style'},
        'a_id_3': {'action_type': 'link', 'description': '.css{display:none}'}
    }

    filtered = filter_actions(actions)
    assert 'a_id_1' in filtered
    assert 'a_id_2' not in filtered
    assert 'a_id_3' not in filtered
```

### Integration Test
```javascript
// Test that Google homepage captures correct elements
describe('Google Homepage Extraction', () => {
    it('should capture primary search elements', () => {
        const actions = extractPageActions('https://google.com');

        expect(actions).toContainActionWithLabel('Search');
        expect(actions).toContainActionWithLabel('Google Search');
        expect(actions).toContainActionWithLabel("I'm Feeling Lucky");
        expect(actions).not.toContainActionType('unknown');
    });
});
```

---

## Implementation Priority

1. **High Priority** (Immediate impact)
   - Filter unknown action types in ws_server.py
   - Improve element labeling in content.js
   - Add visibility tracking

2. **Medium Priority** (Better UX)
   - Implement action grouping
   - Add page type detection
   - Create page-specific configs

3. **Low Priority** (Nice to have)
   - Action priority system
   - Dynamic element monitoring
   - Advanced filtering rules

---

## Expected Improvements

After implementing these changes:
- **Reduction in noise:** ~40% fewer irrelevant actions
- **Better organization:** Logical grouping of related actions
- **Clearer prompts:** Context-aware descriptions
- **Improved LLM performance:** More accurate action selection