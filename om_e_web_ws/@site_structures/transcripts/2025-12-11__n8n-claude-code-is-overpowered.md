<!-- signature: s96JeuuwLzc:307:5eb62f0646513f715fae2555da5895de3230b80fb9c7760195ddaf1aa5a16784 -->
# n8n + Claude Code is OVERPOWERED

**Video URL:** https://www.youtube.com/watch?v=s96JeuuwLzc
**Video ID:** s96JeuuwLzc
**Language:** en
**Collected At:** 1765440009343
**Segments:** 307

---

- [0:00] How I use NAN has changed forever
because now I'm using NAN with Claude
- [0:04] Code. I mean, look at this. NAN is
executing Claude agents workflows skills.
- [0:09] This is what I've been
missing and I almost stopped
using NAN because while it's
- [0:12] good, Claude code is more powerful.
I talk about it in this video here,
- [0:16] but when I realized I could
combine the two, oh my gosh,
- [0:19] I unlocked a superpower. So get
your coffee ready, let's go.
- [0:26] Okay, so how in the world am I getting
this Innate N workflow to use cloud code?
- [0:29] And by the way, I'm actually able
to maintain a session as well,
- [0:31] just like you would talk
to it in the terminal.
- [0:33] I'll show you that here in a bit. Now
here's how I'm making that happen.
- [0:35] You need three things. You'll
need an innate N instance,
- [0:37] an AI terminal tool and coffee. That's
just the rules network. Chuck Coffee.
- [0:43] Now for the AI terminal tool, you can
use CLO code. That's what I recommend,
- [0:47] Gemini, CLI and maybe
Codex is kind of janky.
- [0:50] Keep in mind that CLO code does require
a pro subscription Gemini CLI will be
- [0:54] free with limits. And if
you're wondering, Chuck,
- [0:55] why are we even using AI in the
terminal? Watch this video right now,
- [0:59] it's amazing. Now real quick, if you
don't already have an NAN instance,
- [1:03] you're going to need one and I highly
recommend you self hosting this on a
- [1:05] hosting your VPS. Why? Two reasons.
First, it's on sale right now,
- [1:09] I can't believe you can have an entire
home lab in the cloud for this price.
- [1:12] And with these specs you can run
NAN in a lot of other stuff. Two,
- [1:15] you can set this up in about five minutes
hosting your makes this stupid easy.
- [1:18] Seriously watch this.
- [1:19] I'll go to hosting.com/and see an eight
N put in coupon code network junk and
- [1:23] magic will happen. Create a root password
- [1:28] and then boom, you're done in eight
N right here. Seriously, just do it.
- [1:32] It's what I use and thank you to hosting
if you're sponsoring this video and
- [1:35] making it happen. Now,
- [1:35] before I show you how NAN can connect
to cloud code or any other AI terminal,
- [1:39] and it's so easy, first we
got to answer the question,
- [1:42] where do we install our AI terminal
tool? Where do we put cloud code?
- [1:45] And the answer is, wherever you stink
in one, it can install anywhere, right?
- [1:49] All these AI terminal tools can install
to any Linux-based machine that includes
- [1:52] Mac, that includes Windows of WSL,
- [1:54] so you could install it alongside
an a n on your hosting, your VPS.
- [1:56] You can install it on a Raspberry
Pi if you want. Or for me,
- [1:59] I have it installed on a Ubuntu server
in my server room here at Network Chuck
- [2:04] Studios. I'm doing that because I like
cloud code right next to my stuff,
- [2:07] easy access there next door
neighbors. Now here's the secret.
- [2:09] Here's how they connect you
ready for SSH? That's it.
- [2:13] We're going to use the SSH node on N
eight N to log into our server and run
- [2:17] Claude Commands. I know what you're
thinking, Chuck. It can't be that simple.
- [2:20] I tried to make it more complicated.
- [2:21] I created my own HTTP wrapper and it
worked, but still, SSH was the simplest,
- [2:26] most elegant solution and I felt like
if I'm going to show you guys how to do
- [2:29] this, I'm going to give you the best way
and this is the best way. It just is.
- [2:33] And I know you might have some doubts
like does it actually work Well, yeah,
- [2:35] it does. Let me show you now real quick,
- [2:37] if you really want to
learn NAN and Claude Code,
- [2:40] we just launched two new courses
on Network Chuck Academy.
- [2:42] Well actually I know for
sure the NAN course is ready.
- [2:45] Claude code is coming soon.
- [2:46] So if you're ready to dive deep and you
want to learn it, well check it out.
- [2:48] Link below. So here we go. Let's get your
super simple SSH node set up working.
- [2:53] Now here at NAN land, I'm going
to create a workflow blank slate.
- [2:56] We'll start with a basic trigger and
then we'll add one node, our SSH node,
- [3:01] just search for SSH, there it is, and
we'll have the execute command action.
- [3:06] That's all we got right there. Why do I
have this? This is all we needed. First,
- [3:10] let's go ahead and jump in there into
the SSH node. Just double click it.
- [3:12] And if you've never done this before,
you'll first need to set up credentials,
- [3:15] connect to a server. I'm going to add a
new one right now. Click that drop down,
- [3:18] click on create new credential
and put in your info.
- [3:21] I'm going to use a password for this.
- [3:22] You can use a private
key if you want for me.
- [3:24] My IP address is 10 77 point 14 point 30.
- [3:27] That's my server in my
server room right over there.
- [3:29] If you're hosting cloud code or GEM
and ICLI on your hosting your VPS,
- [3:32] you'll want to put that public IP address
there and then throw in your username
- [3:35] and password and click on save. It's
going to save it, try and connect.
- [3:39] If you see connection tested successfully,
then you are good. I'll exit out.
- [3:42] Actually, I'm going to rename
that so I can know what it is.
- [3:44] I'll call it AI terminal.
- [3:46] Now let's try our first command
right here in the command box.
- [3:48] We're going to test it first with a very
well known command to make sure your
- [3:51] server works we'll just type
in host name just like this.
- [3:54] It's going to tell us our server's
name, ready, set, execute step.
- [3:58] And there it is. My server's
name is Pop Os. What's yours?
- [4:00] I felt like Steve from Blues Clues. Now
we can test our AI terminal command.
- [4:04] I'm going to start with Claude.
- [4:05] I'll change host name to Claude and I'll
do dash dash version to get the version
- [4:09] of Claude. We have installed a good
way to test that ready, set, go.
- [4:14] And it works.
- [4:15] You should see something like this in
the standard out the version you have
- [4:18] installed. Now you might be like, Chuck,
that didn't work for me. I hear you.
- [4:21] There's actually a few reasons why that
might happen and it has to do with the
- [4:24] way NAN interacts with
your server via SSH.
- [4:27] I experienced probably every one of those
scenarios and I documented everything
- [4:30] in a link below. For sake of
time, we're just going to move on.
- [4:35] Okay, we know our cloud command
works. Now let's actually use it.
- [4:38] So we'll type in CLO and we'll
do dash p dash P is for print.
- [4:42] This puts Claude in headless mode.
- [4:43] And that's what's great about these AI
terminal tools that can run in headless
- [4:46] mode, meaning we can ask them
something and just walk away.
- [4:49] So let's say why do pugs look so weird?
And let's see if it works. Ready, set,
- [4:54] go. So right now we're using NAN to remote
into our server and run a cloud code
- [4:58] command. And then Claude gives us
our answer. That's pretty cool,
- [5:01] but you might be like, okay Chuck,
- [5:03] we just asked AI to do something and it
told us what's so special about this.
- [5:07] Well, we can get crazier. Lemme show
you three reasons why this is amazing.
- [5:10] First context, watch this. I'm
going to change this command.
- [5:14] I'm going to CD or change directory
into another directory first.
- [5:17] Actually the directory of this video
we're working on right now where I keep my
- [5:20] scripts and everything, we'll
do ampersand, ampersand.
- [5:23] So we can run two commands
at once and I'll say, Hey,
- [5:27] is this video going to
be any good? Let's go.
- [5:31] And there's the answer. This
is going to be good. Now,
- [5:34] how did it know this video is going
to be good because it has the context.
- [5:37] I work in cloud code and cloud
code works in my local directories,
- [5:40] my local files.
- [5:41] Giving N eight N access to cloud
code gives NAN access to a super
- [5:46] powerful context filled agent.
- [5:48] It's kind of like if you could connect
N eight N to your chat g bt like the
- [5:52] gooey version with all your memories,
- [5:54] that's what we're doing here except
way more powerful. And guess what?
- [5:57] All that context, all those
tokens we just spent, and yeah,
- [6:00] that cost tokens already paid
for. This is my subscription.
- [6:03] And the third reason, this
is amazing skills and agents.
- [6:07] What do you mean watch this?
Let's change my prompt up.
- [6:10] I'm going to put cloud in dangerous mode
and I'll say use your unified skill,
- [6:15] which is right here, by
the way, on my server,
- [6:17] I've got a unified skill that tells
Claude everything it needs to know about
- [6:21] accessing my unified environment.
And I was told to do three things,
- [6:24] check the wifi, check the network
performance and check my security.
- [6:27] Deploy three agents, one for each task.
- [6:31] And then it's kind of
hard to visualize this.
- [6:33] So I created a dashboard
with cloud code. Here it is.
- [6:36] Now let's watch this magic happen.
Ready, set, go there, it came in,
- [6:41] there's my prompt and it's launching
three agents all working on my wifi,
- [6:44] working on my network,
checking things out.
- [6:46] And what I love about this is that N
eight N, he's now just the orchestrator.
- [6:50] Things are simple here. The
complexity lives here in claw code.
- [6:53] And by complexity I mean it's just marked
down files that describe how to access
- [6:57] things. It's python scripts. Look, it's
running Python right now and it's done.
- [7:01] Let's see the result. Oh dude,
- [7:03] my memory's high on my switch and my
UDM pro, I actually didn't know that.
- [7:07] This is super helpful.
I wanted to call me out.
- [7:10] I think some smart home stuff
all in the same network.
- [7:15] What do you see in this To do
that would've been this insane.
- [7:18] A n workflow would've taken
me hours and hours to do,
- [7:21] but here it's just a cloud code
prompt. Sure, I had a skill there,
- [7:24] but cloud code made that skill and
this would've taken a ton of tokens.
- [7:28] This is a token heavy process, but
it's cloud code. I have a subscription.
- [7:32] I don't care.
- [7:32] I hope you're seeing this because any n
canal effectively connect to everything
- [7:36] I do already. All the workflows I'm
building, all the processes I'm designing,
- [7:40] it can connect to it
and use it. But hold on.
- [7:43] What if you want to talk back to it
like cool, give me all that wifi info,
- [7:46] but what if I want to say go ahead
and fix it? How do we do that here?
- [7:49] It seems kind of just like one and
done. No, we can resume a session.
- [7:53] Watch this.
- [7:58] So Claude and all these
AI terminal things,
- [8:00] actually most things operate like this.
- [8:02] They operate off session
IDs with cloud code.
- [8:04] We can actually use our own
session id. We can specify one.
- [8:08] Let's do that right now. So first
I'm going to generate a UU id,
- [8:11] that's what they call it with a code
node. So I'll click on code node here,
- [8:15] it'll be JavaScript and
I'll have all this below.
- [8:17] It's just a little function that'll
randomly generate a U Id like this.
- [8:22] And then with our command, let's
actually change it up a little bit.
- [8:24] We won't ask about the
wifi or we'll just say,
- [8:27] use your unified skill to
see how many, actually no,
- [8:30] Claude can actually intelligently use
the unified skill without me telling it
- [8:33] to. I'll just say how many
access points are up right now
- [8:38] and then I'll do dash, dash session,
- [8:40] dash id and we'll pull in
that UUID that we created.
- [8:45] So now our command looks like this and
actually let's remove that extra space
- [8:47] here. Awesome. So we're pulling in that
variable from that JavaScript code node.
- [8:52] Let's test it out. Ready, set, go.
Oh look, it's using my unified skill.
- [8:56] It's so cool, man. I already
answered three are up. Cool.
- [8:59] Now we're going to add another SSH
session. So actually we'll pin this data.
- [9:04] Actually we'll pin
everything so it stays there.
- [9:06] We'll copy this SSH node or
duplicate it, connect it up
- [9:12] and we'll change one thing here. Actually
we'll change a few things. First,
- [9:15] we'll change our prompt and we'll just
continue the conversation being like,
- [9:17] why is one of them down? So that would
not make any sense out of context.
- [9:22] Why is one of them down?
Whatcha talking about?
- [9:24] But if we're resuming the
conversation, it'll be fine.
- [9:26] We can do that with the dash R switch
to do dash R and then we'll specify that
- [9:31] same session ID from our JavaScript
node, just like that. Try it out.
- [9:36] It's executing. Let's see if
we can see things happening.
- [9:38] There's a prompt that came in. It's
using our unified skill and boom,
- [9:41] it knew exactly what I was talking
about. We resumed that session.
- [9:44] Are you seeing this? We just gave
NAN and freaking pot of coffee.
- [9:49] This is so overpowering. We have context.
- [9:54] We've got the power of the terminal
Claude skills. And by the way,
- [9:57] Claude code handles context
way better than NAN does. Now,
- [10:01] I was trying to think about
like, okay, this is cool,
- [10:02] but what could I use this for?
And I came up with this idea,
- [10:05] centered it around this whole session
ID business. I love this so much.
- [10:09] So I quickly threw this workflow together
and what this enables me to do is use
- [10:14] my phone and Slack to talk to
Claude code wherever I'm at and not
- [10:18] just send one message and get a response,
- [10:20] but have a conversation until
I'm done. Check this out.
- [10:25] You got to see it. I'm so
excited about this. Alright,
- [10:29] ignore all my testing, but check this
out. I'll tag NAN test and simply ask it.
- [10:34] Deploy two agents to battle it out
- [10:39] over which is better.
- [10:42] Nano or neo VM research
- [10:46] contrast Compare.
- [10:49] Give me a solid answer and I got to
keep the response under 2000 characters.
- [10:53] I ran into an issue, but
we'll see how it goes.
- [10:55] And we're going to watch it
on the side here. Ready? Set.
- [10:57] This is all from Slack. There it goes.
- [11:04] And there's the answer. It
says, Neo of M is awesome.
- [11:07] Let's ask about something else.
So let's respond to it. I'll say,
- [11:11] but what about make YouTube
videos about hacking and
- [11:16] eight N and all kinds of
fun things? And I'll say,
- [11:21] yes, I want to, or no, I'm not done yet,
- [11:24] so keep going. And there it
goes. Isn't this amazing?
- [11:28] I can make a video about this
very battle. I love this so much.
- [11:33] I should use both. I love this. Alright,
- [11:37] I'm going to respond with true to
end that, but just think about that.
- [11:41] I could be out and about
and have this idea, oh,
- [11:43] I want to research this or I have this
thought or I need to check on this one
- [11:46] thing. Open Slack. Ask.
- [11:49] And for those of you using Claude
code as your digital assistant,
- [11:53] which I'm going to make a video
on soon, this is a game changer.
- [11:57] I'm talking to you, Daniel Mesler,
- [11:58] and we'll look into end real quick
to show you what I'm doing here.
- [12:01] Here's the initial message that Slack
sends me and it sends me that dropdown to
- [12:04] say if I'm done true or false, that
simply goes to an IF node. If I say false,
- [12:08] I'm not done.
- [12:09] It'll loop through launch another clog
command with the dash R with that same
- [12:13] session id. And of course when I
say true, I am done. It's done.
- [12:16] It'll end the workflow. Or
I can check in with my nas,
- [12:19] see how my stuff server is doing.
- [12:27] Look at that. Oh my gosh,
how cool is this? Oh, oh,
- [12:32] yikes. I got some work to do actually,
let's have it investigate that.
- [12:44] I didn't expect to find an
issue during this. Well,
- [12:49] that's awesome though,
right? Also terrifying,
- [12:56] okay, NAN plus clog code
or Jim and ICAI or code X,
- [13:00] whatever it is, it's overpowered.
- [13:02] The next video in my N innate N series
is going to be about taking it further
- [13:06] and deploying an IT department,
but I'm like, hold on,
- [13:10] I discovered Claude code and now I realize
how amazing this is and I want to use
- [13:14] that more. But then I found
a way to use it with NAN.
- [13:17] So now I'm designing my IT department
with NAN as the Orchestrator
- [13:22] orchestration and Claude Code and
Gemini CLI and Codex as the actual IT
- [13:27] department. Now, I love
this because it's so simple.
- [13:30] It's just SSH and a few clever things
with managing session IDs. But man,
- [13:34] just the slack thing alone is super cool.
- [13:37] Now I know what you're thinking like
Chuck, well what about NAS AI agents?
- [13:40] You can still use those.
- [13:41] You can have the AI agents that you
have inside N eight N call Claude
- [13:46] code. It can develop prompts on the fly.
- [13:48] The killer part about Claude Code is
that it can deploy multiple agents on the
- [13:51] fly, whereas N eight N,
- [13:53] you're stuck with the agents that
you actually put into the workflow.
- [13:56] But my idea is I have like a billion.
- [13:58] I had to take a walk yesterday and
just jot down ideas in my journal.
- [14:02] I had so many. I'm curious where you're
at. What do you think about this idea?
- [14:06] Are you going to try this For
me? This solves my problem.
- [14:09] I love being in the terminal. I love
having everything, every file on-prem,
- [14:13] on my server, on my laptop,
- [14:15] and now that I have an eight N controlling
cloud code as the orchestrator,
- [14:19] I keep everything. I want to keep local,
- [14:21] enabling a n to do what it does
best and what Claude code does best.
- [14:26] So I want to hear from you. I want
you to give it a try, try it out,
- [14:28] and then come to me with some
ideas. I've got a million,
- [14:31] but I want to hear yours too. Comment
below. Anyways, that's all I have.
- [14:34] Actually, no, that's
not all I have. Again,
- [14:36] if you do want to learn more about Claude
code and skills and then also N eight
- [14:40] N and how to use all the
cool features of NAN,
- [14:42] we'll have two courses coming
out on Network Check Academy.
- [14:44] They're probably already out.
Check it out. Link below.
- [14:46] I think you're really
going to like them. No,
- [14:48] I know you're really going to like
them. Anyways, that's all I got.
- [14:50] I'll catch you guys next time. Hey,
- [14:54] you're still here at the end of my
videos. I now pray for you. My audience.
- [14:58] I know it's kind of weird. If prayer is
not your thing, that's okay. Actually,
- [15:02] I would love for you to stay,
but you can click off the video.
- [15:05] That's why I put this at the
end. So let's go ahead and pray.
- [15:07] When I pray for you and your
life, I dunno where you're at.
- [15:10] I dunno where you're at with God
or anything, but it doesn't matter.
- [15:13] I'm going to pray for
you. So let's go. God,
- [15:17] I thank you for this person on the other
side of the screen. I just thank you
- [15:23] that they're here,
- [15:24] that they're subscribed to me and they're
watching my channel and my videos.
- [15:27] Thank you for that. And I thank you that
they're passionate about tech, about
- [15:33] automating with AI and
doing cool workflows.
- [15:36] And I pray that this video would
ignite in them a passion to just
- [15:41] keep going.
- [15:42] That ideas would just flow into
their mind right now that they would,
- [15:47] if there's anything blocking them
mentally or spiritually or just anything
- [15:51] that's got them stuck,
- [15:52] that this video and the ideas that are
coming with it will just open up a new
- [15:58] flow and stream of just awesomeness
running out of words. Lord,
- [16:03] bless them indeed right now. I pray
that you'll bless their careers,
- [16:07] that they would grow in their careers.
- [16:10] Let them find joy in what they do,
- [16:16] and I pray blessing with their
families that they would be
- [16:23] grow strong and be healthy and that you
would give them time with their families
- [16:28] and let that time be sweet.
Let that time be rich
- [16:32] and help them to balance
their life and their time.
- [16:37] And I pray for their moments after
this video as they go about their day,
- [16:40] that they would be empowered to avoid
distraction and do the things that are
- [16:45] really important. Help them to
study and work and do good things.
- [16:50] Lord,
- [16:52] I pray ultimately that they will one
day just know the joy of knowing you
- [16:57] that all these things right now,
- [16:59] money and the pursuit of riches or
- [17:03] stature, it's fun, but ultimately
- [17:09] knowing you is the best thing. It's
got to just pray blessing over them,
- [17:13] and I thank you for them. It's
your name I pray, Jesus. Amen.
- [17:20] Anyways, I've been recording for
like five hours straight. I'm tired.
- [17:22] I'll catch you guys next time.
