# Herpetarium Tournament 1: Comprehensive Synthesis

**7-Model Round-Robin Decrypto Tournament, March 2026**
**Synthesized from 6 parallel research investigations**

---

## 1. THE BIG PICTURE: What Did We Actually Learn?

The headline finding is sobering: **the majority of this tournament's data is unreliable.** Of 84 games across 21 unique matchups, only 8 matchups (32 games, 38%) can be fully trusted. The rest are contaminated by API failures that caused models to play with hardcoded fallback clues (`["hint", "clue", "guess"]`) instead of real AI-generated responses. 62.9% of all rounds had at least one fallback clue. Two models -- Qwen 3.6 Plus and DeepSeek V3.2 (wrong ID) -- never actually played a single real game.

What IS real:

- **Kimi K2.5 has genuinely extraordinary interception ability.** Against GPT-5.4 and Opus 4.6 (both with functioning APIs), Kimi intercepted every single code in every single round -- 100% interception rate across 8 matches. It did this by reading opponents' deliberation transcripts and reverse-engineering their codes, which is legitimate play within the game rules. This finding survives all the caveats.

- **Current AI models are catastrophically bad at information security.** The 3v3 deliberation is public (opponents can read it), and models routinely state things like "hammer -> #3" and "zest -> #2" in plain text. Despite explicit prompt warnings that "the opposing team is listening to everything you say," no model demonstrated operational security. This is a genuine insight about AI cognition.

- **Games are too short to test what Decrypto is designed to test.** 91% of games ended in exactly 2 rounds (the minimum). The strategic depth of Decrypto -- multi-round pattern detection, evolving deception, adversarial modeling -- never had a chance to emerge. The game is currently measuring "can the model decode word associations at all" rather than "can the model reason strategically about deception and Theory of Mind."

What is artifact:

- **Kimi's 24-0 record.** Only 12-13 of those wins were against functioning opponents. Eight wins were against lobotomized opponents (Qwen and Gemini with 100% API failure). Kimi also played blue in 100% of its games, and blue won 62.5% overall -- a massive positional confound.

- **Most model rankings.** With only 4 games per matchup, even a 4-0 sweep only gives p=0.125 (two-sided). The 95% confidence interval for a 3-1 result spans [19.4%, 99.4%] -- completely uninformative. The only statistically defensible claim is that Kimi dominated; everything else is directional signal buried in noise.

- **The Bradley-Terry ratings.** Three core assumptions are violated: API failures inject a non-skill factor, temporal API correlation destroys game independence, and unbalanced team positions create confounds.

---

## 2. CRITICAL FINDINGS

### 2.1. The API Failure Cascade

| Model | API Calls | Error Rate | Root Cause |
|---|---|---|---|
| Qwen 3.6 Plus | 3,362 | 100.0% | Model ID does not exist on OpenRouter (404) |
| DeepSeek V3.2 (wrong prefix) | 2,299 | 100.0% | Typo: `deepseek-ai/` instead of `deepseek/` (400) |
| Gemini 3.1 Pro | 1,126 | 87.3% | Google API quota exhausted (429) |
| Claude Opus 4.6 | 392 | 34.7% | Transient Anthropic 529/500 errors (burst pattern) |
| Kimi K2.5 | 339 | 2.4% | Truncated JSON responses |
| Grok 4.20 | 648 | 0.3% | Transient network failures |
| GPT-5.4 | 272 | 0.4% | Temperature parameter rejection |

4,370 of 6,151 total API calls (71.0%) returned errors. 5,661 calls were wasted on non-existent endpoints. The system had no circuit breaker -- it called a nonexistent Qwen endpoint 3,362 times without stopping.

### 2.2. The Blue Team Advantage

