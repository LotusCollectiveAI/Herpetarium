# Shared Decrypto Substrate — v0.5 Specification

**Status:** shared contracts implemented (v0.5.0, 2026-08-01); runtime adoption is partial — `shared/substrate/` here, vendored twin at `the-table-handoff/lib/decrypto-substrate/src/`.
**Motivation:** `docs/DECRYPTO_TRANSFER_DIAGNOSTIC_2026-08-01.md` — no artifact boundary existed between research and product; this is that boundary.
**Validation today:** `npx tsx scripts/substrate-conformance.ts` (61 deterministic checks, runs against either copy), `scripts/substrate-parity.sh` (byte parity), `npm run check` / `pnpm -w run typecheck`, and `npm run test:cross-round-probe`.

## 1. What it is

A dependency-free TypeScript vocabulary both applications compile against, defining the six things worth sharing — and nothing else. The apps stay distinct: Herpetarium keeps its engine, arena, coach loop, dashboards; The Table keeps its engine, visibility chokepoint, orchestrator, UI. The substrate is the *contract between* them:

| Piece | File | Contract |
|---|---|---|
| Strategy payload | `genome.ts` | Herpetarium's six-module genome, unchanged, so every existing genome/coach patch/seed is a valid payload |
| Named immutable artifacts | `artifact.ts` | `name@version` + sha-256 content hash; mint/verify/registry-conflict guard; **typed evaluation records** (`EvaluationRecord`: binds exact artifact id+hash, model route, compiler version, and candidate policy to a named protocol version, held-out matched tests, verdict, and scope); **promotion gate** (`evaluateSeating`) consumes records, never pointer lists — unvalidated artifacts seat only by explicit policy and traces must say so |
| Prompt compilation | `compile.ts` | Semantics-preserving port of `genomeCompiler.ts` v2.0.0 (same titles, composition, output text) so trained genomes compile identically in both apps; legacy 32-bit hash retained for DB lineage |
| Exact Table candidate treatment | `candidatePolicy.ts` | Immutable id, exact actor-call policy text, and content hash for `within-call-blind-inversion-selection@0.3.0`; pure composition helper fixes the authority order as compiled cluegiver directives → candidate policy → app-owned action/output contract, so Herpetarium can run the exact Table arm rather than a paraphrase |
| Blind-inversion decision policy | `inversion.ts` | Dependency-free target normalization/recovery and typed `hard_veto | soft_regenerate_once | pass` evaluation implementing `PROVISIONAL_INVERSION_VETO_POLICY`; provider calls stay app-owned, while both apps execute identical post-audit semantics |
| Cross-round column audit | `crossRoundInversion.ts` | One content-hashed, fixed-three-clue instrument shared by both apps: public resolved clue-number ledger construction, exact prompt/task text, tolerant-but-fail-closed reply parser, unique-top/tie-aware column recovery, and typed veto semantics. The Table gates live encryptor submissions; Herpetarium's `probe:cross-round` command evaluates completed durable rounds read-only without changing tournament treatment. |
| Role-legal observations | `observation.ts` | Target contract: the schema *cannot express* opponent keywords; live code is encryptor-only; team-chat visibility (`open | private` — the two product worlds) is part of the observation and `assertRoleLegal` enforces transcript legality against it; `decisionFocus` names the one pending decision. Runtime construction/assertion is not wired yet. |
| Action schemas + rule legality | `actions.ts` | Guess validation (3 distinct 1..4); clue legality (keyword echo/derivative/stem/repeat/length) with the human Table phrase regime and bot single-word regimes explicit: `TABLE_CLUE_RULES`, `TABLE_BOT_CLUE_RULES`, `HERPETARIUM_CLUE_RULES` |
| Model identity | `modelRef.ts` | Pinned `ModelRef` (provider, canonical slug, pinned upstream, alias epoch); `KNOWN_ALIAS_MUTATIONS` ledger (entry #1: DeepSeek `deepseek-v4-flash` → 0731 on 2026-07-31); the two sanctioned DeepSeek lanes (dated OpenRouter slug + upstream pin as canonical treatment; direct alias as provenance canary) |
| Trace envelope | `trace.ts` | Target contract for one record per model decision: artifact id+hash, requested AND served model, observation/prompt hashes, outcome, usage. `responseText` is provider-visible text only. Dialogue may be referenced by `transcriptRef` and carried inline only under an `operator_research` export stamp. Runtime projection/export/ingestion is not wired yet, and actor-vs-system-auditor plus artifact-validation semantics must be frozen first. |
| Goldens | `fixtures.ts` | First named artifacts (`sensory-anchor@0.1.0`, `intermediate-hops@0.1.0`, minted verbatim from P4-D seeds, provenance marked unvalidated); the 20610f90 baseline game (six rule-legal definition clues, all intercepted — the bar every promoted artifact must beat); the 2026-08-01 blind-inversion **live probe** (all six recovered blind at .60–.99, $0.000155/4.8s) and **calibration probe** (30 clues: 5/6 baseline flagged at 0.60 with FACTORY the known miss at rank 2/conf .35; 24 proxy controls: 1 flagged, 8 recovered; $0.003187/133s — both explicitly probes, not validated benchmarks); the **provisional veto policy** (hard veto = confidence or definition branch at 0.60; soft regenerate-once = rank-1 recovery or definition-shaped recovery; recovery-anywhere is never a veto — 8/24 good clues were blind-recoverable); expected hashes |
| Conformance | `conformance.ts` | 61 pure checks, including exact candidate-treatment hash/composition, authoritative event provenance for both human interceptions, the runtime-enforcement interlock, both Red and Blue production leak regressions, shared parser acceptance, malformed-input rejection, tie handling, and both inversion-policy vectors; same goldens in both copies ⇒ passing twice proves behavioral parity |

## 2. The loop it is designed to enable

```
Herpetarium                      substrate                      The Table
───────────                      ─────────                      ─────────
train/evolve genome ──► mint name@version artifact ──► seat exact artifact
        ▲                    (content-hashed,                (compile per role,
        │                     provenance, pinned              overlay on task
   evaluate traces            models, eval refs)              prompts)
        │                                                        │
        └────────────── TraceEnvelope per decision ◄─────────────┘
                    (artifact id+hash, model requested+served,
                     observation hash, outcome, usage)
```

This diagram is the target loop, not current runtime status. Today the shared
artifact/prompt/model-route/evaluation contracts are wired and locally
auditable, while standardized observation enforcement, TraceEnvelope
emission/export, and Herpetarium ingestion remain the next slice.

Promotion gate: an artifact seats *as validated* only when a verifying `EvaluationRecord` with verdict `pass` binds its exact id + content hash (optionally constrained to a required protocol and model route); the seating decision carries the record's protocol and scope as a license. Seeds seat early only via `allowUnvalidated: true`; current native Table call metadata marks that seating unvalidated. The TraceEnvelope contract itself does not yet carry validation status, so that field or an evaluation-record reference must be added before runtime trace adoption.

Audit mechanism status is deliberately split by failure class. The original `blind-inversion@0.1-probe` is a lexical catastrophic-clue guardrail, not a clue-opacity measure: its 2026-08-01 in-sample calibration recovered 6/6 motivating clues and flagged 5/6 at the fitted 0.60 threshold, while a later 12-clue probe recovered only 3 and hard-flagged 2. A semantic leak such as `sword` → WARRIOR is invisible to its whole-token comparison at every threshold. The within-call candidate policy is a treatment to measure while the actor can still see its keywords; only a structurally role-isolated external auditor can supply independent evidence.

The accumulated-history failure is grounded in operator production game `884e2eac-0088-4cbc-8f23-54cd67d1712d`. Outcome-only authoritative events bind the Red AI clue triple at sequence 31 (`3497a08f…`), the Blue AI triple at sequence 35 (`5665f360…`), the Red-human interception of Blue at sequence 40 (`7c6e9772…`), the Blue-human interception of Red at sequence 41 (`b4f8fb5f…`), and round resolution at sequence 44 (`6e83de43…`). Both round-2 bot clue triples were successfully intercepted by humans. Human chat was not inspected, so the human bridge paths remain unknown; `Aggregate`~`blast`, `Bengal`~`orange`, `Firetruck`~`ascent`, `crown`~`turret`, and `telescope`~`nebula` are analyst explanations of plausible public association routes, not observed human reasoning.

`cross-round-column-inversion@0.1-probe` and `@0.2-probe` both scored the Red incident `pass` on the dated DeepSeek route; their preserved traces show a legal but wrong 4,3,1 solve, not the duplicate-slot failure an earlier draft claimed. `cross-round-referent-evidence@0.3-probe` therefore elicits a per-clue × per-slot evidence grid plus a support-tiered credible set. Its hashed policy remains immutable. `CROSS_ROUND_REFERENT_EVIDENCE_POLICY_ERRATA_2026_08_02` corrects the frozen field names without changing their hash: 4-of-24 is code-match breadth for one fixed sparse reply, not a false-positive floor, and kettle/meridian/sable is a post-incident hand-authored shaped input whose pass establishes neither safety nor non-leakage.

The 2026-08-02 v0.3 run failed. Red hard-vetoed, Blue passed despite the observed human interception, and the shaped input passed. n = 1 per case cannot estimate repeat stability in either direction. The committed report preserves parsed evidence, route, evaluation, usage, and timestamps, but not exact raw assistant text or hidden reasoning; its runner `gitCommitSha` is null and imported evaluator/parser source hashes are absent, so exact provider-run reproducibility is not established.

An exhaustive replay over all 1,944 legal settings of the published hard-tier threshold fields hard-vetoes the fixed Blue reply zero times because intended [4,1,3] is absent from the credible set. This rules out a threshold-only repair under the fixed decision logic. It does not uniquely prove an elicitation defect: eliciting a broader credible set and redesigning the fixed intended-membership requirement are distinct untested alternatives. `scripts/test-cross-round-v03-postmortem.ts` deep-binds the manually replayed grids, credible sets, inputs, outcomes, usage, and exact report bytes to the committed parsed-evidence artifact.

The current cross-round auditor is research-only. `CROSS_ROUND_RUNTIME_ENFORCEMENT_RELEASED` is derived from the failed boundary and is explicitly `false`; the multi-minute audit is not a synchronous human-game gate. Promotion still requires matched behavioral evaluation with teammate-decode and interception outcomes under a no-opponent-transcript condition, semantic adjudication, and no miscommunication regression. Auditor disposition remains a secondary guardrail statistic, never a primary BotBuild outcome.

## 3. Vendoring rule

Both copies are byte-identical; any change lands in both in the same logical change, hashes regenerated together (`--emit-hashes`), parity script green. Herpetarium is the canonical twin (research owns semantics). No app-specific imports inside the substrate, ever. When drift is detected the change reverts to whichever side matches the goldens.

## 4. Adoption map (who wires what)

- **The Table — adopted now:** compiled strategy and candidate policy, bot clue legality, model-route evidence, the role-isolated auditor execution adapter, and `open | private` Table/Team chat. Cross-round runtime enforcement is interlocked off because the release boundary failed; native `ai_calls` preserve evidence whenever the research-only path is explicitly exercised. **Next:** construct/assert/hash `DecryptoObservation`, freeze actor-vs-system-auditor trace semantics, project native calls into a separate operator-only TraceEnvelope export, and stamp authoritative applied outcomes.
- **Herpetarium — adopted now:** exact compiled prompt overrides, candidate-policy treatment arms, pinned model route, strict provider-attempt truth, match-level strategy lineage, and an offline `probe:cross-round` adapter that reads one explicit team from one completed durable match inside a read-only transaction, excludes unresolved/mixed-team rows, asserts exact 0731/DeepInfra/wire-max route evidence, and emits a content-hashed JSON report. It does not enter the live treatment. **Next:** per-call decision/team/actor/outcome identity, runtime observation assertion, TraceEnvelope emission, and ingestion of Table research exports. No current run is eligible for an `EvaluationRecord` on the strength of the trace contract alone.
- **Extrospection:** records the artifact ledger (name@version + hash + eval verdicts) as canonical knowledge.

## 4b. Three validity blockers before any reported evaluation result

Found in the 2026-08-01 release review. None blocks family play; each would
corrupt a promotion inference, so clear them before the first result is
reported — not before shipping.

1. **Two instruments, one protocol id.** `blind-inversion@0.1-probe` stamps
   both `server/blindInversion.ts` (variable batch — 30 clues in one call for
   the calibration run — concepts capped at 3, model-supplied `index`
   binding) and The Table's `ai/inversion-gate.ts` (fixed 3-clue call,
   concepts 1–5, server-position binding, a different system prompt that is
   neither shared nor content-hashed). The frozen 0.60 threshold was fit on
   the first and is enforced by the second. Do not pool their flag rates.
   Fix: distinct id for the runtime instrument, or re-calibrate under its
   prompt and batch size; record an auditor-prompt hash and batch size in
   call metadata.
