# Google

**URL:** https://www.google.com/?zx=1765116515070&no_sw_cr=1
**Timestamp:** 2025-12-08 00:42:06

**Tabs (1):** Active: #1138036353 "Google" www.google.com [loading]

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

**LLMChat** - Send message to LLM
  - Send a chat message to the configured LLM and get a response
  - Usage: `python3 test_navigation.py --command capability --capability LLMChat`

---

---

Google Search homepage
<Link id="a_id_0">Gmail</Link>
<Link id="a_id_1">Search for Images</Link>
<Button id="a_id_2">Google apps</Button>
<Button id="a_id_3">Google Account: Andrew Orsmond
(andreworsmond21175@gmail.com)</Button>
<Select id="a_id_4" value="" use="(a_id_4, select, 'option')">Search</Select>
<Button id="a_id_5">Search by voice</Button>
<Button id="a_id_6">Search by image</Button>
<Button id="a_id_7">AI Mode</Button>
<Button id="a_id_8">Google Search</Button>
<Button id="a_id_9">I'm Feeling Lucky</Button>
Accessibility links
<Link id="a_id_10">Skip to Discover feed</Link>
<Link id="a_id_11">Skip to sidebar</Link>
<Link id="a_id_12">Skip to footer</Link>
<Link id="a_id_13">Accessibility help</Link>
<Link id="a_id_14">Accessibility feedback</Link>
<Link id="a_id_15">Learn how to better use AI</Link>
to ideate, get more done, and save time
Discover
<Link id="a_id_16">Gemini success to drive Alphabet shares to $400, cause OpenAI to cut capex, says Pivotal
Analyst Jeffrey Wlodarczak cited continued momentum in Google's core business lines and said the company appears to be "winning everywhere" across the AI...
CNBC
·
1h</Link>
<Button id="a_id_17">More options</Button>
<Link id="a_id_18">2026 Ram 1500 HEMI Returns: 5.7L V8 Restored With 395 HP, Bigger Towing, MSRP, Release Dates, Full Buyer Guide
The 2026 Ram 1500 HEMI brings back the popular 5.7L V8 engine with smoother power, stronger towing, and modern comfort. It's built for drivers who want.
kingsgatelogisticllc.com
·
1d</Link>
<Button id="a_id_19">More options</Button>
<Link id="a_id_20">Biggest battery to date on Australia’s main grid officially opened, in time for summer
The largest fully operating battery on Australia's main grid has been officially opened on budget, with the $1.2 billion project delivered on time and...
Renew Economy
·
17h</Link>
<Button id="a_id_21">More options</Button>
<Link id="a_id_22">Alleged Sydney uni hacker charged with additional cyber crimes
A former Western Sydney University student already charged with hacking into the institution's servers allegedly continued a campaign against the university...
Australian Broadcasting Corporation
·
2d</Link>
<Button id="a_id_23">More options</Button>
<Link id="a_id_24">Solicitor, 2 counsel referred to regulator for AI use
A South Australian solicitor and two Victoria-based counsel have been referred to their respective legal regulators for relying on material that was...
Lawyers Weekly
·
3d</Link>
<Button id="a_id_25">More options</Button>
<Link id="a_id_26">Nothing but blue skies for Qantas’ plans for western hub
Qantas' ambition to turn Perth into a western hub connecting Australia with the world already appears to be paying dividends, with the airline seeing demand...
The West Australian
·
1d</Link>
<Button id="a_id_27">More options</Button>
<Link id="a_id_28">Time to check your old Assistant speaker — more third-party models are getting Gemini
Gemini is unexpectedly replacing Google Assistant on old, third-party smart speakers and displays from Insignia and Lenovo.
Android Authority
·
1d</Link>
<Button id="a_id_29">More options</Button>
<Link id="a_id_30">A Watch That Works as Well on Earth as It Did in Space
Omega's Speedmaster, worn by Buzz Aldrin and Neil Armstrong on their 1969 journey to the moon, gets an update.
The New York Times
·
1d</Link>
<Button id="a_id_31">More options</Button>
<Link id="a_id_32">Amazon’s new color Kindle Scribe launches on December 10th
Amazon has finally given a release date for its new Kindle Scribe Colorsoft and Kindle Scribe: They'll be available to purchase starting on December 10th,...
The Verge
·
2d</Link>
<Button id="a_id_33">More options</Button>
<Link id="a_id_34">NEWS: Tesla has launched the Model Y Standard in the UK, starting at £41,990 (vs £48,990 for the Model Y Premium RWD). Deliveries begin in January 2026, with first test drives available next month.
SawyerMerritt
X
·
2d</Link>
<Button id="a_id_35">More options</Button>
<Link id="a_id_36">Rare look at family, country and culture on the beautiful APY Lands
The stark beauty of Australia's protected APY Lands is alive with ancient songlines and culture. But Elders see a need for change to secure the future of...
Australian Broadcasting Corporation
·
1d</Link>
<Button id="a_id_37">More options</Button>
<Link id="a_id_38">Bold shapes and binoculars: Frank Gehry’s stunning California architecture
From his home town of Los Angeles, the architect designed a career around defying what was predictable.
The Guardian
·
19h</Link>
<Button id="a_id_39">More options</Button>
<Link id="a_id_40">Solar Superstorm Gannon crushed Earth’s plasmasphere to a record low
A massive solar storm in May 2024 gave scientists an unprecedented look at how Earth's protective plasma layer collapses under intense space weather.
ScienceDaily
·
2w</Link>
<Button id="a_id_41">More options</Button>
<Link id="a_id_42">‘One bite and he was hooked’: from Kenya to Nepal, how parents are battling ultra-processed foods
The scourge of ultra-processed foods (UPFs) is global. While their consumption is particularly high in the west, forming more than half the average diet in...
The Guardian
·
3d</Link>
<Button id="a_id_43">More options</Button>
<Link id="a_id_44">Records tumble for trophy homes as cashed-up buyers pounce ahead of summer
Time is ticking for cashed-up buyers keen to lock in their next trophy home before the summer holidays, resulting in record breaking results.
Real Estate
·
2d</Link>
<Button id="a_id_45">More options</Button>
<Link id="a_id_46">The sweet spirit 'steeped in tradition' that's becoming trendy
South Australian distillers are tapping into a growing global thirst for limoncello and finding a new market for lemons and grape spirit.
Australian Broadcasting Corporation
·
10h</Link>
<Button id="a_id_47">More options</Button>
<Link id="a_id_48">ABC documentary pulled from broadcast over editorial
ABC documentary Songs Inside was pulled from schedule at the last minute last Monday over an editorial decision. Produced by Cocoon Films the film follows...
TV Tonight | Australia's Leading TV Blog
·
20h</Link>
<Button id="a_id_49">More options</Button>
<Link id="a_id_50">Finn McGill’s Power Trip: 2 North Shore QS Wins in as Many Weeks (Video)
It's been a crazy half-month for Finn McGill. Two weeks ago, the 25-year-old was carried up the beach after finally winning a QS 2,000 at his beloved Sunset...
SURFER Magazine
·
16h</Link>
<Button id="a_id_51">More options</Button>
<Link id="a_id_52">Singapore’s Sembcorp nears deal for Alinta
Singapore-listed energy major Sembcorp is poised to clinch a deal as early as this week to acquire Australia's fourth-largest electricity and gas retailer,...
The Australian
·
5h</Link>
<Button id="a_id_53">More options</Button>
<Link id="a_id_54">Who will lead the SA Liberal Party to the next state election?
SA Liberal leader Vincent Tarzia has stepped down. Pressure had been mounting in the lead-up to the 2026 state election, and predictions for the Liberal...
Australian Broadcasting Corporation
·
1d</Link>
<Button id="a_id_55">More options</Button>
<Link id="a_id_56">🚨: 3I/ATLAS latest image seems nothing like a comet Two tails and a nucleus stunningly visible!
forallcurious
X
·
1d</Link>
<Button id="a_id_57">More options</Button>
<Link id="a_id_58">1:36
Victoria passes life sentences for 14-year-olds | Sunrise
Victorian Parliament has passed controversial legislation allowing children as young as 14 to receive life sentences for violent crimes including aggravated...
Sunrise
YouTube
·
2d</Link>
<Button id="a_id_59">More options</Button>
<Link id="a_id_60">Anthony Ginsberg talks Tech Megatrend ETF including AI, Genomics & M&A tailwinds
Anthony Ginsberg, CEO of GinsGlobal Index Fund, recently spoke with Steve Darling from Proactive about the latest developments shaping the Tech Megatrend...
Proactive financial news
·
1d</Link>
<Button id="a_id_61">More options</Button>
<Link id="a_id_62">Francis Ford Coppola’s F.P. Journe Sells for $11 Million at Auction
Frenzied bidding pushed the polarizing F.P. Journe timepiece into near-record territory despite one dealer calling the design “goofy.”
The New York Times
·
12h</Link>
<Button id="a_id_63">More options</Button>
<Link id="a_id_64">Australia refuses to repatriate citizens from Syrian camps despite US warning leaving them there ‘compounds risk to all of us’
US offers to get Australians out of camps if they are issued with travel documents, but Labor has said 'this is not something the government is considering'
The Guardian
·
15h</Link>
<Button id="a_id_65">More options</Button>
<Link id="a_id_66">‘Surfer’s Dream’: Sand Dredging Creates Ultimate Novelty Wave (Video)
In recent weeks, something strange appeared, and went viral, on Australia's Gold Coast. An island, manmade from sand dredging boats, working to replenish...
SURFER Magazine
·
12h</Link>
<Button id="a_id_67">More options</Button>
<Link id="a_id_68">Taxpayers deserve an explanation for senators missing in action
How can we have a system in which the taxpayer foots the bill for a senator earning $340,000 pa, and that senator, Pauline Hanson, misses a sitting of...
The Sydney Morning Herald
·
1d</Link>
<Button id="a_id_69">More options</Button>
<Link id="a_id_70">New CEOs for Mitsubishi, mining lobby
Mitsubishi Motors has chosen a veteran insider to lead its Australian operations from Adelaide after the departure of Shaun Westcott, while SA's peak mining...
The Advertiser
·
6d</Link>
<Button id="a_id_71">More options</Button>
<Link id="a_id_72">Bombed Chornobyl shelter no longer blocks radiation and needs major repair – IAEA
Drone attack that Ukraine blamed on Russia blew hole in painstakingly erected €1.5bn shield meant to allow for final clean-up of 1986 meltdown site.
The Guardian
·
22h</Link>
<Button id="a_id_73">More options</Button>
<Link id="a_id_74">‘It is too beautiful to be painted’ — how Venice left Monet spellbound
A radiant exhibition at the Brooklyn Museum traces the artist's 1908 visit to La Serenissima and the watery cityscapes it inspired.
Financial Times
·
1d</Link>
<Button id="a_id_75">More options</Button>
<Link id="a_id_76">The new inReach Mini 3 joins inReach Messenger and GPSMAP H1i Plus to give you a choice for staying connected while off the grid.
Garmin
X
·
14h</Link>
<Button id="a_id_77">More options</Button>
<Link id="a_id_78">Can You Trim a Neighbor’s Tree That Hangs Over Your Yard? Here’s What Experts Say
Your yard's property line is a tricky place, especially without a fence or a hedge to define it, and that can make trimming trees along that border...
The Spruce
·
1d</Link>
<Button id="a_id_79">More options</Button>
<Link id="a_id_80">Over 50 Passengers Missing: Qantas Boeing 737 Took Off With Incorrect Weight Calculations
A Qantas Boeing 737-800 aircraft departed from Canberra using take-off performance numbers based on an incorrect loadsheet after the aircraft diverted from...
Simple Flying
·
19h</Link>
<Button id="a_id_81">More options</Button>
<Link id="a_id_82">5:10
Pluribus — John Cena Explains HDP | Scene | Apple TV
Hi, Carol. We're John Cena. Pluribus is now streaming on Apple TV https://apple.co/_Pluribus Subscribe to Apple TV's YouTube channel:...
Apple TV
YouTube
·
1d</Link>
<Button id="a_id_83">More options</Button>
<Link id="a_id_84">Bongo playing Labrador sworn in at Family Court of Australia, in SA first
The Federal Circuit and Family Court of Australia has welcomed its newest team member, and she happens to have four legs, a wagging tail,...
Glam Adelaide
·
6d</Link>
<Button id="a_id_85">More options</Button>
<Link id="a_id_86">ivy_Porsche 911 Singer DLS126
ivy_Porsche 911 Singer DLS126. Posted in: December 6, 2025 by DS Team | No comments. Written by DS Team. View all posts by: DS Team · « Previous post.
DiecastSociety.com
·
12h</Link>
<Button id="a_id_87">More options</Button>
<Link id="a_id_88">‘Yes’ to God, but ‘no’ to church – what religious change looks like for many Latin Americans
Protestant churches' growth in Latin America gets lots of attention, but another important shift is happening, too: people leaving organized religion...
The Conversation
·
2d</Link>
<Button id="a_id_89">More options</Button>
<Link id="a_id_90">Macquarie blows whistle on passive funds, says M&A rules are changing
Index and quant ownership of Australian shares has more than doubled in the past 15 years, bringing unintended consequences.
AFR
·
3d</Link>
<Button id="a_id_91">More options</Button>
<Link id="a_id_92">Victorian farmer wins fight over $398 fine for carting hay on tractor
The Condah farmer and hay contractor who contested a $398 fine for carrying two bales of hay on his tractor forks to help a drought-stricken neighbour has...
Big Rigs
·
1d</Link>
<Button id="a_id_93">More options</Button>
<Link id="a_id_94">'That's not neutrality': Protesters call on SBS to boycott Eurovision
Protesters have demanded SBS boycott the Eurovision Song Contest over Israel's participation, but the public broadcaster said such a move would undermine...
SBS Australia
·
4h</Link>
<Button id="a_id_95">More options</Button>
Australia
<Link id="a_id_96">Advertising</Link>
<Link id="a_id_97">Business</Link>
<Link id="a_id_98">How Search works</Link>
<Link id="a_id_99">Privacy</Link>
<Link id="a_id_100">Terms</Link>
<Button id="a_id_101">Settings</Button>