Blue won 85 games, amber won 51 -- a 62.5% win rate (p=0.014). This is likely structural, not random. Blue may benefit from move order (seeing amber's clues before acting). But the effect is completely confounded with model assignment: Kimi (strongest) only ever played blue; GPT-5.4 (weakest among functional models) only ever played amber.

### 2.3. Kimi's Dual Nature

Kimi K2.5 is simultaneously the tournament's best interceptor and one of its worst clue-givers:
- **Interception**: 100% against GPT-5.4 and Opus 4.6, 70% against DeepSeek
- **Clue generation**: 50.9% fallback rate (27 of 53 rounds used garbage clues)
- **Token usage**: Averaged 7,185 completion tokens and 3.6 minutes per clue call -- by far the most "thinking" of any model
- **It won despite being unable to communicate with its own team half the time**, entirely on the strength of cracking opponent codes

### 2.4. Deliberation Reveals Real Cognitive Differences

| Model | Avg Deliberation Exchanges | Consensus Rate | Character |
|---|---|---|---|
| GPT-5.4 | 1.1 | 100% | Terse, immediate agreement, many empty messages |
| Opus 4.6 | 1.2 | 100% | Dense single-message analysis, instant convergence |
| Kimi K2.5 | 1.5 | 100% | Strategic, reads opponent transcripts |
| Grok 4.20 | 4.1 | 74% | Genuine multi-turn debate, models each other's styles |
| DeepSeek V3.2 | 6.0 | 100% | Extended deliberation |

Grok stands out: it is the only model that generates genuine back-and-forth team deliberation, with agents modeling each other's reasoning styles, identifying points of convergence, and refining positions. All other models essentially reach consensus in a single exchange.

### 2.5. Clue Sophistication Ranking (When APIs Worked)

1. **Claude Opus** -- multi-round semantic angle switching, explicit future-round planning, opponent information leakage management
2. **DeepSeek V3.2** -- structured 5-step reasoning, creative idiom-based misdirection ("concrete" for JUNGLE via "concrete jungle")
3. **Kimi K2.5** -- taxonomic and cultural references ("peregrine" for FALCON, "tea" for JASMINE)
4. **GPT-5.4** -- sophisticated vocabulary (vulpine, stiletto, trident), extremely efficient, minimal reasoning overhead
5. **Grok 4.20** -- solid direct associations, less deceptive depth
6. **Gemini models** -- adequate but less strategically layered

---

## 3. WHAT'S BROKEN

### Infrastructure (Must Fix)

1. **No circuit breaker.** The system called nonexistent endpoints 5,661 times without stopping. After N consecutive identical errors, it should pause or disable the model.

2. **Gemini rate limit detection is broken.** `isRateLimitError()` checks for `e.status === 429` but Google's SDK returns `RESOURCE_EXHAUSTED` -- which is never caught. All 1,371 Gemini quota errors bypassed the retry system.

3. **Model ID validation is absent.** No pre-flight check confirms model IDs exist before starting a tournament. The DeepSeek typo (`deepseek-ai/` vs `deepseek/`) went undetected for 2,299 calls.

4. **Deliberation has no timeout.** The 3v3 deliberation path calls `generateDeliberationMessage` without `withTimeout`. With Kimi averaging 157 seconds per call, a 10-exchange deliberation could block a slot for 26+ minutes.

5. **The `completedMatches` counter is racy.** The in-memory counter has a classic lost-update race condition under concurrency of 10. It showed 57 when reality was 81 completed + 3 stuck as "running."

6. **Cost estimation is 12-15x too high.** Estimated $446.85 vs actual $36.62. Double-counts team players, assumes 6 rounds per game (actual: 2.13), and miscounts deliberation exchanges.

### Experimental Design (Must Fix)

7. **Team position is not balanced.** Kimi always played blue. Without each model playing both sides equally, positional effects cannot be separated from model ability.

8. **Sample size is inadequate.** At 4 games per matchup, no pairwise result reaches p<0.05 except Kimi's aggregate. Need 30+ games per matchup for 75% win rate significance, 200+ for 60% advantage detection.

9. **Fallback clues produce meaningless games.** When a model's API fails, it plays with `["hint", "clue", "guess"]` -- which the team cannot decode, guaranteeing rapid miscommunication loss. These games should be detected and excluded or replayed.

---

## 4. WHAT'S WORKING

1. **The AI call logging is excellent.** `ai_call_logs` captures prompt, raw response, model, latency, error, parse quality, tokens, cost, and reasoning traces. This made the entire post-mortem possible.

2. **The parsing system is robust.** Among calls that actually received responses (not API errors), 98.3% parsed cleanly. The 3-strategy parser handles diverse model output formats well.

3. **The prompt design is thoughtful.** The advanced strategy's chain-of-thought structure, the deliberation prompts' cognitive diversity assignment (Player A gets semantic focus, Player B gets historical focus), and the information security warnings are well-conceived.

4. **The ablation framework exists.** Flags for `no_history`, `no_scratch_notes`, `no_opponent_history`, `no_chain_of_thought`, and `random_clues` are built in but unused in Tournament 1. This infrastructure is ready for controlled experiments.

5. **The deliberation transcripts are a research goldmine.** 1,132 deliberation records with rich behavioral data that can be analyzed without running new games.

6. **The game loop works.** Despite all the API failures, 84 matches completed (or nearly completed), results were persisted, and the tournament finished. The resume-on-restart logic functioned.

7. **Models genuinely play Decrypto.** Non-fallback team decode rates of 93%+ (GPT-5.4, Opus) far exceed the 4.7% random baseline. The AI models are actually performing semantic reasoning, not guessing randomly.

---

## 5. RESEARCH INSIGHTS

### 5.1. Theory of Mind

The game provides a genuine ToM signal, but only partially. Models demonstrate Level 1 ToM (giving clues their teammates will understand) with 93%+ decode accuracy. But Level 2 ToM (anticipating what opponents will infer from those same clues) is harder to assess because games end before enough history accumulates for adversarial pattern-detection.

The most interesting ToM finding is in Kimi's deliberation transcripts, where it explicitly models opponents' reasoning: "They explicitly state Round 1 used slots [1, 4, 3]... They identify slot 2 as the 'unused keyword from last round.'" This is genuine third-person mental modeling -- understanding what the other team knows and believes.

### 5.2. Information Security Failure

This is perhaps the most publishable finding: **current frontier AI models cannot maintain operational security under communication pressure.** When asked to discuss strategy in a channel their opponents can read, they consistently prioritize clear internal communication over eavesdropper concealment. The prompt explicitly warns them; they ignore it. This reveals a systematic limitation in current models' ability to manage competing communication objectives.

### 5.3. Cognitive Effort vs. Performance

There is an interesting non-monotonic relationship between token generation and performance:
- Grok: 35 completion tokens, 4 seconds per call -- minimal reasoning, solid basic play
- Opus: 2,971 tokens, 1.2 minutes -- moderate reasoning, strong clue sophistication
- GPT-5.4: 4,916 tokens, 2.1 minutes -- clean output, less explicit reasoning
- Kimi: 7,185 tokens, 3.6 minutes -- massive reasoning, best interception, worst clue parsing

More thinking helps interception (Kimi's strength) but can hurt clue generation (Kimi's verbose output fails parsing 50% of the time). The relationship between "thinking harder" and "performing better" is task-dependent and mediated by the output format requirements.

### 5.4. Same-Model Teams Converge Instantly

With 3 copies of the same model, deliberation typically reaches consensus in 1-2 exchanges. This is predictable -- the models share the same reasoning distribution. Grok is the exception (4.1 exchanges, 74% consensus), suggesting it has more internal variability or is genuinely modeling its teammates as separate agents.

---

## 6. RECOMMENDATIONS (Prioritized)

### Tier 1: Before Tournament 2

1. **Implement a circuit breaker.** After 5 consecutive identical errors from a model, pause calls for 10 minutes. After 20, disable the model for the tournament and flag all its matches as invalid.

2. **Add model ID pre-flight validation.** Before a tournament starts, make one test call to each model. If it fails, block the tournament from starting.

3. **Fix Gemini rate limit detection.** Add `"resource_exhausted"` and `"quota"` to `isRateLimitError` string checks. Respect `retryDelay` from error responses.

4. **Balance team positions.** Each matchup must have equal games on each side. For 4 games per pair, do 2 as A and 2 as B.

5. **Increase games per matchup to 12-16.** This gives better statistical power while keeping tournament size manageable (at 21 matchups = 252-336 games).

6. **Add timeout to 3v3 deliberation.** Wrap `generateDeliberationMessage` in `withTimeout`.

7. **Create a MODEL_REGISTRY as single source of truth** for model IDs, display names, costs, provider routing, and known constraints.

### Tier 2: Improve Data Quality

8. **Tag or replay fallback-contaminated matches.** Any match where either team had >25% fallback rate on clue generation should be flagged.

9. **Fix `completedMatches` counter.** Derive from DB query (`SELECT count(*) ... WHERE status='completed'`), not an in-memory counter.

10. **Add retry for transient errors.** 5xx, network errors, and JSON parse failures should get at least 1 retry before falling back.

11. **Fix cost estimation.** Correct the 12x overestimate by fixing double-counting and round-count assumptions.

### Tier 3: Deepen Research Value

12. **Raise the miscommunication loss threshold from 2 to 3 tokens** (or require minimum 4 rounds). Games ending in 2 rounds produce almost no strategic data.

13. **Run the ablation experiments.** The framework already supports `no_history`, `no_chain_of_thought`, `random_clues` -- use them to measure prompt strategy impact.

14. **Mine the existing deliberation transcripts.** NLP analysis for: explicit keyword mentions (information leakage frequency), hedging language (uncertainty signals), misdirection attempts, and disagreement patterns. This requires no new games.

---

## 7. EXCITING IDEAS

### 7.1. Mixed-Model Teams

Instead of 3 copies of the same model, compose heterogeneous teams: Claude as clue-giver with GPT-5.4 and Grok as guessers. This would test cross-model Theory of Mind -- can one model understand how a different model thinks? The miscommunication rate across model boundaries would be a direct measure of inter-model cognitive compatibility.

### 7.2. Private vs. Public Deliberation

Run a tournament where deliberation is private (opponents cannot read it) versus public. Compare interception rates. This directly measures: (a) how much useful information models leak in deliberation, and (b) whether opponents actually exploit leaked information or just ignore it. Kimi's 100% interception rate against GPT and Opus, achieved by reading their transcripts, suggests the information leakage is enormous.

### 7.3. Temperature Sweep Experiment

Run the same matchup at temperatures 0.0, 0.3, 0.7, 1.0. Higher temperature should produce more diverse clues (harder to intercept) but potentially more miscommunication. This probes the creativity-reliability tradeoff in adversarial settings.

### 7.4. Longitudinal Series with Scratch Notes

The platform supports persistent scratch notes between games in a series. Run a 20-game series between two models and track whether their strategic notes become more sophisticated over time. Do models learn to avoid intercepted clue patterns? Do they develop counter-strategies? This tests meta-learning and strategic adaptation.

### 7.5. Information Security Training

Use the existing deliberation transcripts to create a benchmark: given a deliberation transcript, can a model extract the secret code? Then use this as a training signal -- models that produce transcripts that are easy to decode lose points. This could be a novel evaluation for "adversarial communication" capability.

### 7.6. Baseline Calibration

Run matches with the `random_clues` ablation to establish a true random baseline for both decode and interception rates. Currently we cannot say whether a 50% interception rate is good or bad without knowing what random looks like.

### 7.7. Human-AI Teams

If Decrypto is measuring Theory of Mind, the ultimate test is whether AI models can play effectively with human teammates. A human clue-giver with AI guessers (or vice versa) would reveal whether cross-species ToM is possible in a structured game setting.

---

## Summary

Tournament 1 was a valuable proof-of-concept that revealed as much about infrastructure challenges as about AI capabilities. The platform works, the game is fundamentally sound as a cognitive testbed, and the logging is good enough for serious post-mortem analysis. But the data is heavily contaminated by API failures (71% error rate across all calls), confounded by positional imbalance (62.5% blue advantage), and underpowered by small sample sizes (4 games per matchup).

The single clearest finding is that Kimi K2.5 has remarkable interception ability, achieved through detailed analysis of opponent deliberation transcripts -- genuine strategic intelligence. The single most important research insight is that current frontier AI models fail at information security under communication pressure, consistently leaking their reasoning in public channels despite explicit warnings.

Tournament 2 should focus on: fixing the API reliability issues (circuit breaker, model validation, Gemini rate limit detection), balancing team positions, increasing sample sizes to 12-16 games per matchup, and extending minimum game length so the interesting strategic dynamics have room to develop. The existing deliberation transcripts are worth mining for behavioral insights before running new games.
