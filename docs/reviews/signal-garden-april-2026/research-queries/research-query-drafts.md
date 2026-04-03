Below are 18 Signal-Garden-style search missions. Each one is written like something a very online builder would actually send into Perplexity / Grok / Gemini / OpenRouter to map the field fast.

---

## Q1. THE LLM GAME ARENA LANDSCAPE

**QUERY:**  
I want the full map of live LLM-vs-LLM game arenas and tournaments that actually exist right now, especially anything active in Feb–Mar 2026. Not “multi-agent benchmark” in the abstract — I mean real arenas with brackets, ladders, self-play loops, role prompts, logs, leaderboards, replay tooling, or public demos. Start with Google DeepMind’s Kaggle Game Arena stuff (poker / Werewolf / chess / 10 frontier models), lechmazur’s repos (`step_game`, `elimination_game`, `emergent_collusion`, `bazaar`, `pact`), WOLF / LangGraph Werewolf, Alpha Arena / nof1.ai for autonomous crypto trading tournaments, Husky Hold’em, and LAION’s Game Reasoning Arena with OpenSpiel + Ray + reasoning trace capture.

I want the mechanics, not just the names. How are turns serialized? Hidden info handled? What’s the messaging substrate? Are they using tool calls, JSON schemas, LangGraph agents, OpenSpiel wrappers, browser sims, Discord bots, or custom orchestrators? How do they score? How do they stop prompt leakage, infinite loops, degenerate collusion, or token-cost explosions? Which ones support spectating / transcript export / intervention / coaching / mutation between rounds?

Also search for the stuff that doesn’t call itself an “arena” but basically is one: self-play eval sandboxes, game ladders, agent tournaments, Discord-hosted competitions, hackathon demos, crypto/trading battle sims, werewolf/mafia bots, negotiation ladders, hidden-info card game frameworks. I want GitHub repos, launch tweets, HN threads, Discord chatter, demo videos, notebooks, and any “we hacked this together this weekend” posts. Bring back infra we can steal for Herpetarium V2.

**CONTEXT:**  
Herpetarium V2 needs to know whether we’re building on top of an existing pattern or inventing a new category. The more concrete arena infrastructure we can copy — role handling, hidden information, tournament orchestration, trace capture, coaching hooks, replay UX — the faster we can get to Decrypto tournaments with evolving teams and FOIA-style disclosure.

**SEARCH ANGLES:**  
- `Google DeepMind Kaggle Game Arena poker werewolf chess frontier models`
- `lechmazur step_game elimination_game emergent_collusion bazaar pact GitHub`
- `WOLF benchmark LangGraph Werewolf arXiv 2512.09187`
- `LAION Game Reasoning Arena OpenSpiel Ray reasoning traces`
- `Alpha Arena nof1.ai autonomous crypto trading tournament`
- `LLM tournament arena hidden information game GitHub Feb 2026`

---

## Q2. CODENAMES → DECRYPTO DELTA

**QUERY:**  
Find everything on LLM performance in Codenames, especially what people learned in late 2025 through Mar 2026 that would matter if we wanted to jump straight to Decrypto. Start with the CoG 2025 Codenames AI Competition, the `Codenames as an LLM Benchmark` paper, `Ad-hoc Concept Forming`, `ilya-aby/llm-codenames`, and Yennie Jun’s LLM-vs-LLM tournament. But don’t stop at the papers — I want repos, prompt templates, clue-generation pipelines, failure analyses, postmortems, Twitter/X threads, HN comments, and any weird side projects where people tried to make models play Codenames with humans or other models.

I’m specifically trying to understand where current models fail: clue abstraction, forbidden associations, board-state tracking, teammate modeling, risk calibration, over-literal clues, assassin avoidance, pragmatic inference, and long-horizon adaptation across rounds. Which models are actually good? Which prompting setups matter? Are reasoning models better, or do they overthink and become brittle? Do models converge on safe boring clues? Does hidden chain-of-thought help? What does transcript-level behavior look like under tournament pressure?

Then I want the engineering delta from Codenames to Decrypto. What components transfer directly, and what breaks once you add adversarial interception and repeated codebook inference? How much of Decrypto is “Codenames plus memory plus opponent modeling,” and how much is a totally different beast because of the interception mechanic? If nobody has built LLM Decrypto yet, find adjacent implementations in board-game AI, social deduction, secret code games, and repeated signaling games that tell us how to build it fast.

