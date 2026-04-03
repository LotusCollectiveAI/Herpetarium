# Context Engineering, MCP, and Spec-Driven Development for Herpetarium V2

**Research analysis — April 2026**

This document maps the March 2026 state of context engineering, MCP, spec-driven development, formal verification, and agentic engineering patterns onto the specific architectural needs of Herpetarium V2 as defined in `VISION_HERPETARIUM_V2.md`.

---

## 1. How Context Engineering Principles Should Shape the Prompt Compiler

The Prompt Compiler is the mechanism that deterministically renders a typed Team Genome into player and coach prompts. Context engineering in 2026 has matured from "write better prompts" into a systems discipline with four core operations: **Write** (persist state outside the window), **Select** (retrieve only what is relevant), **Compress** (summarize to save space), and **Isolate** (separate concerns across agents with distinct context windows). Every one of these maps directly onto a Prompt Compiler design decision.

### 1.1 Context Isolation Is the Compiler's Primary Constraint

The Prompt Compiler must render different views of the same genome for different roles. The anchor sees doctrine plus its role slice. The interceptor sees opponent-modeling tactics plus its role slice. The coach sees the full genome, belief ledger, patch ledger, and institutional memory. The foreign skeptic sees a redacted view filtered by visibility tiers.

This is exactly the "context isolation" pattern that Google's ADK framework and the GSD system both treat as foundational: each agent sees the minimum context required for its task, and nothing more. The compiler is not just a template engine. It is a **context selector** that enforces information architecture.

Concrete design implication: The Prompt Compiler should be implemented as a pipeline of named, ordered context processors (following ADK's architecture), not as a single template-rendering function. Each processor handles one concern:

1. **GenomeResolver** — loads the versioned genome, resolves inheritance from germline parent
2. **VisibilityFilter** — strips layers and rules the target role is not permitted to see
3. **RoleProjector** — selects the role slice and role-relevant doctrine/tactics
4. **ContextBudgeter** — measures token count against the target model's window, compresses or prunes if needed
5. **ABIRenderer** — renders the final prompt in the stable ABI format for the target model family
6. **ModelAdapter** — applies model-family-specific formatting (XML tags for Claude, markdown headers for GPT, etc.)

### 1.2 Context Poisoning Is the Compiler's Primary Failure Mode

Google DeepMind's Philipp Schmid estimates 80% of agent failures stem from context misinformation. In Herpetarium, context poisoning takes a specific form: stale beliefs persisting in the Belief Ledger, rollback-worthy patches surviving in the genome, or disclosed tactics still being rendered into player prompts after FOIA release.

The compiler must implement **context freshness checks**:
- Every rule rendered must be checked against the current disclosure clock. If a tactic's FOIA window has expired and the tactic has not been rotated, the compiler should flag it.
- Belief Ledger entries feeding into coach prompts must carry recency metadata. Beliefs older than N sprints without update should be marked stale.
- Patch cards with negative yield that have not been explicitly retained should be excluded from rendering.

### 1.3 Deterministic Rendering Enables Reproducibility

The 2026 finding that constrained decoding drops iteration rates from 38.5% to 12.3% reinforces V2's instinct that the compiler must be deterministic. Same genome version + same ABI version + same target model = same prompt, byte-for-byte. This is non-negotiable for reproducible science.

The compiler should output a content hash alongside every rendered prompt. That hash becomes part of the match record and enables exact replay.

### 1.4 Cross-Model Adaptation Is a First-Class Concern

The compiler must produce prompts that work across Claude, GPT, Gemini, and potentially Mistral. The 2026 prompt engineering landscape confirms that model families respond differently to structural cues: Claude works well with XML-structured system prompts, GPT responds to markdown hierarchy, Gemini handles inline JSON schemas well.

The ABIRenderer + ModelAdapter split means the semantic content (genome rules, role instructions, tactical directives) is separated from the presentation format. The ABI defines the semantic contract. The ModelAdapter handles dialect.

This is analogous to how compilers separate IR (intermediate representation) from target-specific code generation. The genome is source code. The ABI is the IR. The model-specific prompt is the target binary.

---

## 2. What MCP Servers Should Be Built or Adopted for Herpetarium

The MCP ecosystem now has 14,000+ servers. The relevant question is not "what exists" but "what does Herpetarium actually need, given its closed-ecology constraint?"

### 2.1 MCP Servers Herpetarium Should NOT Use in Live Play

The vision doc is explicit: no web search, no arbitrary code execution, no external retrieval in live play or coaching. This rules out arXiv MCP, web search MCP, and general-purpose retrieval MCP for anything inside the game ecology. The closed-ecology principle is a scientific necessity, not a limitation.

### 2.2 MCP Servers Herpetarium SHOULD Build (Custom)

**a) Genome MCP Server**

