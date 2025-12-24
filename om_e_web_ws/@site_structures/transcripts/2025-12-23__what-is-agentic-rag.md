<!-- signature: 0z9_MhcYvcY:89:36ce925c34b91f0106b240fc28df10e82ffe2f78244bec909baf5e0234d53eae -->
# What is Agentic RAG?

**Video URL:** https://www.youtube.com/watch?v=0z9_MhcYvcY&t=186s
**Video ID:** 0z9_MhcYvcY
**Language:** en
**Collected At:** 1766523568712
**Segments:** 89

---

- [0:00] So we all know what retrieval augmented
generation is.
- [0:04] But let's just do a quick refresher.
- [0:06] Retrieval augmented generation is a powerful and popular
- [0:10] pipeline that enhances responses
from a large language model.
- [0:14] It does this by incorporating relevant
data retrieved from a vector database,
- [0:18] adding it as context to the prompt,
and sending it to the LLM for generation.
- [0:22] What this does is it allows the LLM to ground its response in concrete and accurate information,
- [0:28] and that improves the quality
and reliability of the response.
- [0:31] Let me quickly sketch it out.
- [0:34] So let's say we have a user
- [0:37] or an application, even.
- [0:41] And they send a query.
- [0:44] Now without retrieval augment
the generation.
- [0:47] This query is going to go and get itself
interpolated into a prompt.
- [0:55] And from there
- [0:57] that's going to hit the LLM.
- [1:01] And that's going to generate an output.
- [1:07] To make this rag.
- [1:09] We can add a vector database.
- [1:12] So instead of just going directly
and getting itself
- [1:14] interpolated into the prompt, it's
going to hit this vector db.
- [1:17] And the response from that vector db
is going to be used as context
- [1:21] for the prompt.
- [1:23] Now in this typical pipeline
we call the LLM only once,
- [1:27] and we use it
solely to generate a response.
- [1:30] But what if we could leverage the LLM
not just for responses,
- [1:34] but also for additional tasks like deciding
which vector database to query
- [1:39] If we have multiple databases, or even determining the type of response
to give?
- [1:43] Should an answer with text generate a chart
or even provide a code snippet?
- [1:48] And that would all be dependent
on the context of that query.
- [1:52] So this is where the agenetic RAG
pipeline
- [1:57] comes into play.
- [1:58] In agenetic RAG, we use the LLM as an agent and the LLM goes
beyond just generating a response.
- [2:05] It takes on an active role
and can make decisions that will improve
- [2:09] both the relevance
and accuracy of the retrieved data.
- [2:13] Now, let's explore how we can augment
the initial process
- [2:16] with an agent
and a couple of different sources of data.
- [2:20] So instead of just one single source,
- [2:22] let's add a second.
- [2:25] And the first one can be, you know,
- [2:28] internal documentation, Right?
- [2:31] And the second one can be general industry knowledge.
- [2:39] Now in the internal documentation
we're going to have things
- [2:42] like policies procedures and guidelines.
- [2:44] And the general knowledge base
- [2:45] will have things like industry standards,
best practices and public resources.
- [2:51] So how can we get the LLM to use the vector database
- [2:54] that contains the data
that would be most relevant to the query?
- [2:58] Let's add that agent into this pipeline.
- [3:05] Now, this agent can intelligently decide
which database
- [3:08] to query based on the user's question,
and the agent isn't making a random guess.
- [3:12] It's leveraging the LLMs language,
understanding capabilities
- [3:17] to interpret the query and determine its context.
- [3:21] So if an employee asks
what's the company's policy on remote work
- [3:24] during the holidays, it would route that
to the internal documentation,
- [3:28] and that response
will be used as context for the prompt.
- [3:31] But if the question is more general,
like what are the industries standards
- [3:35] for remote work in tech companies,
- [3:38] the agent's going to route
that to the general knowledge database,
- [3:40] and that context is going to be used
within that prompt powered by an LLM
- [3:45] and properly trained, the agent analyzes
the query and based on the understanding
- [3:50] of the content and the context, decides
which database to use.
- [3:54] But they're not always going to ask
questions that are generally
- [3:57] or genuinely relevant to any of this,
any of the stuff that we have
- [4:00] in our vector DB.
- [4:01] So what if someone asks a question
that is just totally out of left field?
- [4:05] Like who won the World Series in 2015?
- [4:08] What the agent can do at that point
is it could route it to a failsafe.
- [4:15] So because the agent is able
- [4:16] to recognize the context of the query,
- [4:21] it could recognize that it's not a part
of the two databases that we have,
- [4:25] could route it to the failsafe
and return back.
- [4:29] Sorry, I don't have the information
in looking for.
- [4:32] This agentic RAG pipeline can be used in customer
support systems and legal tech.
- [4:37] For example, a lawyer can source
- [4:39] answers to their questions
from like their internal briefs
- [4:42] and then in another query, just get stuff
from public caseload databases.
- [4:46] The agent can be utilized
in a ton of ways.
- [4:49] Agentic RAG is an evolution in how
we enhance the RAG pipeline by moving
- [4:53] beyond simple response generation
to more intelligent decision making.
- [4:58] By allowing an agent
to choose the best data sources
- [5:01] and potentially even incorporate
external information
- [5:04] like real timedata or third party services.
- [5:07] We can create a pipeline that's more responsive, more accurate, and more adaptable.
- [5:13] This approach opens up
so many possibilities for applications
- [5:16] in customer
service, legal, tech, health care,
- [5:19] virtually any field
as IT technology continues to evolve.
- [5:23] We will see AI systems
that truly understand context
- [5:26] and can deliver amazing values to the end user.