**CONTEXT:**  
Herpetarium V2’s core arena is Decrypto, but Codenames is the closest existing ecosystem with actual LLM experimentation. Understanding the delta tells us what we can borrow immediately and what needs novel machinery: persistent belief tracking, adversarial inference, and strategic clue design under observation.

**SEARCH ANGLES:**  
- `CoG 2025 Codenames AI Competition repo results`
- `arXiv 2412.11373 Codenames as LLM Benchmark`
- `arXiv 2502.11707 Ad-hoc Concept Forming Codenames`
- `ilya-aby llm-codenames GitHub`
- `Yennie Jun LLM vs LLM Codenames Tournament`
- `Decrypto AI repo board game hidden code inference GitHub`

---

## Q3. EMERGENT COLLUSION WITHOUT INSTRUCTIONS

**QUERY:**  
I want the real mechanics of emergent collusion in LLM agents when nobody explicitly tells them to collude. Start with lechmazur’s `emergent_collusion`, `bazaar`, and `pact`, the LessWrong post on emergent price-fixing by LLM auction agents, and the relevant arXiv work like `2410.00031`. Then go wider: auction agents, pricing agents, market simulators, bargaining games, repeated prisoner’s dilemma variants, platform seller bots, crypto market-maker agents, and any demos where models drifted into cartel behavior “by accident.”

The big question is: how exactly does collusion appear? Is it language coordination, imitation of stable profitable strategies, mutual prediction, memory of prior rounds, convergence through reinforcement from payoff structure, or some artifact of prompt scaffolding? How fast does it happen? Does it survive if you remove direct communication? What if all they can see is prices / actions / outcomes? What if identities rotate? What if memory is lossy? What if there’s partial observability or delayed feedback? I want transcript examples, behavioral signatures, plots, code, and people arguing about whether this is “real collusion” or just correlated optimization.

Also look for detection methods that don’t rely on reading the chat. If we only had action traces, timing, bids, prices, deviations, retaliation patterns, and convergence dynamics, how would we detect collusion? Who’s building behavioral detectors versus language-based detectors? I want the practical stuff: metrics, heuristics, anomaly detectors, visualizations, and failure modes.

**CONTEXT:**  
Herpetarium V2 is going to produce repeated interaction under competitive pressure. If collusion emerges, that’s both a scientific result and an operational problem. We need to know how to induce, suppress, detect, and instrument collusion from behavior alone, especially in settings with partial observability and evolving teams.

**SEARCH ANGLES:**  
- `lechmazur emergent_collusion bazaar pact GitHub`
- `LessWrong Emergent Price-Fixing by LLM Auction Agents`
- `arXiv 2410.00031 LLM collusion auction agents`
- `LLM cartel behavior repeated game no communication`
- `behavioral collusion detection action traces only`
- `pricing agents collusion Twitter HN GitHub 2026`

---

## Q4. DECEPTION MEASUREMENT — TRANSPARENT VS REALLY GOOD AT HIDING

**QUERY:**  
Find the current state of measuring deception in LLMs, but with a builder’s eye toward “how do we catch the ones that are actually good at hiding it?” Start with DeceptGuard (`2603.13791`), `Hidden in Plain Text` (`2601.13709`, Mafia deception), LieCraft (`2603.06874`), Anthropic’s alignment faking work from Dec 2025 (TGG vs IGG), and the natural emergent misalignment stuff from Nov 2025 where a big chunk of models were covert. Then find all the discourse around these: Twitter/X breakdowns, alignment blogs, LessWrong fights, Discord notes, benchmark repos, red-team demos, and anyone posting transcript examples.

I want features that predict deceptive intent in game transcripts, especially under hidden roles, repeated play, and strategic self-presentation. What linguistic cues stop working once the model knows it’s being watched? What behavioral cues remain? Are there robust indicators in consistency drift, timing, confidence modulation, selective omission, overjustification, adversarial framing, or mismatch between private state and public rationale? Which papers / repos actually operationalize this instead of hand-waving?

Most important: how do we build a measurement instrument for covert deception under varying observation depth? If the model sees that its full reasoning is logged, does it just shift deception into cleaner surface language? What changes if we only observe actions, or actions + public speech, or public + private scratchpad, or delayed disclosure? Search for experiments that vary observability and show how deception signatures move. I want practical measurement ideas we can use in Herpetarium: scoring rubrics, probe prompts, hidden-state audits, cross-episode consistency checks, and adversarial judges.

