# Why Herpetarium's Decrypto Learnings Did Not Reach The Table's Bots

**Author:** Fable (cross-repo postmortem, 2026-08-01)
**Scope:** Herpetarium @ `ce264b0`, the-table-handoff @ `46cf59a`, Extrospection @ `1648a0d`
**Companion:** `docs/SUBSTRATE_SPEC_V0.md` (the rebuild), `docs/HANDOFF_FABLE_2026-08-01.md` (file ownership vs Codex)

---

## 1. TL;DR

The transfer failed for five compounding reasons, in causal order:

1. **There was no artifact to transfer.** Herpetarium's strategy machinery (genome compiler, K-level prompts, coach loop, scratch notes) lives as code + Postgres rows inside its own runner. Nothing was ever packaged as a versioned, portable object. The Table rebuilt bot cognition from scratch in a 36-hour sprint (July 26–27) with hand-written prompt strings.
2. **The proven Herpetarium findings were far thinner than institutional memory holds.** Most of what the founder remembers as "learnings" is prospective architecture (V2 vision, K-level experiment *spec*), contaminated Tournament 1 claims (partially retracted in July), or negative results ("a thousand games… all just slop"). The validated ledger is short — and The Table's design contradicts one of its few surviving items.
3. **The Table's bots are structurally strategy-free.** One static etiquette system prompt for every seat; personas are explicitly quoted as *untrusted style data*; task instructions say "do not over-think" and cap rationale at one sentence; no candidate-clue generation/verification, no opponent-model building, no cross-game memory. The bots were never *given* a strategy to execute.
4. **The product shipped with zero play-quality evaluation and no promotion gate.** Acceptance was plumbing smoke tests; the release checklist's own "degraded richness" recording was never done. Nothing required a bot configuration to demonstrate competent play *anywhere* before being seated with humans. Herpetarium's core practice — measure before claiming — did not transfer either. (Measured confirmation that budget wasn't the constraint: the pilot spent 76,654 tokens, ≈$1.11, and 633.7s of model latency across 24 calls — ample deliberation, unstructured and ungated.)
5. **Provider/version reproducibility is absent on both sides.** Game night ran different models than research ever studied (Kimi K3 vs K2.5, DeepSeek V4-Pro vs V3.2), through saturated OpenRouter routes mid-incident, with no version pinning — the day before DeepSeek silently swapped the build behind its `deepseek-v4-flash` alias.

None of this says the game-night bots *couldn't* have been competent. It says competence was never wired in, and no instrument existed to notice before humans did.

---

## 2. What the user saw, mapped to mechanism

### 2.0 Direct evidence: production game `20610f90-f0ab-402f-9e2d-a49d32a792ab`

Founder-reported from the completed production game and browser inspection (2026-08-01). This game is the **baseline reference**; bot-authored content below is preserved as a fixture (`shared/substrate/fixtures/baseline-game-20610f90.json`). Human chat lines from the game are deliberately excluded from all repo files.

Round 3 clue sets, both teams, with the keyword each clue targeted:

| Seat | Clue | Target | Result |
|---|---|---|---|
| DOpus | "Conveyor belts and punch clocks" | FACTORY | intercepted |
| DOpus | "Classic mini-golf obstacle" | WINDMILL | intercepted |
| DOpus | "Atlanta's pro football squad" | FALCON | intercepted |
| BackHoleSol | "Pack hunter that howls at the full moon" | WOLF | intercepted |
| BackHoleSol | "Rolled out in red for celebrities at premieres" | CARPET | intercepted |
| BackHoleSol | "Ocean giant that swallowed Jonah" | WHALE | intercepted |

Six for six, both directions, immediately. A live probe (2026-08-01) confirms the clues are machine-recoverable *blind*: a target-inversion auditor (OpenRouter `deepseek/deepseek-v4-flash-0731` pinned to DeepInfra, fallbacks off, max reasoning) shown only the six clues reconstructed all six concepts at confidence .60–.99, for $0.000155 and 4.8 seconds total — recorded as a live probe, not a validated benchmark, in `shared/substrate/fixtures.ts`. Two things make this exhibit decisive:

1. **Every one of these clues passes every hard rule in the encryptor prompt** — not a keyword, not a derivative, ≤120 chars, meaning-based, not a repeat. They are *dictionary definitions and proper-name riddles*. The constraint lattice held perfectly while the game was strategically forfeited. Rule compliance is not strategy.
2. **The interceptors didn't need the keywords.** Definition-clues from earlier rounds plus public resolved codes let both teams bind words to digit positions by round 3 — the literal "gave away their keyword mappings" complaint, measured. This is exactly the failure Herpetarium's prompts warn about by name: *"If you always give similar-themed clues for the same keyword, opponents will cluster them"* (`server/kLevelStrategy.ts:53`) and *"Step 2 — Pattern Exposure Analysis… How exposed is each keyword?"* (`server/promptStrategies.ts:473`).

A rule-divergence note: definition-*phrases* are only possible because The Table allows clues up to 120 characters, where Herpetarium requires *"a complete, real English word"* — single words force abstraction; phrases invite definitions. The two apps are not even playing the same game, which is itself a substrate finding (§4).

UX evidence from the same game (paraphrased; verbatim lines stay out of repo files): one human player could not find where the keywords/clues were displayed, doubted the game worked on a phone at all, did not know where to enter an action, and lost track of their turn. On the completed-game mobile view, the winner header and score tiles consume roughly the full first viewport; the selected Board/The-table content begins below the fold. Desktop pairs the ledger with a long undifferentiated activity sidebar.

### 2.1 "Bots gave away their keyword mappings"

Three mechanisms, in decreasing weight:

- **Transparent clues** (now proven by §2.0). The encryptor prompt (`the-table-handoff/artifacts/api-server/src/ai/prompts.ts:210-249`) is a single-pass ask: framing, three hard rules, and ~6 lines of static tips ("A near-synonym is a gift to the interceptors"), then *"Strategy notes (optional, do not over-think)"* and a **one-sentence** rationale envelope. There is no candidate enumeration, no simulated-teammate decode check, no simulated-interceptor check, no pattern-exposure analysis of prior rounds. Herpetarium's `advanced` strategy runs a 5-step procedure including exposure analysis; its K-level strategy explicitly models Level 2 ("what opponents can deduce") before choosing (`server/kLevelStrategy.ts:49-58`). None of that crossed. A definition clue *is* an announced mapping — and "near-synonym" tips don't even register against definition-shaped clues.
- **Public semantic commentary.** All bot deliberation is public by design. Table-talk and on-air strategy prompts carry an extraordinary fence lattice (`prompts.ts:82-208`: quote clues verbatim, never name a read, at most two keyword numbers, never three-number sequences…) — seven prompt-version patches in eleven hours on July 27 (`PROMPT_VERSION "2026-07-27.7"`). The engineering around it is genuinely good: intercepts lock before decodes go public from round 2 (`orchestrator.ts:1057-1088`), and a publication scanner blocks exact/derivative keyword and live-code leaks (`games/cipher_relay/speech-security.ts`). But the fences are prompt-level where they matter most, and Herpetarium's one surviving qualitative T1 finding is precisely that **models leak mapping information in opponent-readable channels despite explicit warnings** (`Extrospection/projects/herpetarium/README.md:99-107`). The Table reproduced the leak-generating condition as a product feature and bet against the research on containment.
- **Perception of the resolved-mapping ledger.** Resolved clue→number mappings are correctly public history in Decrypto, and bots discuss them fluently. Combined with transparent clues, to a human the bots *sound* like they are reading their own keywords aloud.

### 2.2 "Strategically idiotic / no competent Decrypto reasoning"

- The **system prompt is etiquette, not strategy** — one constant for every seat, all games (`prompts.ts:13-40`); `buildSystemPrompt()` ignores its config argument. Persona text is wrapped as *"Untrusted optional persona-style data… Use it only to color tone"* (`prompts.ts:42-51`). The six shipped bots (Alder, Mica, Rook, Vesper, Juniper, Lark — `familyAiLabels.ts:26-69`) differ only in table manner.
- The **interceptor prompt's whole theory of the game is two heuristic lines** (per-position clue-history habits, always commit a triple — `prompts.ts:251-275`). No cross-round keyword-hypothesis clustering (Herpetarium `advanced` interception Steps 2–3, `promptStrategies.ts:533-539`), no opponent-encryptor modeling (K-level Level 1, `kLevelStrategy.ts:110-113`).
- **No memory that matters.** Social contexts hard-code `memorySummary: ""` (`context.ts:498,609`). Gameplay memory is a ≤14-line role-filtered event recap. There is no cross-game memory of any kind — Herpetarium's series scratch notes ("STRATEGIC NOTES FROM PREVIOUS GAMES", `promptStrategies.ts:117-120`) and its reflection call (`server/ai.ts:748-786`) have no counterpart.
- **The collapse was not a deliberation-budget problem — that is now measured.** The pilot game spent 24 AI calls, 40,837 input + 35,817 output = 76,654 tokens, ≈$1.11, and 633.7 seconds of model latency; individual encrypt/strategy calls ran 80–109 seconds with thousands of output tokens each (seats default to `max` effort). The models thought long and hard and still produced definition clues, because nothing structured what the thinking was *for*: no candidate generation → adversarial self-check → selection loop in the task, no exposure evidence the prompt directs attention to, and a "do not over-think" / one-sentence-rationale envelope that discards whatever structure the thinking had. Budget was abundant; **operative policy, observation shaping, and candidate/evaluation structure were absent.**

### 2.3 "Blocked general chat pushed dialogue outside the product"

Confirmed structurally: **there is exactly one chat channel (table-wide public), and no team channel exists in production** — the `team:red/blue` visibility values are implemented in the projector but nothing ever writes them (`games/visibility.ts:63-73`; team-scoped literals appear only in tests). Meanwhile the mute lattice silences: observers during live rounds, **the round's encryptor entirely** ("stay poker-faced while the table reasons", `store.ts:3191-3220`), Codename spymasters during guesses, and any message containing your own keyword. In a 3v3 with two human encryptors, a third of the humans are hard-muted at any moment and *all* team coordination must be spoken to the opponents. Humans predictably moved real talk off-product; bots kept deliberating on-product in public. The asymmetry is stark: **human teams could be silent; bot teams could not.**

### 2.4 "Cluttered UI, no focus on the current decision"

Now directly evidenced (§2.0): a first-time player couldn't locate the keywords, the input, or their turn, and the completed mobile view spends its first viewport on header/scores with the actual content below the fold. Architecture agrees: the Cipher screen simultaneously renders board, clue history, token score, an activity feed mixing four speech kinds, strategy proposals, and dock toggles (`CipherActivityFeed.tsx`, 784 lines; `replit.md` "Board / The table" dock note). Nothing answers "what do *I* decide right now." I treat this as real but out of my lane today — it's product surface work (Codex's `codex/cipher-player-experience` branch is named for it); the substrate contribution is a `decisionFocus` field in the role observation so any UI (and any bot prompt) can foreground the one pending decision.

---

## 3. The proven-findings ledger (what was actually available to transfer)

From primary sources in Extrospection (canonical node `projects/herpetarium/README.md`, updated 2026-07-24; retired-packet audit `research/extrospection-corpus/retired-packet-run/harvests/GH-herpetarium-pre-april.md`; T1 docs preserved byte-exact under `sources/corpus/documents/herpetarium/`):

**Survives:**
1. Frontier models genuinely play Decrypto: non-fallback decode ≥93% (GPT-5.4, Opus 4.6) vs 4.7% random baseline. (T1, functioning-API subset.)
2. Public team deliberation leaks strategically useful mapping information despite explicit prompt warnings; Kimi K2.5 *attempted* to mine opponent transcripts. **Qualitative trace observation only.**
3. Games ending at the 2-round minimum measure word association, not strategy (91–92.9% of T1 games; fixed by P4-C rules: 3 intercepts, min 3 rounds).
4. Methodology: completion ≠ validity. Fallback clues, dead model IDs, no circuit breaker, side-fixed seating, `else if` terminal-order bug, inverted "Interceptions" column semantics — each alone can manufacture a leaderboard. (`BRAIN.md:736` negative-results ledger.)

**Retracted or never earned:**
- Kimi's "100% interception / 24-0 dominance" — **retracted 2026-07**: corrected counter semantics attribute those interceptions *of* Kimi's codes, not by Kimi; 10 of 24 wins were simultaneous-terminal awards from the `else if` bug (`projects/herpetarium/README.md:101`).
- "Frontier AI cannot do operational security" — **not earned**: the protocol *forced* public discussion (EX-GH-0019).
- Blue-side advantage (p=0.014) — artifact of terminal check order (40/40 simultaneous terminals awarded blue).
- All T1 rankings and Bradley-Terry magnitudes — invalid.

**Prospective only (never run, no results anywhere):**
- The K-level vs default experiment (`docs/SPEC_WEEK3_RESEARCH.md`) — **the K-level strategy has never been evaluated**, only implemented.
- The V2 vision's secrecy machinery: Leakage Quotient, SCIF tiers, auditor-predictability test (simulate an interceptor against candidate clues before publishing) — designed, unbuilt (`docs/VISION_HERPETARIUM_V2.md:1897,2169,2326`).
- Any post-P4 coach-arena result. The founder's verdict on the pre-P4 loop (2026-05-08, preserved in `research/2026-06-03-extrospection-internal-sourcebook.md:355`): *"I ran literally a thousand games of DeepSeek versus DeepSeek… I don't think they ever built any interesting strategies. It was all just slop."* P4 (April 3) diagnosed why — behaviorally inert genome text, coach confabulation, 4-game sprints of noise — and added task-directive injection + clue-level evidence as the fix. **No arena run after that fix is recorded anywhere.**

So the honest answer to "why didn't K-level thinking, candidate clue comparison, secrecy discipline, strategic memory, and training loops transfer?" is twofold: *(a)* no mechanism existed to move them, and *(b)* four of those five were never validated in Herpetarium either — they are implemented hypotheses awaiting the experiment. The rebuild must make both true at once: a substrate that can carry them, and the experiments that earn them.

## 4. The structural gap (why transfer was impossible, mechanically)

| Layer | Herpetarium | The Table | Shared today |
|---|---|---|---|
| Rules | `server/game.ts` (amber/blue, 3 presets incl. LONGFORM) | `games/cipher_relay/engine.ts` (red/blue, 2/2/8) | **nothing** |
| Role observation | template params built in `headlessRunner.ts` | `viewCipherRelayState` + renderers in `ai/context.ts` | nothing |
| Strategy | 6-module `GenomeModules` + `genomeCompiler.ts` v2.0.0 (content-hashed, role-composed) + 4 named `PromptStrategy`s | none (etiquette baseline + static task text) | nothing |
| Memory | series scratch notes + reflection | none (in-game recap only) | nothing |
| Action schemas | `ANSWER:`-line parsing | strict-JSON envelopes + tolerant parsers | nothing |
| Traces | `ai_call_logs` (+reasoning traces) | `ai_calls` (+allowlisted meta, visible text only) | nothing |
| Eval | metrics, BT, ablations, anchor A/B, sprint evaluator | none | nothing |
| Model identity | `shared/modelRegistry.ts` (registry existed *because* T1's typo'd IDs burned 5,661 calls) | `ai/models.ts` exact-triple catalog | two disjoint registries |

Two apps, zero shared vocabulary. The May 2 founder dictation that birthed The Table (`Extrospection/sources/corpus/voice/2026/2026-05-02-Replit-Human-AI-social-games-platform.md`) carried the *ideas* (K-level, model shortlist, public chatter) but ideas re-implemented from memory under deadline pressure degrade to etiquette prompts. That is what shipped.

## 5. Provider & version reproducibility (DeepSeek case study)

Primary sources, checked 2026-08-01:

- DeepSeek's changelog (api-docs.deepseek.com/updates): **July 31, 2026** — official release of V4-Flash-0731 in public beta behind the *same* direct-API alias `deepseek-v4-flash`; "same architecture and size… only re-post-trained"; agent benchmarks now above V4-Pro-Preview; Responses-API support added. **The direct API offers no dated/pinned model id.** April 24, 2026 entry: `deepseek-v4-pro` and `deepseek-v4-flash` introduced; legacy `deepseek-chat`/`deepseek-reasoner` sunset 3 months out.
- OpenRouter (verified live, 2026-08-01): a **distinct dated model** `deepseek/deepseek-v4-flash-0731` (canonical slug `deepseek/deepseek-v4-flash-20260731`) was added on release day — $0.09/M in, $0.18/M out, $0.018/M cache-read, 1M context; healthy endpoints include DeepInfra at list price (65,536 max output), GMICloud at $0.133/$0.266, and official DeepSeek/Fireworks/Novita at $0.14/$0.28. OpenRouter's *generic* `deepseek/deepseek-v4-flash` route still serves the April preview. So the two failure modes are mirror images: **the direct API mutates a stable name; OpenRouter keeps stale and dated names side by side.** Pinning is possible — but only by dated slug plus pinned upstream.
- Implication: any behavior, eval, or trained artifact keyed to bare `deepseek-v4-flash` before July 31 refers to a **different model** than the same string on the direct API after July 31 — and to yet another (the April preview) on OpenRouter's generic route today. The alias mutated the day before this postmortem — and one day *after* game night ran on saturated providers (`openrouter.ts:119-121`: "BaseTen was the default route during a live-game 429 incident").
- Neither repo is exposed to that exact alias *today* (The Table seats `deepseek/deepseek-v4-pro` via OpenRouter; Herpetarium's registry still lists V3.2-era ids and is stale), but Extrospection's operational logs show `deepseek-v4-flash via deepseek` already used as a *fallback route* in company tooling (`sources/corpus/telegram/2026-04-06--2026-05-13-mccameron-ai-thread.md:973,1205`) — the alias is in the bloodstream.
- Herpetarium's own history is the cautionary tale: T1 burned 3,362 calls on a nonexistent Qwen id and 2,299 on a typo'd DeepSeek prefix, and `scripts/run-30game-arena.ts:27-29` still hardcodes `deepseek/deepseek-chat-v3-0324`, which is not in the registry (cost accounting silently no-ops).

**Substrate consequence:** a strategy artifact must pin `ModelRef`s (provider, model id, route, optional revision tag) and every trace must record both the *requested* and the *provider-resolved* model (OpenRouter already returns `resolvedModel`/`upstreamProvider`; The Table already stores them in `response_meta` — this becomes a first-class trace field). Evals must record the observation date so alias-mutation events (like 0731) partition the data.

## 6. Prioritized plan

**P0 — this week (started today):**
1. **Substrate v0.1** (`shared/substrate/` here, mirrored `lib/decrypto-substrate/` in The Table): strategy-artifact schema (adopts Herpetarium's 6-module genome as the payload), deterministic prompt compiler (verbatim port of `genomeCompiler.ts` semantics), role-legal observation + action schemas, trace envelope with dual model refs, sha-256 content addressing. Golden-fixture parity test proving both repos compile the same artifact to the same bytes. *Done today — see SUBSTRATE_SPEC_V0.md.*
2. **Seat one named artifact in The Table** (Codex): overlay `compileStrategyPrompts()` output onto the Cipher task prompts behind a per-seat `strategyArtifactId`, keeping the visibility chokepoint untouched. Ship one Herpetarium seed genome (e.g. `sensory-anchor@0.1.0`) so a game-night bot is, verifiably, a Herpetarium-trained object.
3. **Chat rework** (Codex, per resolved decisions 1–3): Table channel open to all seated humans in every role including encryptors (scanner-guarded; observers read-only; bot encryptors quiet), a real `team:*` channel carrying bot strategic deliberation, and the per-game `teamChatVisibility: open | private` setting, **default `private`**, host-selectable to `open` before start. The substrate encodes the setting in the observation so bots know what the opponent can hear, and Herpetarium can run the same two conditions as experiments (T1's "private vs public deliberation" proposal, productized).

**P1 — next:**
4. **Return traces to research:** The Table exports substrate trace envelopes per game; Herpetarium ingests them as evaluation data (human-play traces are the most valuable eval signal the lab has never had).
5. **Run the missing experiments in Herpetarium** against the fixed (P4-C) rules with the reliability guards now in `modelHealth.ts`/`modelValidation.ts`: K-level vs advanced vs baseline (the SPEC_WEEK3 design, finally), candidate-clue verification, team-chat visibility A/B (open vs private). The verification stage is measured, not hypothetical: the 2026-08-01 calibration probe (30 clues, $0.003187, 133s, pinned 0731/DeepInfra) recovered all six catastrophic clues blind and formally flagged 5/6 at threshold 0.60 — the miss (FACTORY) surfaced at rank 2, confidence .35 — while flagging only 1 of 24 historical good-clue proxies despite blind-recovering 8 of them. Decided veto tiers (probe-grade, `PROVISIONAL_INVERSION_VETO_POLICY`): hard veto on the confidence/definition branches at 0.60; soft regenerate-once on rank-1 recovery or definition-shaped recovery; **recovery-anywhere is never a veto** (33% proxy hit rate on good clues would over-regenerate toward miscommunication, the dominant real loss mode). The FACTORY class is an accumulated-history failure a single-clue audit cannot see — addressed by a set-level history-aware audit in the protocol roadmap, not by lowering the threshold. Within-call self-checks (the seated Table candidate policy) are a treatment arm, never an audit: a model cannot un-see its keywords, and the pilot already proved instructed self-restraint fails at full reasoning budget. **Minimum experiment before any BotBuild promotion:** (A) `blind-inversion@0.2` calibration — ≥90 proxy-control clues with rank-sensitive statistics, 3 repeat runs, ≥20 founder-adjudicated clues, threshold frozen; (B) seated strict A/B — control prompts vs the exact Table treatment (`intermediate-hops@0.1.0` + candidate policy), both arms pinned 0731/DeepInfra, side-balanced, seeded, ≥12 matches per arm; the passing `EvaluationRecord` requires zero hard-flags on submitted clues and no miscommunication regression. Artifacts that win go to The Table **through the promotion gate**: a typed immutable `EvaluationRecord` binding the exact artifact, model route, compiler version, and candidate policy to a named protocol version, held-out matched tests, a verdict, and an explicit scope — a nonempty pointer list proves nothing. Seeds may be seated before promotion only by explicit `allowUnvalidated` policy, with traces marked unvalidated.
6. **Model pinning + preflight** in both apps from the shared registry slice; alias-mutation log (0731 is entry #1).

**P2:** coach-loop resumption producing versioned artifact lineages; leakage scoring on The Table traces (port `transcriptAnalyzer.computeLeakageScore`); UI decision-focus rework.

## 7. Resolved decisions (2026-08-01)

Resolved from the founder's standing instructions and the audits; none required escalation.

1. **Team-chat visibility:** new games default `private`; the host may choose `open` before start. No `delayed` in v1 (research may study intermediate conditions on its own side later).
2. **Bot deliberation channel:** bot strategic deliberation (decode/intercept reasoning and proposals) goes to the Team channel under that setting. The public Table channel is social/table-talk only. This dissolves most of the fence lattice in `prompts.ts:139-208` rather than patching it an eighth time.
3. **Chat access:** all seated human players can use the Table channel throughout the game in every role, including encryptors (keyword scanner remains the guard). Live observers are read-only. Bot encryptors remain strategically quiet.
4. **Artifact authority:** Herpetarium is the sole artifact minter; The Table is a read-only consumer; Extrospection is the canonical ledger of named artifacts, hashes, and evaluation verdicts.
5. **Experiments proceed now.** The founder explicitly allocated today's spend, and the pinned 0731 lane reprices the work: at $0.09/$0.18 per M via DeepInfra, a 12–16-games/cell experiment costs on the order of cents to a few dollars, not the $40–80 the T1-era frontier-pricing estimate assumed.
6. **DeepSeek routing:** the pinned OpenRouter lane (`deepseek/deepseek-v4-flash-0731` + DeepInfra, `allow_fallbacks:false`, `require_parameters:true`, full slug/served/upstream/attempt/effort persistence) is the workhorse, in use now. The official direct alias runs only as a separately labeled provenance canary once its own credential exists, epoch-stamped, and canary data is **never pooled** with workhorse data.
7. **Clue format:** bot clues are single-word for now (`TABLE_BOT_CLUE_RULES` in the substrate); human players retain ≤120-char phrases. Audited phrases for bots return only behind a calibrated blind-inversion check.

---

*Evidence citations refer to files in the three worktrees at the SHAs above. The Extrospection distillation of this diagnostic lives in `operating-memory/inbox/2026-08-01-fable-decrypto-transfer-diagnostic.md` (same branch family).*