2. **Interception rate is not ceiling-free here.**
   `INVERSION_PROMOTION_PREREQUISITES` names it a ceiling-free co-primary,
   but `server/headlessRunner.ts` feeds the opposing team's full own-decode
   deliberation transcript into intercept deliberation whenever
   `teamSize === 3` (the round-robin default), under an explicit "intercepted
   enemy communications" directive. That measures transcript-reading, not
   clue opacity. Admit it only at `teamSize: 2` or behind a new
   `no_opponent_transcript` ablation, required alongside `no_scratch_notes`.
3. **The candidate-policy A/B has no matching control at The Table.** Only
   the policy text and its position in the authority order are shared; the
   third component differs entirely (Table: a ~45-line JSON-envelope action
   contract that *already* instructs multi-candidate generation, teammate and
   blind-opponent simulation, cross-keyword rejection, and history
   inspection; Herpetarium: a one-line `ANSWER:` format directive). A
   "policy on vs off" effect here is an **upper bound** on the Table's
   marginal effect and cannot be transferred as-is to license seating.

## 4c. The next cross-round experiment, pre-registered (decided 2026-08-02)

After the v0.3 live failure the tempting move is to redesign the auditor
prompt. **Do not, yet.** `@0.1-probe`, `@0.2-probe` and `@0.3-probe` were each
designed against a single live failure of its predecessor, and each failed in
turn. A fourth redesign from one draw repeats that pattern and destroys the
baseline by moving `CROSS_ROUND_AUDITOR_PROMPT_HASH`. The v0.3 boundary ran at
`repeatCount: 1`; n = 1 cannot estimate repeat stability in either direction.