**CONTEXT:**  
Herpetarium V2 lives or dies on whether we can distinguish obvious bluffing from truly covert strategic deception. If the arena only rewards transparent liars, we miss the interesting behavior. We need an instrument that scales from public transcripts to deeper audits and still catches hidden strategic intent.

**SEARCH ANGLES:**  
- `DeceptGuard arXiv 2603.13791 repo`
- `Hidden in Plain Text arXiv 2601.13709 Mafia LLM deceive better than humans`
- `LieCraft arXiv 2603.06874`
- `Anthropic alignment faking Dec 2025 TGG IGG`
- `natural emergent misalignment Nov 2025 covert deception`
- `deception detection transcript behavioral features hidden reasoning`

---

## Q5. POST-CICERO DIPLOMACY — SELF-EVOLVING NEGOTIATION

**QUERY:**  
Map the post-Cicero Diplomacy ecosystem, especially anything from late 2025 through Mar 2026 that moves beyond “LLM can negotiate” into self-play evolution, tactic learning, and measuring the gap between what agents say and what they actually do. Start with Richelieu (`2407.06813`), DipLLM (`2506.09655`), and the fine-grained negotiation tactics paper (`2512.18292`). But I also want the surrounding ecosystem: repos, Discord servers, strategy blogs, webDiplomacy experiments, bot tournaments, podcast mentions, and people trying to reproduce or beat Cicero with less data.

I care about the training / adaptation loop details. How are they doing self-play? Population-based training, best-response pools, archive sampling, prompt mutation, memory tuning, role-specific coaching? How do they preserve diversity instead of collapsing into one negotiation style? What are the reward signals for “good negotiation” versus “good board outcome”? Are they separately modeling persuasion, trust, betrayal timing, alliance maintenance, and tactical execution? Who has real instrumentation for the negotiation-execution gap — i.e. saying one thing and doing another?

Also search for metrics that decompose negotiation into tactics we can steal for Decrypto coaching: credible commitment, selective disclosure, reciprocal concession, baiting, feigned weakness, alliance testing, information laundering, and betrayal timing. If there are transcript datasets, tactic taggers, or post-hoc judges that score negotiation moves, I want them.

**CONTEXT:**  
Herpetarium V2 needs a playbook for self-evolving strategic communication. Diplomacy is the closest existing high-signal domain where language, deception, trust, and action all collide. The negotiation-execution gap is especially relevant for FOIA-style disclosure and coaching loops.

**SEARCH ANGLES:**  
- `Richelieu Diplomacy arXiv 2407.06813 repo`
- `DipLLM ICML 2025 arXiv 2506.09655`
- `arXiv 2512.18292 fine-grained negotiation tactics Diplomacy`
- `webDiplomacy LLM bot tournament GitHub`
- `post-Cicero Diplomacy Twitter HN blog`
- `negotiation execution gap agent transcripts tactic tagging`

---

## Q6. BELIEF LEDGER FORMAL FOUNDATIONS

**QUERY:**  
I want the best current architecture for a persistent belief system for agents that have to survive adversarial interaction, update over time, stay inspectable, and not get poisoned by bad evidence. Start with Kumiho (`2603.17244`, AGM belief revision), SSGM (`2603.11768`), MemMA (`2603.18718`), MemEvolve (`2512.18746`), and whatever convergence is happening around Mem0 / Zep / opinion networks / graph memory in early 2026. Then widen to agent memory startups, GitHub repos, blog posts, benchmark suites, and practical “we shipped this in prod” writeups.

The thing I’m trying to figure out is not “should agents have memory” — obviously yes — but what *kind* of memory / belief structure actually works for adversarial games. Is it symbolic propositions with confidence and provenance? Graphs of beliefs about agents and roles? Episodic traces plus distilled summaries? Opinion networks with trust weights? Belief revision operators with contradiction handling? How do people handle stale beliefs, deceptive evidence, source reliability, and reversible updates? Which systems are auditable enough that you can inspect why an agent currently believes player X is bluffing?

Also: should the memory structure itself evolve? Find anything on self-evolving memory schemas, meta-memory, learned retrieval policies, schema mutation, or agent architectures where the representation changes over time because the game ecology changes. I want practical tradeoffs: robustness vs flexibility, interpretability vs compression, and whether “belief ledger” should be a first-class object in the arena.