A custom MCP server that exposes the Team Genome, Belief Ledger, Patch Ledger, and Institutional Memory as structured resources to coach agents. This server would:
- Serve genome state at any version via `genome://team-cobra/v17`
- Expose patch history as a queryable resource
- Enforce visibility rules (the foreign skeptic's MCP session sees only what it is permitted to see)
- Accept patch card submissions as MCP tool calls, with validation

This is the single most valuable MCP server for V2. It turns the four coach artifacts into a proper API surface that any model family can interact with through the same protocol.

**b) Transcript Analysis MCP Server**

Wraps the existing `transcriptAnalyzer.ts` as an MCP server that coaches can invoke. Tools would include:
- `analyze_leakage(match_id, round_range)` — returns leakage heuristics
- `compute_opacity(team_id, sprint_range)` — returns opacity scores
- `extract_clue_families(team_id, sprint_range)` — returns clustered clue patterns
- `compare_transcripts(match_a, match_b)` — returns semantic drift between matches

**c) Experiment Control MCP Server**

Exposes experiment configuration, sprint status, disclosure schedules, and match queuing as MCP resources. This lets the experiment DSL be consumed by orchestration agents without direct database access.

### 2.3 MCP Servers Herpetarium Should Adopt (Existing)

**a) SQLite MCP Server** (Anthropic's reference implementation or `jparkerweb/mcp-sqlite`)

If V2 migrates from flat JSON to SQLite (as the Signal Garden roadmap suggests), the SQLite MCP server gives coaches and analysis agents structured query access to match data, tournament history, and genome archives. 165 SQLite MCP implementations exist; the Anthropic reference server is the cleanest.

**b) Filesystem MCP Server** (reference implementation)

For reading/writing the `data/` directory structure, genome files, patch cards, and institutional memory documents. Already battle-tested.

### 2.4 MCP Servers for the Research Layer (Outside the Ecology)

These are useful for the Signal Garden / Herpetarium research infrastructure, not for live play:

- **arXiv MCP Server** (`blazickjp/arxiv-mcp-server`) — for literature search when writing papers about Herpetarium findings
- **Paper Search MCP** (`openags/paper-search-mcp`) — multi-source academic search across arXiv, PubMed, bioRxiv, OpenAlex, CORE
- **MCP Registry Search** (`mcp-registry` — already available in this environment) — for discovering new servers as the ecosystem grows

### 2.5 The Lean LSP MCP Pattern Is Instructive

Leanstral's architecture integrates with Lean's Language Server Protocol through MCP. This pattern — wrapping a language server as an MCP server so an agent can query the compiler for type information and diagnostics in real time — is directly relevant to how the Prompt Compiler could be exposed. A Compiler MCP Server could let coaches "type-check" proposed patches against the genome schema before committing them, the same way Leanstral queries Lean's type system before generating proofs.

---

## 3. How Spec-Driven Development Changes the Coach Loop

### 3.1 The Genome IS a Spec

The most important insight from the spec-driven development movement for Herpetarium is this: the Team Genome is already a machine-readable specification. It has typed rules with stable IDs, layered visibility, versioning, and explicit mutation semantics. It is closer to a formal spec than most things called specs in the SDD world.

This means the coach loop is already spec-driven development, whether or not it uses that label. The coach reads the current spec (genome). The coach diagnoses failures against that spec. The coach proposes patches (spec modifications). The patches are validated. The compiler renders the new spec into executable prompts.

### 3.2 GitHub Spec Kit Patterns That Apply

