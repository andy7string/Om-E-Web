# Google

**URL:** https://www.google.com/
**Timestamp:** 2025-12-07 23:15:27

**Tabs (1):** Active: #1138036303 "Google" www.google.com [loading]

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

**GetLLMConfig** - Get LLM configuration
  - Returns current LLM config including providers and settings
  - Usage: `python3 test_navigation.py --command capability --capability GetLLMConfig`

**SetLLMProvider** - Switch active LLM provider
  - Changes which provider is used for LLM calls
  - Usage: `python3 test_navigation.py --command capability --capability SetLLMProvider`

**SetLLMEndpoint** - Set LLM endpoint URL
  - Updates the API endpoint for a provider
  - Usage: `python3 test_navigation.py --command capability --capability SetLLMEndpoint`

**SetLLMModel** - Set LLM model
  - Changes the model for a provider
  - Usage: `python3 test_navigation.py --command capability --capability SetLLMModel`

**SetLLMAPIKey** - Set API key
  - Sets the API key for a provider
  - Usage: `python3 test_navigation.py --command capability --capability SetLLMAPIKey`

**SetTemperature** - Set temperature
  - Adjusts LLM temperature (0.0-2.0)
  - Usage: `python3 test_navigation.py --command capability --capability SetTemperature`

**SetMaxTokens** - Set max tokens
  - Sets maximum response tokens
  - Usage: `python3 test_navigation.py --command capability --capability SetMaxTokens`

**AddLLMProvider** - Add new LLM provider
  - Adds a new provider configuration
  - Usage: `python3 test_navigation.py --command capability --capability AddLLMProvider`