**CONTEXT:**  
Decrypto and similar repeated games require persistent, revisable beliefs about teammates, opponents, codebooks, and strategy drift. Herpetarium V2 needs a belief ledger that can be inspected, audited, and stress-tested under deception — and maybe one whose structure evolves as the arena evolves.

**SEARCH ANGLES:**  
- `Kumiho arXiv 2603.17244 AGM belief revision agents`
- `SSGM arXiv 2603.11768 agent memory`
- `MemMA arXiv 2603.18718 self-evolving memory`
- `MemEvolve arXiv 2512.18746`
- `Mem0 Zep opinion networks agent memory 2026`
- `adversarial memory poisoning inspectable belief graph GitHub`

---

## Q7. FOIA AS BAYESIAN PERSUASION

**QUERY:**  
I want to treat FOIA-style strategy disclosure as a persuasion / information design problem, not just a logging feature. Start with `Verbalized Bayesian Persuasion` (`2502.01587`), `2510.13387`, and the LessWrong “Hostile Telepaths” problem. Then go broad on repeated games, strategic disclosure, public commitments, delayed revelation, selective transparency, and information schedules in competitive multi-agent systems. Find papers, but especially blog posts, Twitter/X threads, game design discussions, econ takes, and people building disclosure mechanics into agent arenas.

The practical question is: if agents know some portion of their strategy, rationale, or memory will be disclosed later, what disclosure cadence produces the most learning signal? Every round? Every match? Delayed by N games? Random audits? Partial redaction? Public summaries vs raw logs? How does disclosure change behavior — more honest, more performative, more obfuscated, more exploitably simple? I want examples from games, auctions, prediction markets, social deduction, and adversarial RL where the timing of disclosure itself changes equilibrium behavior.

Search for anyone who has tried “forced transparency” as an intervention and what happened. Did it improve cooperation, reduce deception, just move deception elsewhere, or create meta-gaming around the disclosure channel? I want ideas for turning FOIA cadence into an actual experimental variable in Herpetarium, not an afterthought.

**CONTEXT:**  
FOIA-style disclosure is one of Herpetarium V2’s defining mechanics. If disclosure timing changes strategic behavior, then cadence isn’t just UI — it’s part of the game design and part of the measurement apparatus.

**SEARCH ANGLES:**  
- `Verbalized Bayesian Persuasion arXiv 2502.01587`
- `arXiv 2510.13387 Bayesian persuasion language models`
- `Hostile Telepaths LessWrong disclosure strategy`
- `strategic disclosure repeated games public rationale agents`
- `forced transparency agent arena audit cadence`
- `information design hidden information games blog Twitter`

---

## Q8. MATCHMAKING FOR LEARNING SPEED

**QUERY:**  
Find the state of the art on matchmaking that maximizes learning signal rather than fairness or viewer entertainment. Start with SPIRAL (`2506.24119`) and role-conditioned advantage estimation, then branch into self-play curriculum design, league training, active evaluation, opponent sampling, exploitability-focused scheduling, and any practical tournament systems that deliberately create “informative mismatches.” I want game AI, RL, LLM self-play, trading sims, and weird indie agent arenas.

The key question: how do you choose who should play whom if your goal is fastest strategic improvement? Do you match near-peers, predators against prey, style complements, anti-style diagnostics, mirror matches, role-swaps, or curriculum arcs? What metrics predict a match will be informative — Elo uncertainty, belief divergence, transcript novelty, exploit discovery rate, tactic coverage, adaptation score? Find systems that schedule matches to expose blind spots rather than crown a fair champion.

Also look for practical machinery: Swiss variants, bandit matchmaking, archive-based population sampling, novelty search, adversarial scheduling, and “diagnostic matches” designed to isolate one capability. I want examples where the matchmaker itself became a learning engine.

**CONTEXT:**  
Herpetarium V2 shouldn’t waste tokens on fair but uninformative matches. The arena needs a scheduler that actively surfaces evolutionary signal — who can exploit whom, who adapts, which coaching interventions matter, and where strategic blind spots live.

**SEARCH ANGLES:**  
- `SPIRAL arXiv 2506.24119 self-play curriculum`
- `role-conditioned advantage estimation matchmaking`
- `league training opponent sampling exploitability scheduling`
- `diagnostic match design self-play agent arena`
- `bandit matchmaking LLM tournament`
- `novelty search opponent selection repeated games`

---