GitHub Spec Kit (72.7k stars, 110 releases, supports 22+ agent platforms) provides a useful scaffold:

- **Specs as code artifacts**: Genomes should live in version control alongside match data. Every genome version is a commit. Every patch card is a diff.
- **Spec validation before execution**: The compiler should reject genomes that violate ABI constraints before rendering prompts. This is the equivalent of Spec Kit's "spec lint" step.
- **Cross-agent compatibility**: Spec Kit's templates are designed to work across Claude Code, Copilot, Gemini CLI, Cursor, and Windsurf. The genome schema should be similarly agent-agnostic — any model family should be able to read and propose patches to the genome format.

### 3.3 The Six-Stage Coach Loop as a Spec-Driven Pipeline

The coach loop can be formalized as a spec-driven pipeline where each stage has explicit inputs, outputs, and validation:

| Stage | Input Spec | Output Spec | Validation |
|-------|-----------|-------------|------------|
| 1. Autopsy | Match transcripts + current genome | Failure matrix (typed) | All losses must be classified into failure categories |
| 2. Diagnosis | Failure matrix + Belief Ledger | Updated Belief Ledger | Each hypothesis must cite evidence; confidence must be bounded |
| 3. Patch Proposal | Belief Ledger + current genome | Candidate patch cards | Each patch must target a rule ID, cite a belief, declare confidence |
| 4. Skeptic Review | Patch cards + genome + disclosure schedule | Reviewed patch cards with vetoes/approvals | Skeptic must provide counterfactual for each veto |
| 5. Patch Commit | Approved patches | New genome version | Genome must pass ABI validation; patch budget must not be exceeded |
| 6. Compile | New genome | Rendered prompts per role | Prompts must be deterministic and within token budget |

Each stage's output is a machine-readable artifact that can be validated against a schema before the next stage begins. This is spec-driven development applied to strategic adaptation rather than software development.

### 3.4 Spec-Driven Development Prevents Context Rot in the Coach

The GSD framework's central insight — that context rot degrades agent quality as the window fills — applies directly to the coach loop. A naive implementation would dump the entire genome, all match transcripts, the full belief ledger, and all patch history into a single coach prompt. That prompt would rot.

The spec-driven approach says: each coach stage gets a fresh context window with only the artifacts relevant to that stage. The autopsy stage sees transcripts and the current genome. The diagnosis stage sees the failure matrix and the belief ledger. The patch proposal stage sees the updated beliefs and the genome. Context is isolated per stage.

This is the GSD pattern applied at the architecture level: the orchestrator spawns each coach stage as a subagent with a clean context, passes only the relevant spec artifacts, collects the output, validates it, and passes it to the next stage.

---

## 4. Formal Verification and Genome Compilation

### 4.1 What Leanstral Actually Does

Leanstral (released March 16, 2026, Apache 2.0, 120B parameters / 6B active) is not a general-purpose code verifier. It is a specialized agent trained to operate natively in Lean 4 repositories, understanding Lean's type system, tactic language, and proof obligations. It generates both implementation code and machine-checkable proofs that the code meets its specification.

The key technical detail: Leanstral uses MCP to query Lean's Language Server Protocol in real time, getting type information and error diagnostics as it works. It does not guess and check. It reasons with the compiler.

### 4.2 Where Formal Verification Could Apply to Herpetarium

**Genome schema validation (YES, directly applicable)**

The Team Genome is a typed, layered data structure. Its invariants are expressible:
- Every rule has a unique ID within its layer
- Visibility constraints are monotonic (private rules cannot reference public evidence from the future)
- Patch cards must target existing rule IDs or declare new ones
- The mutation budget must not be exceeded per sprint
- Disclosure schedules must be consistent (FOIA lag >= 0, expiry sprint > current sprint)

These invariants could be expressed in Lean 4 and verified. A genome that passes the Lean type-checker is guaranteed to be structurally valid. This is not overkill — it is exactly the kind of specification that formal verification handles well: structural properties of data, not semantic properties of strategy.

**Prompt ABI compliance (YES, applicable)**

The ABI contract between the genome and the rendered prompt is a formal specification: "if the genome has these layers with these visibility settings, and the target role is anchor, then the rendered prompt must include exactly these rules and exclude exactly those rules." That is a theorem about the compiler. It could be stated and proved in Lean 4.

