# Google

**URL:** https://www.google.com/
**Timestamp:** 2025-12-07 22:07:00

**Tabs (1):** Active: #1138036260 "Google" www.google.com [loading]

## Available Actions

The following pre-configured actions are available for this page:

**ScrollDown** - Scroll down one page
  - Scrolls the viewport down by one screen height
  - Usage: `python3 test_navigation.py --command capability --capability ScrollDown`

**ScrollUp** - Scroll up one page
  - Scrolls the viewport up by one screen height
  - Usage: `python3 test_navigation.py --command capability --capability ScrollUp`

**ScrollLeft** - Scroll left one page
  - Scrolls the viewport left by one screen width
  - Usage: `python3 test_navigation.py --command capability --capability ScrollLeft`

**ScrollRight** - Scroll right one page
  - Scrolls the viewport right by one screen width
  - Usage: `python3 test_navigation.py --command capability --capability ScrollRight`

**ScrollTop** - Scroll to top of page
  - Scrolls to the very top of the page
  - Usage: `python3 test_navigation.py --command capability --capability ScrollTop`

**ScrollBottom** - Scroll to bottom of page
  - Scrolls to the very bottom of the page
  - Usage: `python3 test_navigation.py --command capability --capability ScrollBottom`

**SwitchTab** - Switch to a tab by ID
  - Switches to a specific browser tab
  - Usage: `python3 test_navigation.py --command capability --capability SwitchTab --params '{"tabId": TAB_ID}'`

**OpenTab** - Open a new tab
  - Opens a new browser tab with optional URL
  - Usage: `python3 test_navigation.py --command capability --capability OpenTab --params '{"url": "https://example.com"}'`

**CloseTab** - Close a tab by ID
  - Closes a specific browser tab
  - Usage: `python3 test_navigation.py --command capability --capability CloseTab --params '{"tabId": TAB_ID}'`

**UpdateTabURL** - Navigate a tab to a URL
  - Updates a tab to navigate to a new URL
  - Usage: `python3 test_navigation.py --command capability --capability UpdateTabURL --params '{"tabId": TAB_ID, "url": "https://example.com"}'`

**ZoomIn** - Zoom in 15%
  - Increases page zoom by 15%
  - Usage: `python3 test_navigation.py --command capability --capability ZoomIn`

**ZoomOut** - Zoom out 15%
  - Decreases page zoom by 15%
  - Usage: `python3 test_navigation.py --command capability --capability ZoomOut`

**ZoomReset** - Reset zoom to 100%
  - Resets page zoom to default (100%)
  - Usage: `python3 test_navigation.py --command capability --capability ZoomReset`

**GetChatList** - List all saved chats
  - Returns list of chats with id, title, date_short, message_count
  - Usage: `python3 test_navigation.py --command capability --capability GetChatList`

**LoadChat** - Load a chat by ID
  - Returns full chat content including all messages
  - Usage: `python3 test_navigation.py --command capability --capability LoadChat`

**CreateChat** - Create a new chat
  - Creates a new chat file and returns the chat_id
  - Usage: `python3 test_navigation.py --command capability --capability CreateChat`

**AppendMessage** - Append a message to a chat
  - Appends a user or assistant message to a chat. Creates chat if chat_id is null.
  - Usage: `python3 test_navigation.py --command capability --capability AppendMessage`

**RenameChat** - Rename a chat
  - Updates the title of an existing chat
  - Usage: `python3 test_navigation.py --command capability --capability RenameChat`

**DeleteChat** - Delete a chat
  - Permanently deletes a chat file
  - Usage: `python3 test_navigation.py --command capability --capability DeleteChat`

**AppendUserMessage** - Append a user message to the current chat
  - Appends a user message. Uses CURRENT_CHAT_ID or creates new chat.
  - Usage: `python3 test_navigation.py --command capability --capability AppendUserMessage`

**AppendAssistantMessage** - Append an assistant message to the current chat
  - Appends an assistant message. Uses CURRENT_CHAT_ID or creates new chat.
  - Usage: `python3 test_navigation.py --command capability --capability AppendAssistantMessage`

**GetCurrentChat** - Get the current active chat
  - Returns the current chat ID and chat data
  - Usage: `python3 test_navigation.py --command capability --capability GetCurrentChat`

**SetCurrentChat** - Set the current active chat
  - Sets which chat is the current active chat
  - Usage: `python3 test_navigation.py --command capability --capability SetCurrentChat`

**SearchChats** - Search chats by title or message content
  - Searches all chats and returns matching results
  - Usage: `python3 test_navigation.py --command capability --capability SearchChats`