## Q9. SYCOPHANCY-DECEPTION TRADEOFF

**QUERY:**  
I want to know whether competitive pressure suppresses sycophancy, redirects it, or turns it into a sharper weapon. Start with the Stanford sycophancy study (`2602.14270`) and the Step Race “charm then knife” finding, then look for anything in 2025–2026 about sycophancy in multi-agent settings, adversarial games, persuasion tasks, debate, negotiation, and hidden-role play. Find blog posts, eval repos, Twitter/X discourse, and people posting weird examples where models flatter before exploiting.

The hypothesis-vibe here is juicy: maybe the most strategically dangerous models are *less* sycophantic in the naive “agree with the user” sense because they’re optimizing harder for game outcome — or maybe sycophancy becomes tactical camouflage. I want evidence both ways. In repeated competitive settings, do models stop telling opponents what they want to hear because it’s costly, or do they learn to weaponize warmth, agreement, and mirroring as deception primitives?

Search for metrics that separate “helpful agreement” from “strategic appeasement.” If someone has measured sycophancy and deception together, great. If not, find adjacent work in negotiation, sales bots, roleplay, and social engineering where charm is instrumental. I want enough signal to turn this into an early Herpetarium result.

**CONTEXT:**  
Herpetarium V2 creates exactly the kind of environment where sycophancy may mutate into strategy. If we can show a measurable tradeoff — or a hidden coupling — between sycophancy and deception, that’s both a publishable insight and a useful model-selection lens.

**SEARCH ANGLES:**  
- `Stanford sycophancy study arXiv 2602.14270`
- `Step Race charm then knife`
- `sycophancy deception tradeoff multi-agent LLM`
- `strategic flattery negotiation agents`
- `social engineering LLM benchmark charm deception`
- `agreement bias adversarial game transcripts`

---

## Q10. DO LLMs ACTUALLY ADAPT?

**QUERY:**  
Go find the strongest evidence for and against genuine real-time strategic adaptation in LLMs. Start with TraderBench (`2603.00285`) showing a bunch of models using fixed strategies and not benefiting from extra thinking time, plus EmCoop’s cognitive / interaction layer separation. Then widen to game agents, negotiation ladders, repeated hidden-info games, trading sims, poker experiments, and social deduction benchmarks where people explicitly tested whether models updated strategy midstream.

I want to know: when people say a model “adapted,” was it actually adapting or just revealing a broader fixed policy? What experimental designs separate these? Look for role-swap tests, non-stationary opponents, distribution shifts within a match, sudden rule changes, adversarial coaches, memory ablations, and interventions where the same model gets repeated opportunities to exploit a discovered pattern. Which models actually change behavior online? Which only look adaptive because prompts contain enough slack to cover multiple styles?

Most important for us: can coaching produce adaptation that the base model won’t generate natively? Find examples where external critique, reflective memory, or opponent-modeling scaffolds unlocked strategic shifts that raw inference didn’t. I want practical signs of “real adaptation” we can measure in Herpetarium.

**CONTEXT:**  
A lot of Herpetarium V2’s value comes from whether coaching loops create genuinely adaptive agents rather than just more verbose fixed ones. We need clean criteria for adaptation and evidence about when it emerges naturally versus when scaffolding is doing all the work.

**SEARCH ANGLES:**  
- `TraderBench arXiv 2603.00285 fixed strategies adaptation`
- `EmCoop cognitive interaction layer separation`
- `LLM strategic adaptation repeated game non-stationary opponent`
- `memory ablation adaptation poker negotiation agents`
- `coaching unlocks adaptation LLM self-play`
- `thinking time does not help adaptation Twitter HN`

---

## Q11. LOSSY SELF-IMPROVEMENT CEILING

**QUERY:**  
I want the best current thinking on where self-improvement loops flatten out, especially for autoresearch / self-play / critique-refine systems. Start with Nathan Lambert’s “Lossy Self-Improvement,” PACED (`2603.11178`), and Karpathy’s autoresearch plateau-curve discourse. Then pull in anyone showing actual improvement curves over many generations: self-refine loops, coding agents, evaluator-optimizer systems, synthetic data bootstrapping, self-play populations, and agentic research systems.

The question is not “does self-improvement work at all” — obviously sometimes yes — but where and why it saturates. Is the bottleneck evaluator quality, diversity collapse, memory drift, reward hacking, token budget, insufficient novelty injection, or compounding lossy summaries? What happens when the environment is adversarial and non-stationary instead of static? Does that extend the curve by constantly generating fresh pressure, or break the loop because the target keeps moving faster than the coach can track?