**Coach output correctness (PARTIALLY applicable)**

You could verify that a coach's patch card is structurally well-formed, targets a valid rule, cites an existing belief, and stays within budget. You cannot verify that the patch is strategically good — that is an empirical question answered by match outcomes. But structural correctness is still valuable. It prevents a class of errors where the coach hallucinates a rule ID or proposes a patch to a nonexistent genome layer.

**Strategic quality of coach decisions (NO, not applicable)**

Formal verification cannot tell you whether DOC-004 ("never reuse the same semantic angle within a five-round window") is a good rule. That is what the tournament ecology measures. Lean 4 verifies that code meets its spec. It does not tell you whether the spec is wise.

### 4.3 The Practical Path

The realistic approach is not to rewrite Herpetarium in Lean 4. It is to:

1. Express the genome schema as a Lean 4 type definition
2. Express the ABI contract as Lean 4 propositions
3. Use Leanstral (or a similar agent) to generate proofs that the TypeScript Prompt Compiler correctly implements the ABI
4. Run those proofs in CI — every compiler change must still satisfy the ABI proof

This gives you formal guarantees on the structural layer (genomes are valid, the compiler is ABI-compliant) while leaving the strategic layer to empirical measurement. That is the right division of labor.

### 4.4 Cost Consideration

Leanstral runs at $36 per task versus Claude Sonnet's $549 for equivalent formal verification. For a research platform with a $33 tournament budget, formal verification of the compiler and schema is surprisingly affordable if scoped correctly. The proofs only need to be regenerated when the schema or compiler changes, not per match.

---

## 5. What "Agentic Engineering, Not Vibe Coding" Means for Building Herpetarium

### 5.1 The Distinction

Simon Willison's February 2026 articulation of agentic engineering patterns and the broader community consensus are clear: agentic engineering requires systems thinking and technical depth. It is the discipline of designing control flow, state transitions, and decision boundaries around LLM calls, treating agent construction as a software architecture problem.

Vibe coding is: "ask the model to make a coach, see what happens, iterate by feel."

Agentic engineering is: "the coach loop is a six-stage pipeline where each stage has typed inputs, typed outputs, explicit validation, context isolation, failure handling, and rollback semantics. Here is the state machine. Here is where each LLM call happens. Here is what it sees. Here is what it cannot see. Here is how we detect failure. Here is how we recover."

### 5.2 Concrete Implications for Herpetarium

**The coach loop is a state machine, not a conversation.**

Each of the six coach stages (autopsy, diagnosis, patch proposal, skeptic review, patch commit, compile) is a node in a directed graph. Transitions between stages are gated by validation. If the autopsy produces a failure matrix that does not classify all losses, the pipeline halts. It does not "try again and hope."

**Every LLM call has a typed contract.**

The native head coach's autopsy call takes: (match transcripts: Transcript[], current genome: Genome, sprint context: SprintContext) and returns: (failure matrix: FailureMatrix). Not "a response." A typed artifact. If the model's output does not parse into a valid FailureMatrix, the call fails and enters retry/fallback logic. This is what the existing `server/ai.ts` already partially does with its forgiving parse recovery — V2 makes it strict.

**Context windows are budgeted, not infinite.**

The agentic engineering principle from Google's ADK: "every model call and sub-agent sees the minimum context required." The coach does not get "everything." It gets exactly what its current stage needs, rendered by the context pipeline described in Section 1.

**Failure is a first-class citizen.**

Tournament 1 saw 71% API error rates. Agentic engineering says: model health, fallback routing, taint detection, and contamination accounting are not afterthoughts. They are part of the architecture. The `modelHealth.ts` system already embodies this — V2 promotes it from operational concern to experimental variable.

**The orchestrator never does the work.**

Following the GSD and Orchestrator-Worker patterns: the orchestrator spawns coach stages as subagents, waits for results, validates them, and routes to the next stage. It never fills its own context window with transcript data or genome details. It holds the pipeline state and summary results. The heavy lifting happens in isolated contexts.

### 5.3 What This Means for the Builder

