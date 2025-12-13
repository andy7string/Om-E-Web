<!-- signature: McLdlg5Gc9s:53:aea1536009f82cb7cc9890085e081da7bee966c0b81d0257b334a8d2fc53d076 -->
# What is vLLM? Efficient AI Inference for Large Language Models

**Video URL:** https://www.youtube.com/watch?v=McLdlg5Gc9s
**Video ID:** McLdlg5Gc9s
**Language:** en
**Collected At:** 1765590956049
**Segments:** 53

---

- [0:00] Have you ever wondered how AI-powered applications like chatbots, code assistants, and more can respond so quickly?
- [0:06] Or perhaps you've experienced the frustration of waiting for a large language model to provide you a response.
- [0:12] And you're wondering, hey, what's taking so long?
- [0:15] Well, behind the scenes, there's an open source project that's aimed at making inference or responses for models more efficient and fast.
- [0:24] So, VLLM, which is originally developed at UC Berkeley.
- [0:29] Was specifically designed to address the speed and memory challenges that come with running large AI models.
- [0:35] It supports quantization, tool calling, and a whole wide variety of popular LLM architectures from llama to Mistral to granite, you name it.
- [0:44] But let's learn why the project is gaining popularity and start off by talking about some of the challenges of running LLMs today.
- [0:51] Because language models, and for example, LLMs, are essentially predicting machines, like this crystal ball right here.
- [0:58] And serving one of these LLMs on a virtual machine or in Kubernetes requires an incredible amount of calculations to be performed
- [1:05] to generate each word of their response.
- [1:07] And this is unlike other traditional workloads and can often be expensive, slow, and memory intensive.
- [1:14] And for those wanting to run these LLMs in production, you might run into issues such as memory hoarding.
- [1:21] So, what happens here is with traditional LLM frameworks for serving a model,
- [1:25] they sometimes allocate GPU memory inefficiently.
- [1:29] So for example, this can waste expensive resources and force organizations
- [1:34] to purchase more hardware than needed just to serve one of these models.
- [1:38] At the same time, there's issues with latency from the model or the responses and the time it takes to get a response back.
- [1:45] Since more users interacting with the LLM means slower responses back from the model,
- [1:49] well, this is because of batch processing bottlenecks
- [1:53] and is also an issue with running these models.
- [1:55] At the same time, there's issues with scaling.
- [1:59] So in order to take a model and be able to provide it to a large organization,
- [2:03] you're going to exceed single GPU memory and flop capability,
- [2:07] and it requires complicated setups and distributed environments that introduce additional overhead and technical complexity.
- [2:15] So there's a need for LLM serving to be efficient and affordable.
- [2:19] And that's exactly where a research paper from UC Berkeley came out to introduce
- [2:23] an algorithm, and an open source project called VLLM.
- [2:27] And it aims to solve issues from memory fragmentation to batch execution and distributing inference.
- [2:34] And with the initial paper, there were some incredible benchmarks and results,
- [2:38] including 24 times throughput improvements compared to similar systems like hugging face transformers
- [2:44] and TGI or text generation inference.
- [2:47] Now the project continues to improve performance and GPU resource usage while reducing latency, but let's learn exactly how it does so.
- [2:56] Within the original paper, there was the introduction of an algorithm called paged attention.
- [3:01] And what does this algorithm do?
- [3:03] Well, essentially it's used by VLLM in order to help better manage attention keys and values that are used to generate next tokens,
- [3:11] often referred to as K.V. cache.
- [3:14] So instead of keeping everything loaded at once and contiguous memory spaces,
- [3:18] it divides the memory into manageable chunks like pages in a book.
- [3:23] And it only accesses what it needs when necessary, kind of like how your computer handles virtual memory.
- [3:30] In addition, instead of handling requests like an assembly line going one by one,
- [3:34] what VLLM does is bundles together a request with what's known as continuous batching.
- [3:40] And what this allows us to do is fill GPU slots immediately as soon as sequences are completed.
- [3:45] It also includes optimizations for serving models such as CUDA drivers in order to maximize performance on specific hardware.
- [3:53] Now, you're likely going to end up deploying a model on a Linux machine, whether it's a virtual machine or a Kubernetes cluster,
- [3:58] using VLLM as a runtime or perhaps a CLI tool.
- [4:04] So you can actually use the pip command to do a pip install and point to VLLM in order to use it on your terminal interface
- [4:13] and be able to download and serve models with an OpenAI API endpoint that's compatible with your existing apps and services.
- [4:21] But it's optimized for quantized or compressed models, and it helps you to save GPU resources while ensuring model accuracy.
- [4:30] Now, VLLM is among many tools for serving LLMs, but it's quickly been growing in popularity.
- [4:36] But if you have any questions or comments about models and inferencing, please let us know in the comments below.
- [4:42] And don't forget to like and subscribe for more in-depth content on AI and beyond.
- [4:47] Thanks for watching.