**Run this first, unchanged protocol / policy / prompt hashes.** k = 20 fixed
draws for each of the three existing cases (Red, Blue, and the legacy-named
post-incident shaped input) = exactly 60 calls at concurrency 5. No failed call
is retried, replaced, or silently dropped; an incomplete cell suppresses the
pre-registered classification. The shaped input is reported as exactly what it
is: not held out, not a safety or non-leakage claim, and not a calibration
distribution.

The two co-primary descriptive measurements are the human-ground-truthed
whole-code outcomes:

1. Red intended code `[1,3,4]` appears in `codeHypotheses` at
   plausible-or-strong support, count out of 20.
2. Blue intended code `[4,1,3]` appears in `codeHypotheses` at
   plausible-or-strong support, count out of 20.

Each uses the pre-registered descriptive categories 0–4 = systematic-omission
candidate, 5–13 = indeterminate, and 14–20 = high repeat support. Those whole
codes, and only those whole codes, are grounded by the authoritative observed
human interceptions. Blue `turret -> slot 1` actionable-edge presence is a
mechanistic secondary diagnostic: it tests one analyst-hypothesized failure
path, not an observed human rationale. Every other history-bearing cell,
per-draw disposition, credible-set size and support tier, latency,
reasoning-token count, and the shaped input's off-intended strong cells are
descriptive secondary outputs. Counts are not pooled across cells or cases, no
iid Bernoulli model or confidence interval is claimed, and this measurement is
not a release boundary.

