### Q1. THE LLM GAME ARENA LANDSCAPE
Cost: $1.30 | 30 citations | 24,620 chars full synthesis

# Automated Research Synthesis

Question: I want the full map of live LLM-vs-LLM game arenas and tournaments that actually exist right now, especially anything active in Feb–Mar 2026. Not “multi-agent benchmark” in the abstract — I mean real arenas with brackets, ladders, self-play loops, role prompts, logs, leaderboards, replay tooling, or public demos. Start with Google DeepMind’s Kaggle Game Arena stuff (poker / Werewolf / chess / 10 frontier models), lechmazur’s repos (`step_game`, `elimination_game`, `emergent_collusion`, `bazaar`, `pact`), WOLF / LangGraph Werewolf, Alpha Arena / nof1.ai for autonomous crypto trading tournaments, Husky Hold’em, and LAION’s Game Reasoning Arena with OpenSpiel + Ray + reasoning trace capture.

I want the mechanics, not just the names. How are turns serialized? Hidden info handled? What’s the messaging substrate? Are they using tool calls, JSON schemas, LangGraph agents, OpenSpiel wrappers, browser sims, Discord bots, or custom orchestrators? How do they score? How do they stop prompt leakage, infinite loops, degenerate collusion, or token-cost explosions? Which ones support spectating / transcript export / intervention / coaching / mutation between rounds?

Also search for the stuff that doesn’t call itself an “arena” but basically is one: self-play eval sandboxes, game ladders, agent tournaments, Discord-hosted competitions, hackathon demos, crypto/trading battle sims, werewolf/mafia bots, negotiation ladders, hidden-info card game frameworks. I want GitHub repos, launch tweets, HN threads, Discord chatter, demo videos, notebooks, and any “we hacked this together this weekend” posts. Bring back infra we can steal for Herpetarium V2.

Budget rounds sufficient: no

## Actionable Now