**ShowHUD** - Show the HUD interface
  - Opens the full HUD overlay view
  - Usage: `python3 test_navigation.py --command capability --capability ShowHUD`

**HideHUD** - Hide the HUD interface
  - Closes the HUD overlay, returns to orb view
  - Usage: `python3 test_navigation.py --command capability --capability HideHUD`

**ToggleHUD** - Toggle HUD visibility
  - Switches between HUD and orb view
  - Usage: `python3 test_navigation.py --command capability --capability ToggleHUD`

**ShowSidebar** - Show the sidebar
  - Opens the chat sidebar in HUD
  - Usage: `python3 test_navigation.py --command capability --capability ShowSidebar`

**HideSidebar** - Hide the sidebar
  - Closes the chat sidebar in HUD
  - Usage: `python3 test_navigation.py --command capability --capability HideSidebar`

**ToggleSidebar** - Toggle sidebar visibility
  - Opens or closes the chat sidebar
  - Usage: `python3 test_navigation.py --command capability --capability ToggleSidebar`

**ExpandOrb** - Expand the orb chat panel
  - Opens the chat panel from the orb
  - Usage: `python3 test_navigation.py --command capability --capability ExpandOrb`

**CollapseOrb** - Collapse the orb chat panel
  - Closes the orb chat panel
  - Usage: `python3 test_navigation.py --command capability --capability CollapseOrb`

---

---

