# How to Use Agents in Claude Code

## Current Capabilities

### ✅ What Works Now

1. **Spawn agents programmatically** via Task tool
2. **Parallel agent execution** (multiple agents in one message)
3. **Agent templates** define behavior for spawned agents

### ❌ Current Limitations

1. **No separate terminal windows** - Agents run within the current Claude Code session
2. **Custom agents not directly invokable** - `.claude/agents/*.md` files are templates, not standalone executables
3. **No CLI interface** - Can't run `claude-code --agent ome` from terminal

---

## Method 1: Spawn Agents Programmatically (Recommended)

### Single Agent

Tell Claude to spawn an agent:

```
Hey Claude, I need you to spawn a general-purpose agent to analyze
the performance of content.js and suggest optimizations.
```

Claude will use the Task tool:
```javascript
Task({
  subagent_type: "general-purpose",
  prompt: "Analyze content.js performance and suggest optimizations...",
  description: "Performance analysis"
})
```

### Multiple Agents in Parallel

Tell Claude to spawn multiple agents at once:

```
Spawn 3 agents in parallel:
1. Agent to review content.js for bugs
2. Agent to analyze sw.js message handling
3. Agent to optimize ws_server.py artifact generation
```

Claude creates 3 parallel Task calls in a single message.

---

## Method 2: Using Your Custom OME Agent

The `ome.md` agent you created is a **template/instructions file**. Here's how to use it:

### Approach A: Reference in Prompts

When asking questions, reference the agent's knowledge:

```
Using the OME agent's knowledge of bigDaDDySA.md,
explain how the capability pipeline works.
```

### Approach B: Spawn with Agent Instructions

Create a general-purpose agent and inject OME instructions:

```
Spawn an agent that:
1. Reads /Users/andy7string/Projects/Om_E_Web/.claude/agents/ome.md
2. Follows those instructions exactly
3. Answers this question: "How does SPA navigation affect page versions?"
```

---

## Method 3: Simulating "Separate Terminals"

While you can't have literal terminal windows, you can simulate parallel workflows:

### Pattern 1: Sequential Agent Spawning

```
Spawn Agent 1: Analyze content.js
[Wait for result]

Now spawn Agent 2: Review sw.js based on Agent 1's findings
[Wait for result]

Finally spawn Agent 3: Update bigDaDDySA.md with both analyses
```

### Pattern 2: Independent Agent Threads

```
I need 4 independent agent threads working in parallel:

Thread 1 (OME Expert):
- Read bigDaDDySA.md
- Answer: "Why do we have two execution pipelines?"

Thread 2 (Code Reviewer):
- Review content.js lines 1000-1500
- Find potential bugs

Thread 3 (Performance Analyzer):
- Analyze ws_server.py artifact generation
- Suggest optimizations

Thread 4 (Documentation Writer):
- Create a quick reference guide for message types

Run all 4 in parallel, report back when all complete.
```

---

## Method 4: Custom Agent Invocation (Workaround)

Since custom agents aren't directly invokable, here's a workaround:

### Create a "Meta-Agent Spawner"

Create a prompt template:

```bash
# File: .claude/prompts/spawn_ome.md
Spawn a general-purpose agent with these instructions:

1. You are the OME (Om_E_Web) architecture expert
2. Read /Users/andy7string/Projects/Om_E_Web/bigDaDDySA.md
3. Read /Users/andy7string/Projects/Om_E_Web/.claude/agents/ome.md
4. Follow the OME agent instructions exactly
5. Answer the user's question: {{QUESTION}}

Use the knowledge from bigDaDDySA.md and component docs (001/002/003)
to provide expert architectural guidance.
```

Then use it:
```
Use the spawn_ome template with QUESTION="How does page version tracking work?"
```

---

## Practical Workflows

### Workflow 1: Research + Implementation

```
Phase 1: Spawn research agent
"Research how to add a new capability for infinite scroll"

Phase 2: Spawn implementation agent
"Based on the research, implement the infinite scroll capability"

Phase 3: Spawn review agent
"Review the implementation and suggest improvements"
```

### Workflow 2: Parallel Analysis