**No cross-draw union or gameplay gate is permitted.** Cell-wise max,
credible-set union, majority vote, “any draw vetoes,” or a hybrid composition
would each create a new instrument with different semantics. The current 60
calls measure the unchanged single-draw auditor only. A future aggregation
policy requires its own identity, pre-registration, held-out and
human-adjudicated calibration, ledger-depth analysis, and product-latency
design. k is fixed at 20 for measurement; it is not tuned until Blue flips or
until the post-incident shaped input happens to satisfy a stopping rule.

**Two prompt self-inconsistencies are already documented as candidate `@0.4`
repairs** in `crossRoundInversion.ts` — a `strong` tier defined as a
single-action decision predicate inside a grid declared independent, and an
elimination affordance present in the system text but dropped from the rendered
task even though Blue's intended code requires a history-free slot. Each
predicts one of the two failures actually observed. Neither is established as
causal, which is the whole reason to measure before rewriting.

**Deployability, recorded because it bounds the design space.** The v0.3 audit
ran 337–569 s per call. Even at k = 1 this is not a synchronous runtime gate in
a game seated with humans; at k = 5 it is 28–47 minutes per clue. The
cross-round auditor is an offline research instrument unless it is redesigned
around an async or optimistic-veto path. **Actor-side prevention is therefore
the only layer that can run in the product loop**, and it is currently the less
instrumented of the two: `within-call-blind-inversion-selection@0.3.0` has never
been live-tested at all, because the incident that motivated it predates it. Note
also that no deterministic, provider-free lexical check helps here — exact
reuse, stemming, substring and same-lemma tests all score **0 of 5** on the
observed leak edges (`Aggregate`~`blast`, `Bengal`~`orange`,
`Firetruck`~`ascent`, `crown`~`turret`, `telescope`~`nebula`), because the leak
is a two-hop route through a latent word that neither public clue contains. Ship
an exact-reuse invariant if you like, but report it as recall-0 on this corpus
rather than as a guardrail.

## 5. Non-goals of v0.1

Observation *rendering* to prompt text (each app renders its own until we compare formats under eval); the provider-backed auditor and a frozen calibrated `blind-inversion@0.2` protocol (the shared pure evaluator currently executes the explicitly probe-grade policy; repeat stability, human adjudication, and measured population error rates on defensible held-out cases remain the next Herpetarium deliverable); engine unification (deliberately never — rules constants stay per-app with the divergences named in `actions.ts`); network/registry service (artifacts and evaluation records travel as JSON in-repo for now).