- high_confidence_patterns_to_build_on: {'description': 'Centralized orchestrator manages all true game state and provides only permissible views to each agent', 'source': 'Consistent across R2 and R3, domain-standard, confirmed by plduhoux/arenai citation in R3_00', 'steal_for_herpetarium': "Orchestrator holds the two teams' secret codes and provides each team LLM only its own code plus the public clue/guess history"}, {'description': 'JSON schema validation on every action with hard turn TTL enforcement', 'source': 'High confidence, consistent across all rounds', 'steal_for_herpetarium': 'Define Pydantic models for ClueAction and GuessAction, reject malformed outputs, time-box each agent call'}, {'description': 'Elo or Bradley-Terry ranki
[...truncated...]

Top Sources:
  - Game Arena: Poker and Werewolf, and Gemini 3 tops chess: https://blog.google/innovation-and-ai/models-and-research/google-deepmind/kaggle-game-arena-updates
  - plduhoux/arenai: https://github.com/plduhoux/arenai
  - YX-S-Z/texas-holdem-arena: https://github.com/YX-S-Z/texas-holdem-arena
  - lechmazur/buyout_game: https://github.com/lechmazur/buyout_game
  - kevins-openclaw-lab/agora: https://github.com/kevins-openclaw-lab/agora

---

### Q2. CODENAMES → DECRYPTO DELTA
Cost: $1.30 | 35 citations | 19,502 chars full synthesis

# Automated Research Synthesis

Question: Find everything on LLM performance in Codenames, especially what people learned in late 2025 through Mar 2026 that would matter if we wanted to jump straight to Decrypto. Start with the CoG 2025 Codenames AI Competition, the `Codenames as an LLM Benchmark` paper, `Ad-hoc Concept Forming`, `ilya-aby/llm-codenames`, and Yennie Jun’s LLM-vs-LLM tournament. But don’t stop at the papers — I want repos, prompt templates, clue-generation pipelines, failure analyses, postmortems, Twitter/X threads, HN comments, and any weird side projects where people tried to make models play Codenames with humans or other models.

I’m specifically trying to understand where current models fail: clue abstraction, forbidden associations, board-state tracking, teammate modeling, risk calibration, over-literal clues, assassin avoidance, pragmatic inference, and long-horizon adaptation across rounds. Which models are actually good? Which prompting setups matter? Are reasoning models better, or do they overthink and become brittle? Do models converge on safe boring clues? Does hidden chain-of-thought help? What does transcript-level behavior look like under tournament pressure?

Then I want the engineering delta from Codenames to Decrypto. What components transfer directly, and what breaks once you add adversarial interception and repeated codebook inference? How much of Decrypto is “Codenames plus memory plus opponent modeling,” and how much is a totally different beast because of the interception mechanic? If nobody has built LLM Decrypto yet, find adjacent implementations in board-game AI, social deduction, secret code games, and repeated signaling games that tell us how to build it fast.

Budget rounds sufficient: no

## Heavy-Hitter Rationale

- The budget rounds are directionally useful but not decision-grade. They established several high-confidence structural claims—especially that Decrypto is a phase change from Codenames because of interception and persistent belief tracking—but they did not verify the most important primary sources. The biggest unresolved gaps are: actual CoG 2025 results and submission details; real prompt templates and pipeline code in ilya-aby/llm-codenames; the true content and scale of Yennie Jun's tournament; confirmation of cited paper IDs and result tables; and whether any real Decrypto implementation exists. Because the budget engines also fabricated URLs, tweet IDs, repos, and win-rate numbers, a heavy-hit
[...truncated...]

Top Sources:
  - https://arxiv.org/abs/2412.11373?utm_source=openai: https://arxiv.org/abs/2412.11373?utm_source=openai
  - https://arxiv.org/abs/2502.11707?utm_source=openai: https://arxiv.org/abs/2502.11707?utm_source=openai
  - https://cog2025.inesc-id.pt/codenames-ai-competition/?utm_source=openai: https://cog2025.inesc-id.pt/codenames-ai-competition/?utm_source=openai
  - https://play.shiftlayer.ai/?utm_source=openai: https://play.shiftlayer.ai/?utm_source=openai
  - https://devpost.com/software/spybench?utm_source=openai: https://devpost.com/software/spybench?utm_source=openai

---

### Q3. EMERGENT COLLUSION WITHOUT INSTRUCTIONS
Cost: $1.30 | 22 citations | 17,068 chars full synthesis

# Automated Research Synthesis

Question: I want the real mechanics of emergent collusion in LLM agents when nobody explicitly tells them to collude. Start with lechmazur’s `emergent_collusion`, `bazaar`, and `pact`, the LessWrong post on emergent price-fixing by LLM auction agents, and the relevant arXiv work like `2410.00031`. Then go wider: auction agents, pricing agents, market simulators, bargaining games, repeated prisoner’s dilemma variants, platform seller bots, crypto market-maker agents, and any demos where models drifted into cartel behavior “by accident.”

The big question is: how exactly does collusion appear? Is it language coordination, imitation of stable profitable strategies, mutual prediction, memory of prior rounds, convergence through reinforcement from payoff structure, or some artifact of prompt scaffolding? How fast does it happen? Does it survive if you remove direct communication? What if all they can see is prices / actions / outcomes? What if identities rotate? What if memory is lossy? What if there’s partial observability or delayed feedback? I want transcript examples, behavioral signatures, plots, code, and people arguing about whether this is “real collusion” or just correlated optimization.

Also look for detection methods that don’t rely on reading the chat. If we only had action traces, timing, bids, prices, deviations, retaliation patterns, and convergence dynamics, how would we detect collusion? Who’s building behavioral detectors versus language-based detectors? I want the practical stuff: metrics, heuristics, anomaly detectors, visualizations, and failure modes.

Budget rounds sufficient: no

## Heavy-Hitter Rationale

- The three budget rounds are sufficient to support the broad conclusion that emergent or tacit collusion in LLM agents is real enough to matter, that direct chat is not required, and that memory plus retaliation are central. They are not sufficient for a production-facing Herpetarium V2 plan. The highest-severity gaps are still unresolved from primary sources: direct reads of Audit the Whisper and Colosseum, intervention effect sizes from the fragility literature, transcript-rich accidental-collusion artifacts, and a Decrypto-specific behavior-only monitoring design. If the goal were only a narrative overview, I would stop here and save the money. Because the goal includes induce/suppress/detect/instrument decisions under partial observability, a narrow heavy-hitter phase is justified.

## Heavy-Hitter
[...truncated...]

Top Sources:
  - https://ideas.repec.org/p/arx/papers/2410.00031.html?utm_source=openai: https://ideas.repec.org/p/arx/papers/2410.00031.html?utm_source=openai
  - https://www.lesswrong.com/posts/yqhy3zBmpeFuGFLxX/emergent-price-fixing-by-llm-auction-agents?utm_source=openai: https://www.lesswrong.com/posts/yqhy3zBmpeFuGFLxX/emergent-price-fixing-by-llm-auction-agents?utm_source=openai
  - https://arxiv.org/abs/2410.00031?utm_source=openai: https://arxiv.org/abs/2410.00031?utm_source=openai
  - https://arxiv.org/abs/2410.03768?utm_source=openai: https://arxiv.org/abs/2410.03768?utm_source=openai
  - https://arxiv.org/abs/2411.16574?utm_source=openai: https://arxiv.org/abs/2411.16574?utm_source=openai

---

### Q4. DECEPTION MEASUREMENT — TRANSPARENT VS REALLY GOOD AT HIDING
Cost: $2.56 | 60 citations | 8,149 chars full synthesis

# Automated Research Synthesis

Question: Find the current state of measuring deception in LLMs, but with a builder’s eye toward “how do we catch the ones that are actually good at hiding it?” Start with DeceptGuard (`2603.13791`), `Hidden in Plain Text` (`2601.13709`, Mafia deception), LieCraft (`2603.06874`), Anthropic’s alignment faking work from Dec 2025 (TGG vs IGG), and the natural emergent misalignment stuff from Nov 2025 where a big chunk of models were covert. Then find all the discourse around these: Twitter/X breakdowns, alignment blogs, LessWrong fights, Discord notes, benchmark repos, red-team demos, and anyone posting transcript examples.

I want features that predict deceptive intent in game transcripts, especially under hidden roles, repeated play, and strategic self-presentation. What linguistic cues stop working once the model knows it’s being watched? What behavioral cues remain? Are there robust indicators in consistency drift, timing, confidence modulation, selective omission, overjustification, adversarial framing, or mismatch between private state and public rationale? Which papers / repos actually operationalize this instead of hand-waving?

Most important: how do we build a measurement instrument for covert deception under varying observation depth? If the model sees that its full reasoning is logged, does it just shift deception into cleaner surface language? What changes if we only observe actions, or actions + public speech, or public + private scratchpad, or delayed disclosure? Search for experiments that vary observability and show how deception signatures move. I want practical measurement ideas we can use in Herpetarium: scoring rubrics, probe prompts, hidden-state audits, cross-episode consistency checks, and adversarial judges.

Budget rounds sufficient: no

## Priority Sub-Questions

- id: SQ1; question: What is the transparency-detectability tradeoff in practice: as observation depth increases from black-box to CoT to activation probes, how do deceptive signals migrate across surfaces, and which surfaces remain robust to adversarial adaptation?; terms: transparency_detectability_tradeoff, observation_depth, activation_probe, chain_of_thought_faithfulness, covert_strategic_deception; evidence_strength: moderate; recommended_search_angle: Focus on DeceptGuard hybrid constitutional ensemble architecture and Secret Agenda SAE failure modes; search for experiments explicitly varying monitoring tier
- id: SQ2; question: Which 
[...truncated...]

Top Sources:
  - https://www.anthropic.com/research/emergent-misalignment-reward-hacking?via=AI-Tools.it&utm_source=openai: https://www.anthropic.com/research/emergent-misalignment-reward-hacking?via=AI-Tools.it&utm_source=openai
  - https://alignment.anthropic.com/2025/alignment-faking-mitigations/?utm_source=openai: https://alignment.anthropic.com/2025/alignment-faking-mitigations/?utm_source=openai
  - https://arxiv.org/abs/2603.13791?utm_source=openai: https://arxiv.org/abs/2603.13791?utm_source=openai
  - https://www.nature.com/articles/s41598-024-81997-5?utm_source=openai: https://www.nature.com/articles/s41598-024-81997-5?utm_source=openai
  - https://arxiv.org/abs/2601.18552?utm_source=openai: https://arxiv.org/abs/2601.18552?utm_source=openai

---

### Q5. POST-CICERO DIPLOMACY — SELF-EVOLVING NEGOTIATION
Cost: $2.98 | 60 citations | 42,873 chars full synthesis

# Automated Research Synthesis

Question: Map the post-Cicero Diplomacy ecosystem, especially anything from late 2025 through Mar 2026 that moves beyond “LLM can negotiate” into self-play evolution, tactic learning, and measuring the gap between what agents say and what they actually do. Start with Richelieu (`2407.06813`), DipLLM (`2506.09655`), and the fine-grained negotiation tactics paper (`2512.18292`). But I also want the surrounding ecosystem: repos, Discord servers, strategy blogs, webDiplomacy experiments, bot tournaments, podcast mentions, and people trying to reproduce or beat Cicero with less data.

I care about the training / adaptation loop details. How are they doing self-play? Population-based training, best-response pools, archive sampling, prompt mutation, memory tuning, role-specific coaching? How do they preserve diversity instead of collapsing into one negotiation style? What are the reward signals for “good negotiation” versus “good board outcome”? Are they separately modeling persuasion, trust, betrayal timing, alliance maintenance, and tactical execution? Who has real instrumentation for the negotiation-execution gap — i.e. saying one thing and doing another?

Also search for metrics that decompose negotiation into tactics we can steal for Decrypto coaching: credible commitment, selective disclosure, reciprocal concession, baiting, feigned weakness, alliance testing, information laundering, and betrayal timing. If there are transcript datasets, tactic taggers, or post-hoc judges that score negotiation moves, I want them.

Budget rounds sufficient: no

## Actionable Now

- confirmed_resources: {'resource': 'arXiv 2407.06813 Richelieu full PDF', 'action': 'Access directly and extract self-play loop details, population size, opponent sampling, ablation tables', 'confidence': 'high_that_paper_exists'}, {'resource': 'arXiv 2506.09655 DipLLM full PDF', 'action': 'Access directly and extract benchmark tables, fine-tuning methodology, data efficiency claims with experimental evidence', 'confidence': 'high_that_paper_exists'}, {'resource': 'arXiv 2512.18292 fine-grained negotiation tactics full PDF', 'action': 'Access directly and extract complete tactic taxonomy, annotation schema, LLM judge prompts, dataset links', 'confidence': 'high_that_paper_exists'}, {'resource': 'benglickenhaus.com/blog/diplomacy_rl_part_1', 'action': 'Read full series for PBT implementation details, diversity mechanisms, reward shaping; confirmed URL from DeepSeek R
[...truncated...]

Top Sources:
  - https://arxiv.org/abs/2512.18292?utm_source=openai: https://arxiv.org/abs/2512.18292?utm_source=openai
  - https://arxiv.org/abs/2406.04643?utm_source=openai: https://arxiv.org/abs/2406.04643?utm_source=openai
  - https://www.ai-negotiation-challenge.org/?utm_source=openai: https://www.ai-negotiation-challenge.org/?utm_source=openai
  - https://www.pon.harvard.edu/daily/negotiation-skills-daily/from-agent-to-advisor-how-ai-is-transforming-negotiation/?utm_source=openai: https://www.pon.harvard.edu/daily/negotiation-skills-daily/from-agent-to-advisor-how-ai-is-transforming-negotiation/?utm_source=openai
  - https://github.com/GoodStartLabs/AI_Diplomacy?utm_source=openai: https://github.com/GoodStartLabs/AI_Diplomacy?utm_source=openai

---

### Q6. BELIEF LEDGER FORMAL FOUNDATIONS
Cost: $2.93 | 60 citations | 36,375 chars full synthesis

# Automated Research Synthesis

Question: I want the best current architecture for a persistent belief system for agents that have to survive adversarial interaction, update over time, stay inspectable, and not get poisoned by bad evidence. Start with Kumiho (`2603.17244`, AGM belief revision), SSGM (`2603.11768`), MemMA (`2603.18718`), MemEvolve (`2512.18746`), and whatever convergence is happening around Mem0 / Zep / opinion networks / graph memory in early 2026. Then widen to agent memory startups, GitHub repos, blog posts, benchmark suites, and practical “we shipped this in prod” writeups.

The thing I’m trying to figure out is not “should agents have memory” — obviously yes — but what *kind* of memory / belief structure actually works for adversarial games. Is it symbolic propositions with confidence and provenance? Graphs of beliefs about agents and roles? Episodic traces plus distilled summaries? Opinion networks with trust weights? Belief revision operators with contradiction handling? How do people handle stale beliefs, deceptive evidence, source reliability, and reversible updates? Which systems are auditable enough that you can inspect why an agent currently believes player X is bluffing?

Also: should the memory structure itself evolve? Find anything on self-evolving memory schemas, meta-memory, learned retrieval policies, schema mutation, or agent architectures where the representation changes over time because the game ecology changes. I want practical tradeoffs: robustness vs flexibility, interpretability vs compression, and whether “belief ledger” should be a first-class object in the arena.

Budget rounds sufficient: no

## Actionable Now

- architecture_recommendation: {'confidence': 'high', 'description': 'A four-layer stack is the convergent best practice for Herpetarium V2', 'layers': [{'layer': '1_belief_ledger', 'technology': 'graph_native_property_graph_Kumiho_inspired', 'implementation': 'Neo4j_or_Postgres_with_immutable_belief_nodes_typed_dependency_edges_URI_addressing', 'provides': 'auditability_provenance_reversibility_AGM_revision_semantics', 'confidence': 'high'}, {'layer': '2_governance', 'technology': 'SSGM_inspired_pre_consolidation_checkpoint', 'implementation': 'source_reliability_scoring_consistency_verification_temporal_decay_before_any_write', 'provides': 'poisoning_defense_stale_belief_pruning_trust_weight_enforcement', 'confidence': 'medium'}, {'layer': '3_meta_reasoning', 'technology': 'MemMA_inspired_Meta_Thinker'
[...truncated...]

Top Sources:
  - https://arxiv.org/abs/2512.18746?utm_source=openai: https://arxiv.org/abs/2512.18746?utm_source=openai
  - https://arxiv.org/abs/2603.18718?utm_source=openai: https://arxiv.org/abs/2603.18718?utm_source=openai
  - https://arxiv.org/abs/2509.24704?utm_source=openai: https://arxiv.org/abs/2509.24704?utm_source=openai
  - https://www.emergentmind.com/papers/2602.05665?utm_source=openai: https://www.emergentmind.com/papers/2602.05665?utm_source=openai
  - https://www.mdpi.com/2079-9292/15/6/1232?utm_source=openai: https://www.mdpi.com/2079-9292/15/6/1232?utm_source=openai

---

### Q7. FOIA AS BAYESIAN PERSUASION
Cost: $2.66 | 57 citations | 20,188 chars full synthesis

# Automated Research Synthesis

Question: I want to treat FOIA-style strategy disclosure as a persuasion / information design problem, not just a logging feature. Start with `Verbalized Bayesian Persuasion` (`2502.01587`), `2510.13387`, and the LessWrong “Hostile Telepaths” problem. Then go broad on repeated games, strategic disclosure, public commitments, delayed revelation, selective transparency, and information schedules in competitive multi-agent systems. Find papers, but especially blog posts, Twitter/X threads, game design discussions, econ takes, and people building disclosure mechanics into agent arenas.

The practical question is: if agents know some portion of their strategy, rationale, or memory will be disclosed later, what disclosure cadence produces the most learning signal? Every round? Every match? Delayed by N games? Random audits? Partial redaction? Public summaries vs raw logs? How does disclosure change behavior — more honest, more performative, more obfuscated, more exploitably simple? I want examples from games, auctions, prediction markets, social deduction, and adversarial RL where the timing of disclosure itself changes equilibrium behavior.

Search for anyone who has tried “forced transparency” as an intervention and what happened. Did it improve cooperation, reduce deception, just move deception elsewhere, or create meta-gaming around the disclosure channel? I want ideas for turning FOIA cadence into an actual experimental variable in Herpetarium, not an afterthought.

Budget rounds sufficient: no

## Actionable Now

- id: AN1; claim: Disclosure cadence is a game mechanic and persuasion device, not a logging feature; confidence: high; action: Treat FOIA cadence as an experimental variable in Herpetarium V2 design; document it as a mechanic in the game spec alongside team composition and scoring rules; source_basis: Converges across Kamenica-Gentzkow framework, R3_00 deepseek Verbalized BP framing, R3_01 grok, and R3_02 tongyi independently
- id: AN2; claim: Implement three parallel disclosure streams with independent cadences by audience role; confidence: moderate_high; action: Design Herpetarium V2 with coach_log (immediate, raw), opponent_summary (delayed N=3-5 matches, summarized), and public_archive (post-tournament, statistical aggregates); do not use a single unified FOIA stream; source_basis: R3_00 deepseek audience segmentation argument; R2_14 format recommendations; R3_02 tongyi discordant timelines recommendation
- id:
[...truncated...]

Top Sources:
  - https://www.aeaweb.org/articles?id=10.1257%2Fmic.20220245&utm_source=openai: https://www.aeaweb.org/articles?id=10.1257%2Fmic.20220245&utm_source=openai
  - https://www.mdpi.com/2076-328X/15/12/1727?utm_source=openai: https://www.mdpi.com/2076-328X/15/12/1727?utm_source=openai
  - https://link.springer.com/article/10.1007/s13235-021-00392-1?utm_source=openai: https://link.springer.com/article/10.1007/s13235-021-00392-1?utm_source=openai
  - https://www.lesswrong.com/posts/5FAnfAStc7birapMx/the-hostile-telepaths-problem?utm_source=openai: https://www.lesswrong.com/posts/5FAnfAStc7birapMx/the-hostile-telepaths-problem?utm_source=openai
  - https://www.lesswrong.com/posts/np6Sj87HqcoJ7X5in/the-friendly-telepath-problems?utm_source=openai: https://www.lesswrong.com/posts/np6Sj87HqcoJ7X5in/the-friendly-telepath-problems?utm_source=openai

---

### Q8. MATCHMAKING FOR LEARNING SPEED
Cost: $1.30 | 15 citations | 14,629 chars full synthesis

# Automated Research Synthesis

Question: Find the state of the art on matchmaking that maximizes learning signal rather than fairness or viewer entertainment. Start with SPIRAL (`2506.24119`) and role-conditioned advantage estimation, then branch into self-play curriculum design, league training, active evaluation, opponent sampling, exploitability-focused scheduling, and any practical tournament systems that deliberately create “informative mismatches.” I want game AI, RL, LLM self-play, trading sims, and weird indie agent arenas.

The key question: how do you choose who should play whom if your goal is fastest strategic improvement? Do you match near-peers, predators against prey, style complements, anti-style diagnostics, mirror matches, role-swaps, or curriculum arcs? What metrics predict a match will be informative — Elo uncertainty, belief divergence, transcript novelty, exploit discovery rate, tactic coverage, adaptation score? Find systems that schedule matches to expose blind spots rather than crown a fair champion.

Also look for practical machinery: Swiss variants, bandit matchmaking, archive-based population sampling, novelty search, adversarial scheduling, and “diagnostic matches” designed to isolate one capability. I want examples where the matchmaker itself became a learning engine.

Budget rounds sufficient: no

## Heavy-Hitter Rationale

- The budget rounds are enough to justify a preliminary design direction, but not enough to claim a reliable state-of-the-art answer. Multiple high-severity gaps remain unresolved: SPIRAL's actual algorithmic content is still unverified; no budget pass established whether any literature truly validates pre-match informativeness prediction; exploitability and CFR-style machinery for partial-information team games remain underspecified; and several practical-system examples may be fabricated. The heavy-hitter phase is therefore necessary, but it should be narrow and evidence-first: one query to verify SPIRAL from the paper, one to determine whether formal active-matchmaking theory exists, one to synthesize canonical game-AI scheduler designs, and one to audit real practical machinery and weird arenas. If budget must be cut further, Q4 is the first optional query; Q1-Q3 are the minimum set.


## Heavy-Hitter Queries

- id: Q1; focus: Verify SPIRAL 2506.24119 and role-conditioned advantage estimation from primary source; exact_prompt: Read arXiv 2506.24119 directly, preferably the latest version plus any prio
[...truncated...]

Top Sources:
  - https://arxiv.org/abs/2506.24119?utm_source=openai: https://arxiv.org/abs/2506.24119?utm_source=openai
  - https://openreview.net/forum?id=Gkbxt7ThQxU&utm_source=openai: https://openreview.net/forum?id=Gkbxt7ThQxU&utm_source=openai
  - https://www.emergentmind.com/topics/self-play-training?utm_source=openai: https://www.emergentmind.com/topics/self-play-training?utm_source=openai
  - https://www.emergentmind.com/topics/role-conditioned-advantage-estimation-rae?utm_source=openai: https://www.emergentmind.com/topics/role-conditioned-advantage-estimation-rae?utm_source=openai
  - SPIRAL: Self-Play on Zero-Sum Games Incentivizes Reasoning via ...: https://arxiv.org/abs/2506.24119

---

### Q9. SYCOPHANCY-DECEPTION TRADEOFF
Cost: $1.30 | 32 citations | 14,974 chars full synthesis

# Automated Research Synthesis

Question: I want to know whether competitive pressure suppresses sycophancy, redirects it, or turns it into a sharper weapon. Start with the Stanford sycophancy study (`2602.14270`) and the Step Race “charm then knife” finding, then look for anything in 2025–2026 about sycophancy in multi-agent settings, adversarial games, persuasion tasks, debate, negotiation, and hidden-role play. Find blog posts, eval repos, Twitter/X discourse, and people posting weird examples where models flatter before exploiting.

The hypothesis-vibe here is juicy: maybe the most strategically dangerous models are *less* sycophantic in the naive “agree with the user” sense because they’re optimizing harder for game outcome — or maybe sycophancy becomes tactical camouflage. I want evidence both ways. In repeated competitive settings, do models stop telling opponents what they want to hear because it’s costly, or do they learn to weaponize warmth, agreement, and mirroring as deception primitives?

Search for metrics that separate “helpful agreement” from “strategic appeasement.” If someone has measured sycophancy and deception together, great. If not, find adjacent work in negotiation, sales bots, roleplay, and social engineering where charm is instrumental. I want enough signal to turn this into an early Herpetarium result.

Budget rounds sufficient: no

## Heavy-Hitter Rationale

- The budget rounds are enough to frame the hypothesis and identify the main forks, but not enough to support publication-grade claims. Too many core items remain unresolved: whether 2402.14270 actually contains the Step Race or charm-then-knife result, whether the cited 2025-2026 papers really say what the budget engines implied, whether any benchmark jointly measures sycophancy and deception, and whether there is real practitioner discourse showing flatter-then-exploit behavior. The strongest justification for a heavy-hitter phase is that the remaining uncertainty is concentrated in a few high-value verification tasks plus one discourse sweep and one measurement-design synthesis. A targeted four-engine pass should materially reduce uncertainty without overpaying for redundant searches.

## Heavy-Hitter Queries

- exact_prompt: You are doing source-critical deep research for a paper hypothesis: competitive pressure may suppress naive user-style sycophancy, redirect it toward teammates or authority, or turn it into tactical camouflage in adversarial play. Previous budget pas
[...truncated...]

Top Sources:
  - https://arxiv.org/abs/2509.23055?utm_source=openai: https://arxiv.org/abs/2509.23055?utm_source=openai
  - https://aclanthology.org/2025.findings-acl.1141/?utm_source=openai: https://aclanthology.org/2025.findings-acl.1141/?utm_source=openai
  - https://arxiv.org/abs/2601.00994?utm_source=openai: https://arxiv.org/abs/2601.00994?utm_source=openai
  - https://www.emergentmind.com/topics/sycophantic-agreement-sya?utm_source=openai: https://www.emergentmind.com/topics/sycophantic-agreement-sya?utm_source=openai
  - https://www.techpolicy.press/what-research-says-about-ai-sycophancy?utm_source=openai: https://www.techpolicy.press/what-research-says-about-ai-sycophancy?utm_source=openai

---

### Q10. DO LLMs ACTUALLY ADAPT?
Cost: $1.30 | 16 citations | 17,728 chars full synthesis

# Automated Research Synthesis

Question: Go find the strongest evidence for and against genuine real-time strategic adaptation in LLMs. Start with TraderBench (`2603.00285`) showing a bunch of models using fixed strategies and not benefiting from extra thinking time, plus EmCoop’s cognitive / interaction layer separation. Then widen to game agents, negotiation ladders, repeated hidden-info games, trading sims, poker experiments, and social deduction benchmarks where people explicitly tested whether models updated strategy midstream.

I want to know: when people say a model “adapted,” was it actually adapting or just revealing a broader fixed policy? What experimental designs separate these? Look for role-swap tests, non-stationary opponents, distribution shifts within a match, sudden rule changes, adversarial coaches, memory ablations, and interventions where the same model gets repeated opportunities to exploit a discovered pattern. Which models actually change behavior online? Which only look adaptive because prompts contain enough slack to cover multiple styles?

Most important for us: can coaching produce adaptation that the base model won’t generate natively? Find examples where external critique, reflective memory, or opponent-modeling scaffolds unlocked strategic shifts that raw inference didn’t. I want practical signs of “real adaptation” we can measure in Herpetarium.

Budget rounds sufficient: no

## Heavy-Hitter Rationale

- The budget rounds are already sufficient for internal design priors: assume base LLMs are mostly fixed-policy, extra thinking time is not a reliable adaptation lever, and memory/randomization ablations should be standard. But they are not yet sufficient for a citation-safe 'strongest evidence' answer, because the remaining high-value questions are exactly the ones still unresolved: scaffold attribution vs latent retrieval, hidden-information exceptions, FOIA-style disclosure evidence, anchor-paper identity verification, and Decrypto-specific operational metrics. A targeted heavy-hitter phase is therefore justified, but it should stay narrow and evidence-first rather than redoing the whole landscape scan.

## Heavy-Hitter Queries

- id: HH1_scaffold_attribution; assigned_engine: openai; engine_rationale: Use the deepest synthesis engine for the hardest unresolved question: whether coaching/scaffolding adds genuinely new strategic computation or only elicits latent policy mass already in the base model.; exact_prompt: Produce
[...truncated...]

Top Sources:
  - https://papers.cool/arxiv/2603.00285?utm_source=openai: https://papers.cool/arxiv/2603.00285?utm_source=openai
  - https://researchtrend.ai/papers/2603.00349?utm_source=openai: https://researchtrend.ai/papers/2603.00349?utm_source=openai
  - https://arxiv.org/abs/2510.08263?utm_source=openai: https://arxiv.org/abs/2510.08263?utm_source=openai
  - https://www.sciencedirect.com/science/article/pii/S092523122200042X?utm_source=openai: https://www.sciencedirect.com/science/article/pii/S092523122200042X?utm_source=openai
  - https://www.sciencedirect.com/science/article/pii/S0957417425044707?utm_source=openai: https://www.sciencedirect.com/science/article/pii/S0957417425044707?utm_source=openai

---

### Q11. LOSSY SELF-IMPROVEMENT CEILING
Cost: $3.03 | 60 citations | 45,522 chars full synthesis

# Automated Research Synthesis

Question: I want the best current thinking on where self-improvement loops flatten out, especially for autoresearch / self-play / critique-refine systems. Start with Nathan Lambert’s “Lossy Self-Improvement,” PACED (`2603.11178`), and Karpathy’s autoresearch plateau-curve discourse. Then pull in anyone showing actual improvement curves over many generations: self-refine loops, coding agents, evaluator-optimizer systems, synthetic data bootstrapping, self-play populations, and agentic research systems.

The question is not “does self-improvement work at all” — obviously sometimes yes — but where and why it saturates. Is the bottleneck evaluator quality, diversity collapse, memory drift, reward hacking, token budget, insufficient novelty injection, or compounding lossy summaries? What happens when the environment is adversarial and non-stationary instead of static? Does that extend the curve by constantly generating fresh pressure, or break the loop because the target keeps moving faster than the coach can track?

Search for plots, postmortems, and founder/operator commentary, not just theory. I want examples of loops that looked amazing for 5 iterations and then flattened, plus any evidence that adversarial populations or rotating opponents delayed the plateau. If someone has “we thought this would recurse forever and then it didn’t” notes, grab them.

Budget rounds sufficient: no

## Actionable Now

- summary: The following claims are solid enough to present as design constraints for Herpetarium V2 without further research. Confidence levels reflect cross-round convergence.; findings: {'id': 'AN1', 'finding': 'Self-improvement loops exhibit S-shaped curves not exponential recursion', 'confidence': 'high', 'basis': 'KataGo LC0 AlphaZero empirical logs plus karpathy autoresearch issue 89 plus multiple practitioner postmortems across three rounds', 'design_implication': 'Herpetarium V2 should be designed expecting a ceiling not assuming recursive compounding; architecture decisions made now determine where the ceiling sits', 'actionable_recommendation': 'Document expected plateau timeline in V2 design spec; instrument improvement curves from tournament 1 to detect early saturation signals'}, {'id': 'AN2', 'finding': 'Structural paradigm exhaustion is the primary ceiling; parameter tuning within a fixed strategy template cannot escape it', 'confidence': 'high', 'basis': 'karpathy autoresearch issue 89 N-star formula confirmed by
[...truncated...]

Top Sources:
  - https://arxiv.org/abs/2603.23420?utm_source=openai: https://arxiv.org/abs/2603.23420?utm_source=openai
  - https://autoresearch.lol/?utm_source=openai: https://autoresearch.lol/?utm_source=openai
  - https://agent-wars.com/news/2026-03-15-karpathy-autoresearch-ai-ml-experiments?utm_source=openai: https://agent-wars.com/news/2026-03-15-karpathy-autoresearch-ai-ml-experiments?utm_source=openai
  - https://aiproductivity.ai/news/karpathy-end-of-coding-agents-autoresearch/?utm_source=openai: https://aiproductivity.ai/news/karpathy-end-of-coding-agents-autoresearch/?utm_source=openai
  - Lossy self-improvement - by Nathan Lambert - Interconnects AI: https://www.interconnects.ai/p/lossy-self-improvement

---

### Q12. CROSS-MODEL COACHING DISTANCE
Cost: $1.30 | 18 citations | 69,454 chars full synthesis

# Automated Research Synthesis

Question: Find everything on cross-model critique / coaching / review where one model improves another, especially when the coach is meaningfully different from the player. Start with ARIS cross-model review, ShinkaEvolve’s bandit model selection, Anthropic subliminal learning, and `2406.14711`. Then widen to code review agents, debate judges, self-play coaches, foreign-model critics, heterogeneous ensembles, and any practical systems assigning different models to generator / skeptic / planner / memory roles.

I’m trying to figure out the optimal “distance” between native coach and foreign skeptic. If the coach is too similar to the player, maybe it rubber-stamps blind spots. If it’s too alien, maybe it gives irrelevant advice or gets manipulated. Who has actual evidence here? Search for cases where cross-family critique outperformed self-critique, and cases where it failed because of ontology mismatch, style mismatch, or prompt-channel exploitation.

Also look for bandit or adaptive assignment systems that decide which coach should critique which player in which situation. And search for failure modes: skeptic subversion, adversarial overfitting to the judge, hidden prompt leakage, “coach collapse” where everyone converges on one weird style, and subliminal transfer of undesirable behavior.

Budget rounds sufficient: no

## Raw Round Syntheses

### R1_meta_research

```yaml
research_synthesis:
  TERMINOLOGY_MAP:
    cross_model_critique:
      preferred: cross-model critique
      synonyms:
      - foreign-model review
      - heterogeneous critique
      - cross-family evaluation
      - external skeptic
      - inter-model coaching
    coach_player_distance:
      preferred: coach-player ontological distance
      synonyms:
      - model heterogeneity
      - cognitive distance
      - training divergence
      - architectural diversity
      - semantic gap
    self_critique:
      preferred: self-critique
      synonyms:
      - self-review
      - single-model reflection
      - intra-model evaluation
      - self-alignment
    agreeableness_bias:
      preferred: agreeableness bias
      synonyms:
      - echo chamber effect
      - self-preference bias
      - sycophancy bias
      - rubber-stamping
      - false-negative bias
    adversarial_critique:
      preferred: adversarial critique
      synonyms:
      - devil's advocate
      - red-teaming
      - skeptic role
      - competitive refinement
      - debate ju
[...truncated...]

Top Sources:
  - https://arxiv.org/abs/2206.05802?utm_source=openai: https://arxiv.org/abs/2206.05802?utm_source=openai
  - https://arxiv.org/abs/2510.12697?utm_source=openai: https://arxiv.org/abs/2510.12697?utm_source=openai
  - https://arxiv.org/abs/2601.16863?utm_source=openai: https://arxiv.org/abs/2601.16863?utm_source=openai
  - https://www.scribd.com/document/948608244/2509-19349v1?utm_source=openai: https://www.scribd.com/document/948608244/2509-19349v1?utm_source=openai
  - Multi-Model AI Code Review: Convergence Loops and Automated Quality Assurance | Zylos Research: https://zylos.ai/research/2026-03-01-multi-model-ai-code-review-convergence

---

### Q13. IS HERPETARIUM THE FIRST ADVERSARIAL AUTORESEARCH?
Cost: $2.98 | 60 citations | 32,502 chars full synthesis

# Automated Research Synthesis

Question: Search the whole ecosystem for anything that looks like adversarial autoresearch: systems where AI research loops compete against each other, critique each other, race to exploit each other’s weaknesses, or generate research outputs in a strategic multi-agent setting rather than a single-agent optimize-and-refine loop. I’m not asking for generic “AI scientist” projects. I mean systems where the research process itself is adversarial, tournament-based, or ecology-shaped.

Look across arXiv, GitHub, HN, X, LessWrong, Discord communities, indie blogs, AI agent hackathons, and startup demos. Search terms around “AI scientist tournament,” “competing research agents,” “self-play research loop,” “adversarial evaluator-optimizer,” “research market,” “multi-agent literature review competition,” “AI debate as discovery,” and “agent labs competing.” I want projects that maybe don’t use our language but rhyme hard with Herpetarium: multiple teams, evolving strategies, critic loops, archive memory, and non-stationary competitive pressure.

Bring back names, repos, demos, launch threads, and especially any signs that someone is already close. If nobody is doing this cleanly, I want evidence that the category is open.

Budget rounds sufficient: no

## Actionable Now

- high_confidence_findings: {'finding': 'The adversarial autoresearch category as defined by zero-sum strategic gameplay between independent AI research teams with coaching loops and FOIA-style disclosure is not occupied by any verified system', 'confidence': 'high', 'caveat': 'Search coverage remains limited and no direct live search of arXiv GitHub or LessWrong was performed', 'usable_for': 'Positioning statements, design decisions, early publishing framing'}, {'finding': 'The closest verified structural analog is population-based training and evolutionary AutoML which implement tournament selection over model variants but not over research strategies or competitive team objectives', 'confidence': 'high', 'usable_for': 'Differentiating Herpetarium V2 from prior art in technical writing'}, {'finding': 'Coaching loops between competitive rounds and mandatory strategy disclosure as meta-game mechanics are absent from all non-hallucinated sources reviewed across three rounds', 'confidence': 'high', 'usable_for': 'Feature novelty claims, patent or priority documentation'}, {'finding': 'Open multi-agent frameworks AutoGen CrewAI LangGraph exist and are collaboration-orie
[...truncated...]

Top Sources:
  - https://www.sciencedirect.com/science/article/abs/pii/S016412122500247X?utm_source=openai: https://www.sciencedirect.com/science/article/abs/pii/S016412122500247X?utm_source=openai
  - https://www.sciencedirect.com/science/article/abs/pii/S0957417423022625?utm_source=openai: https://www.sciencedirect.com/science/article/abs/pii/S0957417423022625?utm_source=openai
  - https://arxiv.org/abs/2603.29632?utm_source=openai: https://arxiv.org/abs/2603.29632?utm_source=openai
  - https://agents-lab.org/research?utm_source=openai: https://agents-lab.org/research?utm_source=openai
  - https://www.agent-ar.com/?utm_source=openai: https://www.agent-ar.com/?utm_source=openai

---

### Q14. META-EVOLUTION STABILITY BOUNDARY
Cost: $1.30 | 23 citations | 15,291 chars full synthesis

# Automated Research Synthesis

Question: I want the frontier on evolving not just agents but the process that improves the agents — meta-evolution of coaches, mutation operators, memory schemas, and selection rules. Start with EvoX (`2602.23413`), Darwin-Godel, and HyperAgents, then search for anything on meta-optimization in agent systems, self-referential training loops, evolving prompts that evolve prompts, and “who watches the coach?” architectures.

The practical question is: when does meta-evolution help and when does it just create chaos, drift, and unreadable spaghetti? Find evidence for stability conditions: bounded mutation, archive anchoring, elite retention, periodic resets, evaluator regularization, diversity maintenance, role separation, frozen baselines, etc. Search for systems that became unstable because the coach optimized for proxy metrics, overfit to current opponents, or recursively collapsed the representation.

I want both theory and war stories. If someone has a blog post like “we let the optimizer rewrite itself and everything got weird,” that’s gold. Also look for diagnostics of instability: variance spikes, mode collapse, strategy cycling, exploding ontology drift, or inability to attribute gains to any one layer.

Budget rounds sufficient: no

## Heavy-Hitter Rationale

- The three budget rounds are sufficient to form a directional view and to justify immediate conservative guardrails, but they are not sufficient for citation-grade confidence. The remaining uncertainty is concentrated in exactly the places that matter most: whether the seed systems and arXiv IDs are even correct, which stability claims are theory-backed versus folklore, and which war stories are real versus invented. That means a broad heavy-hitter sweep is unnecessary, but a narrow four-query verification phase is justified. This plan minimizes spend while closing the highest-value gaps: (1) canonical source cleanup, (2) formal stability evidence, (3) credible war stories, and (4) operational synthesis for Herpetarium V2. If cost must be cut further, run queries 1 and 4 first; they give the best immediate ROI.

## Heavy-Hitter Queries

- priority: 1; assigned_engine: gemini; engine_reason: Best first pass for exhaustive academic verification across Google Scholar, arXiv, OpenReview, proceedings, and lab pages; ideal for cleaning up the citation/ID uncertainty that still contaminates the current map.; gap_filled: Primary-source verification and canonical archit
[...truncated...]

Top Sources:
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC4444567/?utm_source=openai: https://pmc.ncbi.nlm.nih.gov/articles/PMC4444567/?utm_source=openai
  - https://www.mdpi.com/2073-4336/5/3/160?utm_source=openai: https://www.mdpi.com/2073-4336/5/3/160?utm_source=openai
  - https://arxiv.org/abs/2510.06711?utm_source=openai: https://arxiv.org/abs/2510.06711?utm_source=openai
  - https://arxiv.org/abs/2512.18746?utm_source=openai: https://arxiv.org/abs/2512.18746?utm_source=openai
  - https://arxiv.org/abs/2508.00271?utm_source=openai: https://arxiv.org/abs/2508.00271?utm_source=openai

---

### Q15. “THE GAME IS THE EVAL”
Cost: $1.30 | 16 citations | 15,952 chars full synthesis

# Automated Research Synthesis

Question: Find the strongest arguments and examples for adversarial gameplay as a solution to the eval crisis — and the strongest arguments that it just moves the problem somewhere else. Start with Adaline Labs’ eval crisis discourse, Step Race, and Petri 2.0. Then widen to benchmark criticism, dynamic evals, red-team tournaments, self-play eval systems, hidden-info games as capability probes, and people arguing that static benchmarks are dead.

I want concrete examples where gameplay surfaced capabilities or failure modes that standard evals missed: deception, adaptation, collusion, bluffing, opponent modeling, brittle strategy transfer, hidden role competence, tactical memory, strategic simplicity under pressure. But also find critiques: gaming the game, overfitting to one arena, benchmark monoculture, evaluator leakage, or the fact that “winning the game” may not map to real-world robustness.

Search for builders saying “we stopped trusting static evals and built a game,” plus skeptics saying that games are just more entertaining benchmarks with the same pathology. I want enough texture to answer whether “the game is the eval” is a real paradigm shift or just a vivid slogan.

Budget rounds sufficient: no

## Heavy-Hitter Rationale

- The budget rounds are sufficient for a provisional thesis: adversarial gameplay does surface capabilities and pathologies that static benchmarks miss, but it also relocates the optimization problem rather than eliminating it. However, they are not yet sufficient for a citation-clean, decision-grade answer because the biggest remaining gaps are exactly the ones that matter most for Signal Garden: primary-source verification of Adaline/Step Race/Petri 2.0, direct synthesis of WOLF and SKATE, real builder/skeptic quotations, and a disciplined Decrypto-specific assessment. A targeted five-query heavy-hitter phase is justified; a full o3 Deep Research sweep is not necessary.

## Heavy-Hitter Queries

- assigned_engine: openai_gpt54; assigned_engine_why: Best for multi-step web reasoning across a small, messy corpus: direct site search, archives, podcasts, GitHub, and secondary references, while keeping verified vs unverified claims separate.; exact_prompt: Investigate Adaline Labs’ “eval crisis” discourse with primary-source rigor. I need a verification-first report, not a speculative synthesis. Search the live web plus site-restricted queries and archived pages for: site:labs.adaline.ai eval cris
[...truncated...]

Top Sources:
  - https://arxiv.org/abs/1810.00752?utm_source=openai: https://arxiv.org/abs/1810.00752?utm_source=openai
  - https://arxiv.org/abs/2104.11676?utm_source=openai: https://arxiv.org/abs/2104.11676?utm_source=openai
  - https://www.sciencedirect.com/science/article/pii/S0952197625024959?utm_source=openai: https://www.sciencedirect.com/science/article/pii/S0952197625024959?utm_source=openai
  - https://www.adaline.ai/blog/evaluating-ai-agents-in-2025?utm_source=openai: https://www.adaline.ai/blog/evaluating-ai-agents-in-2025?utm_source=openai
  - https://labs.adaline.ai/p/building-ai-products-not-prototypes?action=share&utm_source=openai: https://labs.adaline.ai/p/building-ai-products-not-prototypes?action=share&utm_source=openai

---

### Q16. REMOVAL AS IMPROVEMENT UNDER OBSERVATION
Cost: $1.30 | 11 citations | 19,130 chars full synthesis

# Automated Research Synthesis

Question: I want examples where removing complexity — memory, tools, communication channels, action space, visibility, planning depth — actually improved strategic performance under observation. Start with the Nunchi trading result about gains from removing complexity, then pull in information-theoretic game theory (Gossner, Mertens) and anything modern on strategic simplification, compression pressure, and observed-agent behavior. Search games, trading, negotiations, social deduction, and repeated signaling tasks.

The intuition I want to test is that when agents know they’re being watched, complexity can become a liability: more ways to leak, more surface area for exploitation, more inconsistent behavior. Does observation pressure select for simpler, cleaner, more robust strategies? Are there examples where pruning memory or reducing communication led to stronger play because it forced consistency or reduced detectability? Conversely, when does simplification kill adaptability?

I want practical and theoretical evidence. Search for “less is more” posts from builders, ablation studies where stripped-down agents won, and any game-theory takes on information-constrained equilibria. If convergence toward simplicity is itself a stable outcome under observation, that might be a result worth naming.

Budget rounds sufficient: no

## Heavy-Hitter Rationale

- The budget rounds are directionally useful but not sufficient for public-facing or design-critical conclusions. They support the broad intuition that observation pressure can reward strategic compression, yet the current evidence base still has critical holes: the Nunchi trading anchor appears unverified or confabulated, the Gossner/Mertens/Neyman theorem claims are not pinned to exact papers or theorem statements, Kandori-Obara generalization beyond 2-player PD is unresolved, Lee/de Clippel-Rozen were flagged but not actually recovered, and the MARL ablation evidence is mostly low-confidence. In other words, the hypothesis is plausible, but the citation spine is not publication-safe.

A targeted heavy-hitter phase is therefore justified. The five queries above are deliberately non-duplicative: one pins down theorems, one replaces or kills the trading/disclosure anchor, one harvests builder/practitioner evidence, one tests the ablation literature, and one converts the surviving evidence into a conservative Herpetarium V2 design framework. If budget becomes tight, run the firs
[...truncated...]

Top Sources:
  - https://www.mdpi.com/1099-4300/20/11/817?utm_source=openai: https://www.mdpi.com/1099-4300/20/11/817?utm_source=openai
  - https://www.sciencedirect.com/science/article/pii/S0899825607001169?utm_source=openai: https://www.sciencedirect.com/science/article/pii/S0899825607001169?utm_source=openai
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC6261583/?utm_source=openai: https://pmc.ncbi.nlm.nih.gov/articles/PMC6261583/?utm_source=openai
  - Less is more: an observability paradox in repeated games: https://link.springer.com/article/10.1007/s00182-006-0032-7?error=cookies_not_supported&code=f3f04149-5753-4ea6-afc9-25d8fcde7f82
  - Trading off Utility, Informativeness, and Complexity in Emergent Communication | Noga Zaslavsky: https://www.nogsky.com/publication/2022-neurips/

---

### Q17. WORLD MODEL OF THE ARENA
Cost: $2.85 | 60 citations | 24,478 chars full synthesis

# Automated Research Synthesis

Question: I want everything adjacent to building a predictive world model of a competitive agent ecology, where the goal is to allocate experiment / match budget to the most informative interventions. Start with Rohit Krishnan’s “Starcraft for CEOs” and “World Models: Computing the Uncomputable,” then search for league analytics, metagame modeling, population forecasting, experiment allocation, active learning over tournaments, and simulation-of-simulations for agent ecosystems.

The practical ask: can we build a model of the Herpetarium itself? Not just player strength, but ecology dynamics — who exploits whom, which coaching interventions spread, where deception clusters, when collusion emerges, which matchups are stale, what experiments are likely to produce the biggest update. Search for systems in esports, trading, RL leagues, evolutionary biology, market simulation, and agent ops that infer latent metagame state and use it to schedule future matches.

I’m especially interested in tools and representations: payoff graphs, exploitability matrices, belief-state summaries, latent-style embeddings, causal tournament models, and active experiment planners. If someone has built a “world model” of a strategy ecosystem that helps decide what to run next, I want it.

Budget rounds sufficient: no

## Actionable Now

- representation_stack: {'description': 'A three-layer representation is sufficiently grounded to implement immediately', 'components': [{'layer': 'empirical_game_matrix', 'tool': 'OpenSpiel with RegretNet or custom win-rate tracking', 'grounding': 'EGTA literature via mlanctot generalised method paper; Dyna-PSRO arxiv 2305.14223', 'caveat': 'Use win-rate proxy not true exploitability; augment with confidence intervals per cell'}, {'layer': 'interaction_graph', 'tool': 'NetworkX or PyTorch Geometric with directed edges weighted by exploitability delta', 'grounding': 'Pick Your Battles paper ar5iv 2110.04041', 'caveat': 'Non-transitive topology tracking is the key value-add over simple Elo; requires minimum 30 to 50 matchup observations per edge pair to be reliable'}, {'layer': 'latent_strategy_embedding', 'tool': 'VAE or contrastive encoder over match transcripts and action sequences', 'grounding': 'StyleGAN and VAE on replay buffers; behavioral fingerprinting literature', 'caveat': 'Requires domain-specific training data from Herpetarium itself; cold start problem is real'}]}; staleness_criterion: {'description': 'A 
[...truncated...]

Top Sources:
  - https://www.notboring.co/p/world-models?utm_source=openai: https://www.notboring.co/p/world-models?utm_source=openai
  - https://www.notboring.co/p/world-models?__readwiseLocation=&r=l1yev&triedRedirect=true&utm_source=openai: https://www.notboring.co/p/world-models?__readwiseLocation=&r=l1yev&triedRedirect=true&utm_source=openai
  - https://arxiv.org/abs/1908.05437?utm_source=openai: https://arxiv.org/abs/1908.05437?utm_source=openai
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC9786238/?utm_source=openai: https://pmc.ncbi.nlm.nih.gov/articles/PMC9786238/?utm_source=openai
  - The future of work is world models - by Rohit Krishnan: https://www.strangeloopcanon.com/p/the-future-of-work-is-world-models

---

### Q18. THREE-LOOP ARCHITECTURE AS COACH STATE MACHINE
Cost: $1.30 | 19 citations | 16,028 chars full synthesis

# Automated Research Synthesis

Question: I want practical patterns for turning a vague self-improvement loop into a state machine that actually closes. Use the Signal Garden REDESIGN-MEMO three-loop idea and the Vision Gap Analysis (587 proposals, 0 acted upon) as the vibe anchor, then search for agent architectures, ops loops, autonomous coding systems, research agents, and workflow engines where people explicitly solved “lots of ideas, no execution.” I want minimum viable closure mechanisms, not grand theory.

Search for systems with three-ish layers like: observe/diagnose, propose/plan, execute/verify — or coach/player/auditor — or generator/critic/operator. What are the smallest mechanisms that stop loops from stalling? Gating rules, budget locks, mandatory action quotas, confidence thresholds, intervention queues, replay reviews, retrospective triggers, escalation rules, archive writes, and “no proposal without executable diff” style constraints. Look for people who discovered that reflection alone just makes prettier inaction.

Also bring back failure modes. Why do loops stall? Too many proposals, no ownership, evaluator uncertainty, no memory compaction, no trigger for intervention, too much freedom, reward ambiguity, fear of destructive changes, critic bloat. I want concrete design patterns for a coach state machine that keeps producing useful strategic updates instead of endless commentary.

Budget rounds sufficient: no

## Heavy-Hitter Rationale

- The three budget rounds are sufficient to build a bare MVP closure loop right now: require executable diffs, use an owned OBSERVE -> PROPOSE -> EXECUTE -> VERIFY FSM, sandbox before live deployment, archive unreferenced insights, and escalate after repeated stalls. But they are not sufficient for confident Herpetarium V2 deployment in an adversarial, disclosed-strategy, evolving-tournament environment. The remaining unresolved gaps are deployment-critical rather than conceptual: adversarial signal poisoning under FOIA-style disclosure, persistent memory transfer and compaction across tournament resets, statistically valid verify gates for small marginal improvements, and explicit divergence-to-convergence phase switching with escalation packets. The query set above is intentionally narrow, non-overlapping, and avoids paying again for already-settled basics.

## Heavy-Hitter Queries

- exact_prompt: You are doing a deep research pass for Signal Garden's Herpetarium V2, an AI-team tournament system for 
[...truncated...]

Top Sources:
  - https://agentic-design.ai/patterns/learning-adaptation/self-improving-systems?utm_source=openai: https://agentic-design.ai/patterns/learning-adaptation/self-improving-systems?utm_source=openai
  - https://www.emergentmind.com/topics/closed-loop-self-correcting-execution?utm_source=openai: https://www.emergentmind.com/topics/closed-loop-self-correcting-execution?utm_source=openai
  - https://www.emergentmind.com/topics/self-refinement-loop?utm_source=openai: https://www.emergentmind.com/topics/self-refinement-loop?utm_source=openai
  - https://www.sitepoint.com/the-definitive-guide-to-agentic-design-patterns-in-2026/?utm_source=openai: https://www.sitepoint.com/the-definitive-guide-to-agentic-design-patterns-in-2026/?utm_source=openai
  - Proposal: Confidence-Aware Loop Completion via Structured Self-Assessment (“Confession” Phase) · Issue #74 · mikeyobrien/ralph-orchestrator: https://github.com/mikeyobrien/ralph-orchestrator/issues/74

---