**RemoveLLMProvider** - Remove LLM provider
  - Removes a provider from config
  - Usage: `python3 test_navigation.py --command capability --capability RemoveLLMProvider`

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
<Link id="a_id_17">Updated BYD M6 minivan was seen in China with a redesigned interior
The updated BYD M6 minivan was seen in China during road tests with a redesigned interior. It is a new energy MPV for global markets. The BYD M6 was...
CarNewsChina.com
·
3d</Link>
<Button id="a_id_18">More options</Button>
<Link id="a_id_19">Saturday Citations: Cancer therapy breakthrough; Sumatran tigers thrive; frogs eat what, now?
This week, JPL scientists reported that glaciers speed up and slow down at predictable intervals. CERN's ATLAS experiment detected evidence for the decay of...
Phys.org
·
22h</Link>
<Button id="a_id_20">More options</Button>
<Link id="a_id_21">3 high-quality ASX ETFs to buy in December
These ASX ETFs give investors easy exposure to some of the best stocks in the world. Here's what they offer...
The Motley Fool Australia
·
1d</Link>
<Button id="a_id_22">More options</Button>
<Link id="a_id_23">Stop Charging Your Android Watch Daily. Here Are 7 Tips for Longer Battery Life
Nothing kills the motivation of a midday workout faster than raising your wrist and seeing a dead, black watch screen. Honestly, did you even work out if...
CNET
·
23h</Link>
<Button id="a_id_24">More options</Button>
<Link id="a_id_25">High-blood pressure medication voluntarily recalled: FDA
A New Jersey drug maker has voluntarily recalled thousands of bottles of a combination high blood pressure medication over concerns the product could be...
The Hill
·
23h</Link>
<Button id="a_id_26">More options</Button>
<Link id="a_id_27">Wood-burning stoves face new restrictions – but a loophole from Britain’s smog years is fuelling the problem
Wood-burning stoves are booming in the UK, a cosy response to high energy prices and cost of living pressures. But this comes with a hidden cost.
The Conversation
·
1d</Link>
<Button id="a_id_28">More options</Button>
<Link id="a_id_29">Tall poppies and complacency curtailing our entrepreneurial spirit
There is a national tendency to cut down tall poppies, which has sometimes prevented the country from embracing a vigorous, creative entrepreneurial...
AFR
·
4d</Link>
<Button id="a_id_30">More options</Button>
<Link id="a_id_31">Netflix Breaks Its Silence, Sends Clear Message to Customers
Netflix sends a message to customers after announcing its acquisition of Warner Bros. Discovery, Inc. and HBO Max.
Men's Journal
·
1d</Link>
<Button id="a_id_32">More options</Button>
<Link id="a_id_33">Fir or faux: which Christmas tree is best for the environment?
Using an already existing artificial tree until its bedraggled end will be more environmentally friendly than buying a felled pine every year,...
The Guardian
·
1d</Link>
<Button id="a_id_34">More options</Button>
<Link id="a_id_35">Japanese defense ministry claims spotting aircraft carrier Liaoning near Japan; 'Why wouldn’t Japan hype US military activities? ' expert asks
The Japanese defense ministry on Saturday reportedly claimed spotting the aircraft carrier Liaoning of the Chinese People's Liberation Army (PLA) Navy near...
Global Times
·
22h</Link>
<Button id="a_id_36">More options</Button>
<Link id="a_id_37">NEWS: Tesla has launched the Model Y Standard in the UK, starting at £41,990 (vs £48,990 for the Model Y Premium RWD). Deliveries begin in January 2026, with first test drives available next month.
SawyerMerritt
X
·
2d</Link>
<Button id="a_id_38">More options</Button>
<Link id="a_id_39">Cost of a comfortable retirement rises to record high: ASFA
Australia's Retirement Standard has just been updated. Find out the cost of a comfortable and modest retirement for homeowners and renters.
The Motley Fool Australia
·
1d</Link>
<Button id="a_id_40">More options</Button>
<Link id="a_id_41">COMING SOON: Lux galeteria Gelato Messina to open new Adelaide beachside location this December
Gelato Messina is about to open its second Adelaide store, this time right by the beach.
Glam Adelaide
·
1d</Link>
<Button id="a_id_42">More options</Button>
<Link id="a_id_43">Nothing but blue skies for Qantas’ plans for western hub
Qantas' ambition to turn Perth into a western hub connecting Australia with the world already appears to be paying dividends, with the airline seeing demand...
The West Australian
·
1d</Link>
<Button id="a_id_44">More options</Button>
<Link id="a_id_45">basecamp/fizzy: Kanban as it should be. Not as it has been.
If you'd like to run Fizzy on your own server, we recommend deploying it with Kamal. Kamal makes it easier to set up a bare server, copy the application to...
GitHub
·
1h</Link>
<Button id="a_id_46">More options</Button>
<Link id="a_id_47">Microsoft Confirms New Upgrade Decision For All Windows Users
How to get Microsoft's new upgrade on your PC — it's the simplest Windows upgrade ever.
Forbes
·
1d</Link>
<Button id="a_id_48">More options</Button>
<Link id="a_id_49">ABC documentary pulled from broadcast over editorial
ABC documentary Songs Inside was pulled from schedule at the last minute last Monday over an editorial decision. Produced by Cocoon Films the film follows...
TV Tonight | Australia's Leading TV Blog
·
18h</Link>
<Button id="a_id_50">More options</Button>
<Link id="a_id_51">The way Australia produces food is unique. Our updated dietary guidelines have to recognise this
Australia's dietary guidelines will soon consider environmental impacts. We need locally relevant indicators to support more sustainable food production.
The Conversation
·
4d</Link>
<Button id="a_id_52">More options</Button>
<Link id="a_id_53">Singapore’s Sembcorp nears deal for Alinta
Singapore-listed energy major Sembcorp is poised to clinch a deal as early as this week to acquire Australia's fourth-largest electricity and gas retailer,...
The Australian
·
4h</Link>
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
12°</Link>
<Link id="a_id_59">.DJI • Dow Jones Industrial Average up 0.22%. Price is 47,954.99 Today</Link>
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