```
Analyze the codebase with 3 specialists in parallel:

1. Security Agent: Find security vulnerabilities
2. Performance Agent: Identify performance bottlenecks
3. Architecture Agent (OME): Validate design patterns

Report all findings together.
```

### Workflow 3: Documentation Pipeline

```
Run a 4-stage documentation pipeline:

Stage 1: Analyzer Agent
- Read code
- Extract key functions
- Output: function_list.json

Stage 2: Documenter Agent (uses Stage 1 output)
- Document each function
- Output: functions.md

Stage 3: Architect Agent (uses Stage 1+2)
- Create architecture diagrams
- Output: architecture.md

Stage 4: Reviewer Agent (uses all outputs)
- Check completeness
- Output: review_report.md
```

---

## Advanced: Agent Orchestration

### Pattern: Hierarchical Agents

```
Spawn a "Meta-Agent" that orchestrates 3 sub-agents:

Meta-Agent responsibilities:
1. Spawn 3 specialist agents
2. Collect their results
3. Synthesize into final report

Sub-Agent 1: Code Analyzer
Sub-Agent 2: Performance Profiler
Sub-Agent 3: Documentation Generator

Meta-Agent waits for all 3, then creates unified report.
```

### Pattern: Iterative Refinement

```
Spawn Agent 1: Generate initial solution
Spawn Agent 2: Review and critique Agent 1's solution
Spawn Agent 3: Refine based on Agent 2's feedback
Spawn Agent 4: Final validation and documentation
```

---

## Tips for Effective Agent Use

### ✅ Do This

- **Clear instructions** - Be specific about what each agent should do
- **Parallel when possible** - Spawn independent agents together
- **Reference artifacts** - Tell agents which files to read
- **Sequential dependencies** - Chain agents when one needs previous results
- **Validate outputs** - Have review agents check work

### ❌ Avoid This

- **Vague prompts** - "Analyze the code" is too broad
- **Over-spawning** - Don't spawn 20 agents for a simple task
- **Missing context** - Tell agents what files/docs they need
- **Ignoring outputs** - Always read what agents produce
- **No validation** - Have a final review step

---

## Example: Complete Multi-Agent Workflow

### Task: Add New Feature with Full Documentation

```
I need to add a "screenshot capture" capability to Om_E_Web.
Run a complete multi-agent workflow:

PARALLEL PHASE (3 agents):
  Agent 1 (Research): Find best practices for screenshot APIs
  Agent 2 (OME Expert): Explain where to add capabilities
  Agent 3 (Code Scanner): Find similar capability implementations

SEQUENTIAL PHASE (uses parallel results):
  Agent 4 (Implementer): Write the screenshot capability

PARALLEL REVIEW PHASE (2 agents):
  Agent 5 (Code Reviewer): Review implementation
  Agent 6 (Documenter): Update bigDaDDySA.md with new capability

FINAL PHASE:
  Agent 7 (Integrator): Verify all pieces work together

Report progress after each phase.
```

---

## Future Enhancements (Wishlist)

What we'd like to have:

1. **`claude-code agent spawn ome`** - CLI to spawn agents
2. **Agent terminal multiplexer** - Multiple agent windows
3. **Agent persistence** - Agents that stay alive across sessions
4. **Agent communication** - Agents talking to each other
5. **Agent marketplace** - Share custom agents

---

## Summary

**Current Reality:**
- ✅ Spawn agents via Task tool in current session
- ✅ Run multiple agents in parallel
- ✅ Chain agents sequentially
- ❌ No separate terminal windows
- ❌ No direct custom agent invocation

**Best Practice:**
Use descriptive prompts to spawn agents with specific instructions.
Reference your custom agent templates (like ome.md) by telling
Claude to read and follow those instructions.

**For OME Agent Specifically:**
```
Spawn a general-purpose agent that:
1. Reads bigDaDDySA.md
2. Follows instructions in .claude/agents/ome.md
3. Acts as Om_E_Web architecture expert
4. Answers: [YOUR QUESTION]
```

This gives you the OME agent's behavior without needing separate terminals.