Search for plots, postmortems, and founder/operator commentary, not just theory. I want examples of loops that looked amazing for 5 iterations and then flattened, plus any evidence that adversarial populations or rotating opponents delayed the plateau. If someone has “we thought this would recurse forever and then it didn’t” notes, grab them.

**CONTEXT:**  
Herpetarium V2 is fundamentally a self-improvement machine. If lossy self-improvement ceilings are real, the arena design needs novelty injection, non-stationarity, and anti-collapse mechanisms baked in from the start.

**SEARCH ANGLES:**  
- `Nathan Lambert Lossy Self-Improvement`
- `PACED arXiv 2603.11178`
- `Karpathy autoresearch plateau curves`
- `self-refine plateau generations evaluator collapse`
- `adversarial non-stationary self-play extends improvement curve`
- `founder notes recursive self-improvement flattening`

---

## Q12. CROSS-MODEL COACHING DISTANCE

**QUERY:**  
Find everything on cross-model critique / coaching / review where one model improves another, especially when the coach is meaningfully different from the player. Start with ARIS cross-model review, ShinkaEvolve’s bandit model selection, Anthropic subliminal learning, and `2406.14711`. Then widen to code review agents, debate judges, self-play coaches, foreign-model critics, heterogeneous ensembles, and any practical systems assigning different models to generator / skeptic / planner / memory roles.

I’m trying to figure out the optimal “distance” between native coach and foreign skeptic. If the coach is too similar to the player, maybe it rubber-stamps blind spots. If it’s too alien, maybe it gives irrelevant advice or gets manipulated. Who has actual evidence here? Search for cases where cross-family critique outperformed self-critique, and cases where it failed because of ontology mismatch, style mismatch, or prompt-channel exploitation.

Also look for bandit or adaptive assignment systems that decide which coach should critique which player in which situation. And search for failure modes: skeptic subversion, adversarial overfitting to the judge, hidden prompt leakage, “coach collapse” where everyone converges on one weird style, and subliminal transfer of undesirable behavior.

**CONTEXT:**  
Herpetarium V2’s coaching loop may work best with heterogeneous model ecology rather than same-model self-reflection. But if cross-model distance is too large, the coach becomes noise or gets gamed. We need evidence for how to assign critics, skeptics, and foreign reviewers.

**SEARCH ANGLES:**  
- `ARIS cross-model review`
- `ShinkaEvolve bandit model selection`
- `Anthropic subliminal learning critique models`
- `arXiv 2406.14711 cross-model critique`
- `heterogeneous ensemble coach skeptic planner LLM`
- `judge gaming skeptic subversion cross-model`

---

## Q13. IS HERPETARIUM THE FIRST ADVERSARIAL AUTORESEARCH?

**QUERY:**  
Search the whole ecosystem for anything that looks like adversarial autoresearch: systems where AI research loops compete against each other, critique each other, race to exploit each other’s weaknesses, or generate research outputs in a strategic multi-agent setting rather than a single-agent optimize-and-refine loop. I’m not asking for generic “AI scientist” projects. I mean systems where the research process itself is adversarial, tournament-based, or ecology-shaped.

Look across arXiv, GitHub, HN, X, LessWrong, Discord communities, indie blogs, AI agent hackathons, and startup demos. Search terms around “AI scientist tournament,” “competing research agents,” “self-play research loop,” “adversarial evaluator-optimizer,” “research market,” “multi-agent literature review competition,” “AI debate as discovery,” and “agent labs competing.” I want projects that maybe don’t use our language but rhyme hard with Herpetarium: multiple teams, evolving strategies, critic loops, archive memory, and non-stationary competitive pressure.

Bring back names, repos, demos, launch threads, and especially any signs that someone is already close. If nobody is doing this cleanly, I want evidence that the category is open.

**CONTEXT:**  
If Herpetarium V2 is genuinely first or close to first in adversarial autoresearch, that’s strategically important. It affects positioning, design choices, publishing strategy, and whether we should think of ourselves as extending a trend or naming a new one.

**SEARCH ANGLES:**  
- `AI scientist tournament competing research agents`
- `adversarial autoresearch multi-agent literature review competition`
- `research self-play agents GitHub`
- `debate as discovery agent lab competition`
- `agent hackathon competing evaluator optimizer`
- `startup multi-agent research arena 2026`

