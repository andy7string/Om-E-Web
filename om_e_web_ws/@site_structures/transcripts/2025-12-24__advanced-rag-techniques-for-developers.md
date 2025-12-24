<!-- signature: sGvXO7CVwc0:198:633ad433bb30e4d1003e9fdb24c95c854f82fe4a3cd38bdb94a6a65403fdc661 -->
# Advanced RAG techniques for developers

**Video URL:** https://www.youtube.com/watch?v=sGvXO7CVwc0
**Video ID:** sGvXO7CVwc0
**Language:** en
**Collected At:** 1766539006251
**Segments:** 198

---

- [0:00] [MUSIC PLAYING]
- [0:07] JASON DAVENPORT: Welcome
back to Real Terms for AI,
- [0:09] where we break down
modern AI concepts
- [0:11] for professional developers.
- [0:13] AJA HAMMERLY: We did
one episode on RAG,
- [0:15] and it's a powerful architecture
for improving the quality
- [0:18] of responses from an LLM.
- [0:20] JASON DAVENPORT: But
sometimes basic RAG just
- [0:22] isn't enough to reach
the quality you want.
- [0:24] Luckily, when that
happens, there
- [0:26] are many advanced techniques
based on RAG that you can try.
- [0:29] One of the most important
things to remember
- [0:31] is that the context you provide
to the LLM matters a lot.
- [0:34] Context in this
case is the material
- [0:36] you retrieve and augment
your prompt with.
- [0:38] If the context isn't highly
relevant to the user's prompt
- [0:41] or question, the
LLM may generate
- [0:43] a response that is irrelevant to
the user's prompt or question.
- [0:46] AJA HAMMERLY: And if there
isn't enough context,
- [0:48] the LLM may generate
an incorrect response.
- [0:50] It might hallucinate or it may
not generate a response at all.
- [0:54] Because context is so
critical to response quality,
- [0:58] many advanced RAG
techniques focus
- [1:00] on improving the context
included with the user's prompt.
- [1:03] JASON DAVENPORT: All right.
- [1:04] So to make it easier
to follow along today,
- [1:06] we'll cover these
techniques based
- [1:08] on the stage of
the RAG information
- [1:09] flow they are used
at, and we're going
- [1:11] to start with pre-processing.
- [1:13] AJA HAMMERLY: In basic RAG,
we divided our knowledge base
- [1:15] into chunks and stored the
chunks in a vector database.
- [1:19] So what are some of our options
that may improve accuracy?
- [1:22] JASON DAVENPORT:
Well, our first option
- [1:24] is that we could store some
metadata with each chunk,
- [1:26] like the main topic, the
category the chunk fits in,
- [1:29] or a specific product that
the chunk is relevant to,
- [1:32] or whatever makes sense
in your specific use case.
- [1:36] You can manually input
this data at ingestion time
- [1:38] based on what you know about the
data sources you are ingesting.
- [1:41] Perhaps all the chunks from a
specific product's user manual
- [1:44] should have that product
ID in the metadata
- [1:47] or labeling the information
with the country
- [1:49] tags of the countries that
the specific chunk is actually
- [1:52] relevant to.
- [1:53] You can also ask
an LLM to expand
- [1:56] its own understanding
of existing chunks
- [1:58] by generating new metadata.
- [2:00] For example, providing an LLM
a list of potential labels
- [2:03] and asking which ones to
apply to a specific chunk
- [2:06] via classification.
- [2:08] When you go to
retrieve your chunks,
- [2:09] you can then use the metadata
to filter your vector database
- [2:13] before finding similar chunks.
- [2:15] AJA HAMMERLY: That was a lot.
- [2:17] Can you give me an example?
- [2:18] JASON DAVENPORT: OK.
- [2:19] Let's say that you know
a user is asking you
- [2:21] about a specific product.
- [2:23] If your chunks have the metadata
for the product or maybe
- [2:26] a product ID, you can
filter to just data
- [2:29] about that specific product
before you do the similarity
- [2:32] search to ensure you only
return the information
- [2:35] relevant to the specific
product for the prompt.
- [2:37] AJA HAMMERLY: Another
technique takes advantage
- [2:39] of the fact that
questions or prompts
- [2:41] and answers or responses
often use different words
- [2:44] in different order.
- [2:45] And this technique, when
you pre-process your data,
- [2:48] you ask the LLM to generate
a hypothetical question
- [2:51] or prompt that could be answered
by a specific chunk of data
- [2:55] that you are processing.
- [2:56] Then you store this question
along with the data.
- [2:59] When you need to find
information relevant to a user's
- [3:02] prompt, you search
for similarity
- [3:04] in the hypothetical questions
instead of or in addition
- [3:07] to looking for similarity
in the raw chunks.
- [3:10] JASON DAVENPORT:
That's pretty cool.
- [3:11] A final option we'll
talk about here
- [3:13] is that you can also implement
at the pre-processing phase
- [3:16] a way to change how
you store the data.
- [3:18] And RAG doesn't have to
use a vector database.
- [3:21] You can use traditional
relational databases or even
- [3:24] a graph database as well
if it fits your data.
- [3:27] If the data you're using
for context is structured,
- [3:30] something like a
relational database
- [3:32] may be better suited for that
than something like a vector
- [3:34] database.
- [3:35] AJA HAMMERLY: And you can
also store the same data
- [3:37] in different ways.
- [3:39] For example, you can store data
twice using two different chunk
- [3:42] sizes and pull from both when
generating the information
- [3:46] to accompany the user's
prompts to the LLM.
- [3:48] And if you have data in
multiple data stores,
- [3:51] you can combine them at
the retrieval stage of RAG.
- [3:53] JASON DAVENPORT: I think
we need another example.
- [3:54] AJA HAMMERLY: Fair enough.
- [3:56] If a customer's prompt
was about, I don't know,
- [3:57] a delayed shipment, you
could combine information
- [4:00] about shipping methods from
documents in your vector
- [4:03] database with information about
a customer's recent orders
- [4:06] from a Postgres database
and general information
- [4:09] about the weather impacts on
shipping from maybe the shipping
- [4:12] company's API.
- [4:13] JASON DAVENPORT: And then our
LLM's response would potentially
- [4:16] contain information from
all of those sources
- [4:19] if it was needed to actually
answer the question.
- [4:21] AJA HAMMERLY: Exactly.
- [4:22] We also should keep in mind that
while most RAG tutorials use
- [4:26] vector databases, vector
databases are not a must have
- [4:29] or even the best retrieval
method and storage
- [4:31] method for every use case.
- [4:33] Based on requirements, you may
consider using other retrieval
- [4:36] methods like relational
databases, keyword search,
- [4:40] hybrid search, graph
databases, and any search API
- [4:45] you already have
in your systems.
- [4:47] JASON DAVENPORT: Once you've
retrieved relevant data,
- [4:49] you can help the
LLM use that data
- [4:51] more efficiently through a
process called reranking.
- [4:54] And reranking can
get complicated,
- [4:55] and it probably
deserves its own video,
- [4:57] but we'll try to give you the
specifics and a couple of ways
- [5:00] it can be useful here.
- [5:01] AJA HAMMERLY: So when you
add reranking to your RAG
- [5:04] application, you're
adding a step
- [5:05] between retrieving the chunks
and sending those chunks
- [5:08] to the LLM with the prompt.
- [5:10] In the reranking step,
you use an algorithm
- [5:13] of some kind to score
the chunks by which
- [5:16] ones are most relevant or
useful to the user's prompt.
- [5:19] You can then use those
scores to reorder the chunks
- [5:22] and choose only the best
ones to send to the LLM.
- [5:25] JASON DAVENPORT: So let's say
your reranking algorithm may
- [5:29] return a score for
each of the chunks
- [5:31] and then you can
program your RAG system
- [5:33] to only send those chunks
with a score of at least 0.9,
- [5:37] as example, to the LLM.
- [5:38] AJA HAMMERLY: And your
reranking algorithm
- [5:40] can take many
things into account
- [5:42] as it determines which pieces
of data are most useful.
- [5:45] For example, maybe you want
more recent information
- [5:48] to be considered more relevant,
or maybe you track user feedback
- [5:52] and you want that data
taken into account when
- [5:54] deciding what data is relevant.
- [5:56] JASON DAVENPORT:
Or maybe you know
- [5:57] you found through experimenting
the particular sources,
- [6:00] like official documentation,
often produce higher quality
- [6:04] answers and you want those
sources to be considered
- [6:07] more relevant when
deciding which context
- [6:09] to include with your prompt.
- [6:11] AJA HAMMERLY: And of course,
you can use AI and data science
- [6:14] here.
- [6:14] There are a variety
of algorithms
- [6:16] that can score how relevant
a given chunk of data
- [6:19] is for a given prompt.
- [6:20] And potentially, you can combine
several reranking techniques
- [6:24] to get the best reranking
for your use case.
- [6:26] JASON DAVENPORT: I think
the most important thing
- [6:28] about reranking to think
about is that it gives you
- [6:30] another chance to ensure
the context you're sending
- [6:33] to the LLM is the most
relevant and the most helpful
- [6:36] it can be in context of
answering the question.
- [6:39] That's a lot of ideas for
how to tune your RAG app.
- [6:42] AJA HAMMERLY: We've still
got a few more ideas
- [6:43] that people can try.
- [6:45] Most RAG systems make one call
to the LLM per user prompt,
- [6:49] but you may be able to
improve the accuracy by making
- [6:52] multiple calls to the LLM.
- [6:54] JASON DAVENPORT: As we
mentioned in a previous video,
- [6:56] it can help to have the LLM
optimize the user's prompt.
- [6:59] This can remove spelling
mistakes and unnecessary words
- [7:03] and maybe replace words
with more common synonyms.
- [7:06] AJA HAMMERLY: You can also
ask the LLM to summarize
- [7:08] all the data chunks you
retrieved from your data
- [7:10] store, which may also
improve the quality
- [7:13] or accuracy of the responses.
- [7:15] JASON DAVENPORT: And
speaking of accuracy, you
- [7:17] can also ask the LLM to
evaluate the accuracy
- [7:20] and relevance of its own results
once you've generated an answer.
- [7:24] AJA HAMMERLY: I know it seems
like the LLM should always
- [7:26] respond that the text it
just generated was correct,
- [7:30] but that's not how
it works in practice.
- [7:32] JASON DAVENPORT: All right.
- [7:33] Are we done now?
- [7:34] AJA HAMMERLY: We're done.
- [7:35] There's a lot of
different things
- [7:37] you can change about the
basic RAG architecture
- [7:39] to improve the quality
of the results.
- [7:41] And which one works
for you depends
- [7:44] on your use case, your data, and
the other standard constraints
- [7:47] like budget and latency
that we've discussed before.
- [7:50] JASON DAVENPORT: All right.
- [7:50] And if you'd like to try
some of these techniques,
- [7:52] we've included links to
codelabs on semantic search
- [7:55] and using methods like graph
RAG in the description below.
- [8:00] AJA HAMMERLY: This is Aja
and Jason signing off.
- [8:02] JASON DAVENPORT:
And happy prompting.
- [8:03] [MUSIC PLAYING]