It means you write the state machine before you write any prompts. You define the typed interfaces before you tune the coach instructions. You build the validation layer before you build the creative layer. You instrument before you optimize.

This is not slower than vibe coding. It is faster in aggregate because you do not spend weeks debugging mysterious coach failures that turn out to be context poisoning, schema violations, or undetected fallback contamination.

---

## 6. The March 2026 Energy: Attitudes and Practices for the Builder

### 6.1 The Landscape Right Now

March 2026 is a specific moment. Here is what is true:

- **Context engineering is the discipline.** Not prompt engineering. The community has converged on this. The bottleneck is not "better words." It is "better information architecture around the model."
- **Spec-driven development is the workflow.** GitHub Spec Kit has 72.7k stars. Thoughtworks, GitHub, Google, and Amazon are all publishing patterns. Specs are treated as code artifacts. The spec is the primary source of truth; code, tests, and documentation are derived from it.
- **MCP is the integration standard.** 14,000+ servers. Anthropic, OpenAI, Google, Microsoft, Amazon all support it. v1.27 added streaming for agentic flows. The security story is catching up (auth, audit trails, enterprise identity).
- **Formal verification is entering the mainstream via Lean 4.** Leanstral makes it affordable. The verification gap (96% of developers distrust AI code, 48% verify it) is driving adoption. The pattern of "agent + compiler LSP via MCP" is replicable.
- **GSD-style meta-prompting solves the context rot problem.** Subagent orchestration with fresh context windows, file-based state persistence, automatic crash recovery. This is now a known solution, not an experiment.
- **Agentic engineering is a real discipline.** It has named patterns (Orchestrator-Worker, Hierarchical, Swarm, Pipeline, Mesh), named failure modes (context poisoning, context rot, hallucinated state), and named solutions (context isolation, typed contracts, validation gates).

### 6.2 What the Builder Should Bring

**Systems thinking over prompt tuning.** The Prompt Compiler is a compiler. Design it like one. IR, target codegen, optimization passes, ABI stability. The genome schema is a type system. Design it like one. Invariants, well-formedness rules, version compatibility.

**Spec-first workflow.** Before writing the coach loop, write the spec for the coach loop. Define the typed inputs and outputs of each stage. Define the validation rules. Define the failure modes. Then implement. This is what Spec Kit and the SDD community mean by "the spec is the primary source of truth."

**MCP as the integration layer.** Do not build bespoke APIs for coach-to-genome interaction. Build MCP servers. This gives you model-agnostic tool calling, structured resource access, and compatibility with any future model family that speaks MCP (which, as of March 2026, is all of them).

**Formal verification where it pays off.** The genome schema and the ABI contract are worth proving. Coach strategic quality is not. Know the boundary.

**Context isolation as architecture.** Every coach stage gets a fresh context. The orchestrator stays lean. State lives on disk (genome files, patch ledgers, belief ledgers), not in context windows. This is how you run a 200-sprint season without context rot.

**Instrument before you optimize.** The V2 measurement architecture (opacity scores, AID, semantic drift, patch yield, cultural transmission coefficients) is the scientific instrument. Build it clean. Calibrate it. Then let the ecology run. The findings come from the data, not from the builder's intuition about what models will do.

### 6.3 The Attitude

The March 2026 attitude is: this is real engineering now. The tools exist. The patterns are named. The failure modes are documented. The community has moved past "look what ChatGPT can do" into "here is how you build production multi-agent systems that work reliably."

Herpetarium V2 is not a toy. It is a research instrument. Build it like an instrument: precise, calibrated, reproducible, and designed to surprise you with what it measures rather than with whether it works.

The excited energy is warranted — this is genuinely a moment where the tooling, the theory, and the ambition have converged. The discipline is in channeling that energy through the architecture rather than around it.

---

## Appendix: Key Tools and Repos