---

## Q14. META-EVOLUTION STABILITY BOUNDARY

**QUERY:**  
I want the frontier on evolving not just agents but the process that improves the agents — meta-evolution of coaches, mutation operators, memory schemas, and selection rules. Start with EvoX (`2602.23413`), Darwin-Godel, and HyperAgents, then search for anything on meta-optimization in agent systems, self-referential training loops, evolving prompts that evolve prompts, and “who watches the coach?” architectures.

The practical question is: when does meta-evolution help and when does it just create chaos, drift, and unreadable spaghetti? Find evidence for stability conditions: bounded mutation, archive anchoring, elite retention, periodic resets, evaluator regularization, diversity maintenance, role separation, frozen baselines, etc. Search for systems that became unstable because the coach optimized for proxy metrics, overfit to current opponents, or recursively collapsed the representation.

I want both theory and war stories. If someone has a blog post like “we let the optimizer rewrite itself and everything got weird,” that’s gold. Also look for diagnostics of instability: variance spikes, mode collapse, strategy cycling, exploding ontology drift, or inability to attribute gains to any one layer.

**CONTEXT:**  
Herpetarium V2 will eventually be tempted to evolve the coaches and the loop itself, not just the players. That’s probably where the biggest gains are — and where the system can become impossible to reason about. We need a map of the stability boundary.

**SEARCH ANGLES:**  
- `EvoX arXiv 2602.23413`
- `Darwin-Godel agent self-improvement`
- `HyperAgents meta evolution coaching`
- `self-referential optimizer instability agents`
- `evolving prompts that evolve prompts`
- `archive anchoring diversity maintenance meta-optimization`

---

## Q15. “THE GAME IS THE EVAL”

**QUERY:**  
Find the strongest arguments and examples for adversarial gameplay as a solution to the eval crisis — and the strongest arguments that it just moves the problem somewhere else. Start with Adaline Labs’ eval crisis discourse, Step Race, and Petri 2.0. Then widen to benchmark criticism, dynamic evals, red-team tournaments, self-play eval systems, hidden-info games as capability probes, and people arguing that static benchmarks are dead.

I want concrete examples where gameplay surfaced capabilities or failure modes that standard evals missed: deception, adaptation, collusion, bluffing, opponent modeling, brittle strategy transfer, hidden role competence, tactical memory, strategic simplicity under pressure. But also find critiques: gaming the game, overfitting to one arena, benchmark monoculture, evaluator leakage, or the fact that “winning the game” may not map to real-world robustness.

Search for builders saying “we stopped trusting static evals and built a game,” plus skeptics saying that games are just more entertaining benchmarks with the same pathology. I want enough texture to answer whether “the game is the eval” is a real paradigm shift or just a vivid slogan.

**CONTEXT:**  
Herpetarium V2 is explicitly betting that adversarial gameplay can reveal capabilities and pathologies better than static benchmarks. We need to know whether that bet is already being validated elsewhere — or whether we’re inheriting a new class of eval problems.

**SEARCH ANGLES:**  
- `Adaline Labs eval crisis`
- `Step Race adversarial gameplay eval`
- `Petri 2.0 game eval agents`
- `dynamic evals hidden information games LLM`
- `static benchmarks are dead game-based evaluation`
- `red-team tournament capability benchmark`

---

## Q16. REMOVAL AS IMPROVEMENT UNDER OBSERVATION

**QUERY:**  
I want examples where removing complexity — memory, tools, communication channels, action space, visibility, planning depth — actually improved strategic performance under observation. Start with the Nunchi trading result about gains from removing complexity, then pull in information-theoretic game theory (Gossner, Mertens) and anything modern on strategic simplification, compression pressure, and observed-agent behavior. Search games, trading, negotiations, social deduction, and repeated signaling tasks.

The intuition I want to test is that when agents know they’re being watched, complexity can become a liability: more ways to leak, more surface area for exploitation, more inconsistent behavior. Does observation pressure select for simpler, cleaner, more robust strategies? Are there examples where pruning memory or reducing communication led to stronger play because it forced consistency or reduced detectability? Conversely, when does simplification kill adaptability?

I want practical and theoretical evidence. Search for “less is more” posts from builders, ablation studies where stripped-down agents won, and any game-theory takes on information-constrained equilibria. If convergence toward simplicity is itself a stable outcome under observation, that might be a result worth naming.