Google Search homepage
<Link id="a_id_0">About</Link>
<Link id="a_id_1">Store</Link>
<Link id="a_id_2">Gmail</Link>
<Link id="a_id_3">Search for Images</Link>
<Button id="a_id_4">Google apps</Button>
<Button id="a_id_5">Google Account: Andrew Orsmond
(andreworsmond21175@gmail.com)</Button>
<Select id="a_id_6" value="" use="(a_id_6, select, 'option')">Search</Select>
<Button id="a_id_7">Search by voice</Button>
<Button id="a_id_8">Search by image</Button>
<Button id="a_id_9">AI Mode</Button>
<Button id="a_id_10">Google Search</Button>
<Button id="a_id_11">I'm Feeling Lucky</Button>
Accessibility links
<Link id="a_id_12">Skip to Discover feed</Link>
<Link id="a_id_13">Skip to sidebar</Link>
<Link id="a_id_14">Skip to footer</Link>
<Link id="a_id_15">Accessibility help</Link>
<Link id="a_id_16">Accessibility feedback</Link>
Discover
<Link id="a_id_17">First Look: The Marine Blue Tesla Model Y Hits UK Shores
The United Kingdom's electric vehicle landscape just got a fresh splash of color. Customer deliveries of the Tesla Model Y in the new, striking Marine Blue...
Tesla Mag
·
2d</Link>
<Button id="a_id_18">More options</Button>
<Link id="a_id_19">5 ASX ETFs for beginner investors in 2026 and beyond
Let's see why these ASX ETFs could be top picks for beginner investors in 2026 and the years that follow...
The Motley Fool Australia
·
14h</Link>
<Button id="a_id_20">More options</Button>
<Link id="a_id_21">Artificial intelligence research has a slop problem, academics say: ‘It’s a mess’
AI research in question as author claims to have written over 100 papers on AI that one expert calls a 'disaster'
The Guardian
·
20h</Link>
<Button id="a_id_22">More options</Button>
<Link id="a_id_23">Researchers found an ancient Roman stairway. It’s revealing the ‘lost Pompeii’
Clues from a digital reconstruction of a lavish ancient home are changing how researchers understand Pompeii's elite.
CNN
·
35m</Link>
<Button id="a_id_24">More options</Button>
<Link id="a_id_25">Fir or faux: which Christmas tree is best for the environment?
Using an already existing artificial tree until its bedraggled end will be more environmentally friendly than buying a felled pine every year,...
The Guardian
·
1d</Link>
<Button id="a_id_26">More options</Button>
<Link id="a_id_27">How To Tame Your Hedgehog: A Simple Framework For A Better Career (And Life)
Borrowed from the discipline of strategy, here is a simple, powerful career framework to help you identify what you're great at, love doing, and can be paid...
Forbes
·
6d</Link>
<Button id="a_id_28">More options</Button>
<Link id="a_id_29">Netflix Breaks Its Silence, Sends Clear Message to Customers
Netflix sends a message to customers after announcing its acquisition of Warner Bros. Discovery, Inc. and HBO Max.
Men's Journal
·
1d</Link>
<Button id="a_id_30">More options</Button>
<Link id="a_id_31">Time to check your old Assistant speaker — more third-party models are getting Gemini
Gemini is unexpectedly replacing Google Assistant on old, third-party smart speakers and displays from Insignia and Lenovo.
Android Authority
·
1d</Link>
<Button id="a_id_32">More options</Button>
<Link id="a_id_33">High-blood pressure medication voluntarily recalled: FDA
A New Jersey drug maker has voluntarily recalled thousands of bottles of a combination high blood pressure medication over concerns the product could be...
The Hill
·
22h</Link>
<Button id="a_id_34">More options</Button>
<Link id="a_id_35">Japanese defense ministry claims spotting aircraft carrier Liaoning near Japan; 'Why wouldn’t Japan hype US military activities? ' expert asks
The Japanese defense ministry on Saturday reportedly claimed spotting the aircraft carrier Liaoning of the Chinese People's Liberation Army (PLA) Navy near...
Global Times
·
21h</Link>
<Button id="a_id_36">More options</Button>
<Link id="a_id_37">Over 50 Passengers Missing: Qantas Boeing 737 Took Off With Incorrect Weight Calculations
A Qantas Boeing 737-800 aircraft departed from Canberra using take-off performance numbers based on an incorrect loadsheet after the aircraft diverted from...
Simple Flying
·
16h</Link>
<Button id="a_id_38">More options</Button>
<Link id="a_id_39">Nature recovery plan in England hit by clause allowing contracts to end with a year’s notice
Conservationists say changes, coupled with underfunding, will curb take-up and leave less land protected for nature.
The Guardian
·
1d</Link>
<Button id="a_id_40">More options</Button>
<Link id="a_id_41">COMING SOON: Lux galeteria Gelato Messina to open new Adelaide beachside location this December
Gelato Messina is about to open its second Adelaide store, this time right by the beach.
Glam Adelaide
·
1d</Link>
<Button id="a_id_42">More options</Button>
<Link id="a_id_43">Microsoft Confirms New Upgrade Decision For All Windows Users
How to get Microsoft's new upgrade on your PC — it's the simplest Windows upgrade ever.
Forbes
·
1d</Link>
<Button id="a_id_44">More options</Button>
<Link id="a_id_45">Iran-targeted deli’s pleas for financial aid ignored
The family behind a kosher deli firebombed by Iranian terrorists say their business is on the brink of insolvency and the Albanese government has refused...
The Australian
·
3d</Link>
<Button id="a_id_46">More options</Button>
<Link id="a_id_47">Amazon’s new color Kindle Scribe launches on December 10th
Amazon has finally given a release date for its new Kindle Scribe Colorsoft and Kindle Scribe: They'll be available to purchase starting on December 10th,...
The Verge
·
2d</Link>
<Button id="a_id_48">More options</Button>
<Link id="a_id_49">Australia’s business leaders share the secrets to their 2025 success
The leaders, builders, pioneers and stirrers shaping Australia's business landscape reveal what went right in 2025 and what they want to see in 2026.
AFR
·
3d</Link>
<Button id="a_id_50">More options</Button>
<Link id="a_id_51">Adviser numbers see steep drop in first week of December
The week ending 4 December saw a net loss of 32 advisers after two months of almost exclusively single-digit shifts, bringing the total number of advisers...
ifa
·
2d</Link>
<Button id="a_id_52">More options</Button>
<Link id="a_id_53">The way Australia produces food is unique. Our updated dietary guidelines have to recognise this
Australia's dietary guidelines will soon consider environmental impacts. We need locally relevant indicators to support more sustainable food production.
The Conversation
·
4d</Link>
<Button id="a_id_54">More options</Button>
<Link id="a_id_55">South Australian bus ads misled public by claiming gas is ‘clean and green’, regulator finds
Ads to be removed from Adelaide Metro buses after advertising regulator rules they breach its environmental claims code.
The Guardian
·
1d</Link>
<Button id="a_id_56">More options</Button>
At a glance
<Button id="a_id_57">Customise Homestack</Button>
<Link id="a_id_58">Woodforde
Cloudy
10%
13°</Link>
<Link id="a_id_59">XAO • All Ordinaries up 0.22%. Price is 8,926.10 Today</Link>
<Link id="a_id_60">Air quality
Good
AQC</Link>
Australia
<Link id="a_id_61">Advertising</Link>
<Link id="a_id_62">Business</Link>
<Link id="a_id_63">How Search works</Link>
<Link id="a_id_64">Privacy</Link>
<Link id="a_id_65">Terms</Link>
<Button id="a_id_66">Settings</Button>