| Tool/Repo | What It Is | Relevance to Herpetarium |
|-----------|-----------|-------------------------|
| [GitHub Spec Kit](https://github.com/github/spec-kit) | SDD toolkit, 72.7k stars, cross-agent | Genome-as-spec workflow, validation patterns |
| [GSD / Get Shit Done](https://github.com/gsd-build/get-shit-done) | Meta-prompting + context engineering for Claude Code | Subagent orchestration, context rot prevention |
| [GSD-2](https://github.com/gsd-build/gsd-2) | Autonomous long-running agent orchestration | Season-length coach loop execution |
| [Leanstral](https://docs.mistral.ai/models/leanstral-26-03) | Lean 4 proof agent, Apache 2.0, 120B params | Genome schema verification, ABI proof |
| [arXiv MCP Server](https://github.com/blazickjp/arxiv-mcp-server) | MCP server for arXiv paper search | Research layer (not live play) |
| [Paper Search MCP](https://github.com/openags/paper-search-mcp) | Multi-source academic paper search | Research layer (not live play) |
| [SQLite MCP Server](https://www.pulsemcp.com/servers/modelcontextprotocol-sqlite) | Anthropic's reference SQLite MCP | Data layer if migrating from JSON |
| [Google ADK](https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/) | Multi-agent context engineering framework | Context isolation patterns for coach pipeline |
| [Context Engineering for MAS](https://github.com/Denis2054/Context-Engineering-for-Multi-Agent-Systems) | Production blueprint for multi-agent context engineering | Orchestration patterns |
| [Agentic Design Patterns (arXiv)](https://arxiv.org/abs/2601.19752) | System-theoretic framework for agentic AI | Formal architecture patterns |

---

## Sources

- [MCP Roadmap 2026 — The New Stack](https://thenewstack.io/model-context-protocol-roadmap-2026/)
- [MCP Ecosystem v1.27 — Context Studios](https://www.contextstudios.ai/blog/mcp-ecosystem-in-2026-what-the-v127-release-actually-tells-us)
- [Context Engineering Complete Guide — CodeConductor](https://codeconductor.ai/blog/context-engineering)
- [LLM Context Problem 2026 — LogRocket](https://blog.logrocket.com/llm-context-problem-strategies-2026)
- [Multi-Agent Systems with Context Engineering — Vellum](https://vellum.ai/blog/multi-agent-systems-building-with-context-engineering)
- [Spec-Driven Development — Thoughtworks](https://www.thoughtworks.com/en-us/insights/blog/agile-engineering-practices/spec-driven-development-unpacking-2025-new-engineering-practices)
- [Spec-Driven Development with AI — GitHub Blog](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)
- [Spec-Driven Development — Augment Code](https://www.augmentcode.com/guides/what-is-spec-driven-development)
- [Leanstral — Mistral Docs](https://docs.mistral.ai/models/leanstral-26-03)
- [Leanstral Formal Verification — AI Automation Global](https://aiautomationglobal.com/blog/mistral-leanstral-formal-code-verification-2026)
- [Lean 4 Competitive Edge — VentureBeat](https://venturebeat.com/ai/lean4-how-the-theorem-prover-works-and-why-its-the-new-competitive-edge-in)
- [GSD — GitHub](https://github.com/gsd-build/get-shit-done)
- [GSD-2 — GitHub](https://github.com/gsd-build/gsd-2)
- [Beating Context Rot with GSD — The New Stack](https://thenewstack.io/beating-the-rot-and-getting-stuff-done/)
- [Agentic Engineering Patterns — Simon Willison](https://simonwillison.net/2026/Feb/23/agentic-engineering-patterns/)
- [Agentic Design Patterns 2026 Guide — SitePoint](https://www.sitepoint.com/the-definitive-guide-to-agentic-design-patterns-in-2026/)
- [Agentic Engineering Patterns — InfoQ](https://www.infoq.com/news/2026/03/agentic-engineering-patterns/)
- [Code Agent Orchestra — Addy Osmani](https://addyosmani.com/blog/code-agent-orchestra/)
- [Google ADK Multi-Agent Framework](https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/)
- [arXiv MCP Server — GitHub](https://github.com/blazickjp/arxiv-mcp-server)
- [MCP Server Directory — PulseMCP](https://www.pulsemcp.com/servers)
- [SQLite MCP Server — PulseMCP](https://www.pulsemcp.com/servers/modelcontextprotocol-sqlite)
- [MCP Security Research — arXiv](https://arxiv.org/abs/2503.23278)