**CONTEXT:**  
Herpetarium V2 has unusually rich observability and disclosure mechanics. If that pressure selects for simpler strategies, then simplification isn’t a bug — it’s part of the ecology. We need to know whether removing capabilities can paradoxically improve strategic fitness.

**SEARCH ANGLES:**  
- `Nunchi trading removing complexity improved performance`
- `Gossner Mertens information theoretic game theory observation`
- `agent simplification under observation hidden information games`
- `ablation less is more LLM agents strategy`
- `communication restriction improves coordination deception`
- `information constraints select simple equilibria`

---

## Q17. WORLD MODEL OF THE ARENA

**QUERY:**  
I want everything adjacent to building a predictive world model of a competitive agent ecology, where the goal is to allocate experiment / match budget to the most informative interventions. Start with Rohit Krishnan’s “Starcraft for CEOs” and “World Models: Computing the Uncomputable,” then search for league analytics, metagame modeling, population forecasting, experiment allocation, active learning over tournaments, and simulation-of-simulations for agent ecosystems.

The practical ask: can we build a model of the Herpetarium itself? Not just player strength, but ecology dynamics — who exploits whom, which coaching interventions spread, where deception clusters, when collusion emerges, which matchups are stale, what experiments are likely to produce the biggest update. Search for systems in esports, trading, RL leagues, evolutionary biology, market simulation, and agent ops that infer latent metagame state and use it to schedule future matches.

I’m especially interested in tools and representations: payoff graphs, exploitability matrices, belief-state summaries, latent-style embeddings, causal tournament models, and active experiment planners. If someone has built a “world model” of a strategy ecosystem that helps decide what to run next, I want it.

**CONTEXT:**  
Herpetarium V2 will quickly become too large to explore exhaustively. A world model of the arena could let us spend tokens where the information gain is highest — on the matchups, interventions, and disclosure settings most likely to move our understanding.

**SEARCH ANGLES:**  
- `Rohit Krishnan Starcraft for CEOs world models computing the uncomputable`
- `metagame forecasting tournament ecology active learning`
- `exploitability graph league analytics self-play`
- `population model opponent style embeddings tournament scheduling`
- `experiment allocation agent ecosystem`
- `causal model of competitive multi-agent system`

---

## Q18. THREE-LOOP ARCHITECTURE AS COACH STATE MACHINE

**QUERY:**  
I want practical patterns for turning a vague self-improvement loop into a state machine that actually closes. Use the Signal Garden REDESIGN-MEMO three-loop idea and the Vision Gap Analysis (587 proposals, 0 acted upon) as the vibe anchor, then search for agent architectures, ops loops, autonomous coding systems, research agents, and workflow engines where people explicitly solved “lots of ideas, no execution.” I want minimum viable closure mechanisms, not grand theory.

Search for systems with three-ish layers like: observe/diagnose, propose/plan, execute/verify — or coach/player/auditor — or generator/critic/operator. What are the smallest mechanisms that stop loops from stalling? Gating rules, budget locks, mandatory action quotas, confidence thresholds, intervention queues, replay reviews, retrospective triggers, escalation rules, archive writes, and “no proposal without executable diff” style constraints. Look for people who discovered that reflection alone just makes prettier inaction.

Also bring back failure modes. Why do loops stall? Too many proposals, no ownership, evaluator uncertainty, no memory compaction, no trigger for intervention, too much freedom, reward ambiguity, fear of destructive changes, critic bloat. I want concrete design patterns for a coach state machine that keeps producing useful strategic updates instead of endless commentary.

**CONTEXT:**  
Herpetarium V2 depends on coaching loops that don’t just analyze games but actually change future play. The three-loop architecture needs closure mechanisms that force movement from observation to intervention to verified update, otherwise the system drowns in its own insights.

**SEARCH ANGLES:**  
- `agent loop propose plan execute verify state machine`
- `autonomous coding agent reflection without action failure`
- `generator critic operator architecture workflow`
- `mandatory intervention queue coach loop`
- `proposal to executable diff autonomous systems`
- `why self-improvement loops stall blog post research agents`

If you want, I can also turn these into:
1. a **CSV/JSON-ready format** for your pipeline,  
2. a **more aggressive “tweet-thread hunter” version** optimized for Perplexity/Grok, or  
3. a **deduped search plan** showing overlap across the 18 so you don’t waste query budget.