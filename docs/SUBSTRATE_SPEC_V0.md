# Shared Decrypto Substrate — v0.1 Specification

**Status:** shared contracts implemented (v0.1.0, 2026-08-01); runtime adoption is partial — `shared/substrate/` here, vendored twin at `the-table-handoff/lib/decrypto-substrate/src/`.
**Motivation:** `docs/DECRYPTO_TRANSFER_DIAGNOSTIC_2026-08-01.md` — no artifact boundary existed between research and product; this is that boundary.
**Validation today:** `npx tsx scripts/substrate-conformance.ts` (41 deterministic checks, runs against either copy), `scripts/substrate-parity.sh` (byte parity), `npm run check` / `pnpm -w run typecheck`.

## 1. What it is

A dependency-free TypeScript vocabulary both applications compile against, defining the six things worth sharing — and nothing else. The apps stay distinct: Herpetarium keeps its engine, arena, coach loop, dashboards; The Table keeps its engine, visibility chokepoint, orchestrator, UI. The substrate is the *contract between* them:

| Piece | File | Contract |
|---|---|---|
| Strategy payload | `genome.ts` | Herpetarium's six-module genome, unchanged, so every existing genome/coach patch/seed is a valid payload |
| Named immutable artifacts | `artifact.ts` | `name@version` + sha-256 content hash; mint/verify/registry-conflict guard; **typed evaluation records** (`EvaluationRecord`: binds exact artifact id+hash, model route, compiler version, and candidate policy to a named protocol version, held-out matched tests, verdict, and scope); **promotion gate** (`evaluateSeating`) consumes records, never pointer lists — unvalidated artifacts seat only by explicit policy and traces must say so |
| Prompt compilation | `compile.ts` | Semantics-preserving port of `genomeCompiler.ts` v2.0.0 (same titles, composition, output text) so trained genomes compile identically in both apps; legacy 32-bit hash retained for DB lineage |
| Exact Table candidate treatment | `candidatePolicy.ts` | Immutable id, exact actor-call policy text, and content hash for `within-call-blind-inversion-selection@0.1.0`; pure composition helper fixes the authority order as compiled cluegiver directives → candidate policy → app-owned action/output contract, so Herpetarium can run the exact Table arm rather than a paraphrase |
| Blind-inversion decision policy | `inversion.ts` | Dependency-free target normalization/recovery and typed `hard_veto | soft_regenerate_once | pass` evaluation implementing `PROVISIONAL_INVERSION_VETO_POLICY`; provider calls stay app-owned, while both apps execute identical post-audit semantics |
| Role-legal observations | `observation.ts` | Target contract: the schema *cannot express* opponent keywords; live code is encryptor-only; team-chat visibility (`open | private` — the two product worlds) is part of the observation and `assertRoleLegal` enforces transcript legality against it; `decisionFocus` names the one pending decision. Runtime construction/assertion is not wired yet. |
| Action schemas + rule legality | `actions.ts` | Guess validation (3 distinct 1..4); clue legality (keyword echo/derivative/stem/repeat/length) with the human Table phrase regime and bot single-word regimes explicit: `TABLE_CLUE_RULES`, `TABLE_BOT_CLUE_RULES`, `HERPETARIUM_CLUE_RULES` |
| Model identity | `modelRef.ts` | Pinned `ModelRef` (provider, canonical slug, pinned upstream, alias epoch); `KNOWN_ALIAS_MUTATIONS` ledger (entry #1: DeepSeek `deepseek-v4-flash` → 0731 on 2026-07-31); the two sanctioned DeepSeek lanes (dated OpenRouter slug + upstream pin as canonical treatment; direct alias as provenance canary) |
| Trace envelope | `trace.ts` | Target contract for one record per model decision: artifact id+hash, requested AND served model, observation/prompt hashes, outcome, usage. `responseText` is provider-visible text only. Dialogue may be referenced by `transcriptRef` and carried inline only under an `operator_research` export stamp. Runtime projection/export/ingestion is not wired yet, and actor-vs-system-auditor plus artifact-validation semantics must be frozen first. |
| Goldens | `fixtures.ts` | First named artifacts (`sensory-anchor@0.1.0`, `intermediate-hops@0.1.0`, minted verbatim from P4-D seeds, provenance marked unvalidated); the 20610f90 baseline game (six rule-legal definition clues, all intercepted — the bar every promoted artifact must beat); the 2026-08-01 blind-inversion **live probe** (all six recovered blind at .60–.99, $0.000155/4.8s) and **calibration probe** (30 clues: 5/6 baseline flagged at 0.60 with FACTORY the known miss at rank 2/conf .35; 24 proxy controls: 1 flagged, 8 recovered; $0.003187/133s — both explicitly probes, not validated benchmarks); the **provisional veto policy** (hard veto = confidence or definition branch at 0.60; soft regenerate-once = rank-1 recovery or definition-shaped recovery; recovery-anywhere is never a veto — 8/24 good clues were blind-recoverable); expected hashes |
| Conformance | `conformance.ts` | 41 pure checks, including exact candidate-treatment hash/composition and inversion-policy vectors; same goldens in both copies ⇒ passing twice proves behavioral parity |

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

Audit mechanism status after the 2026-08-01 calibration probe: the blind external auditor catches the catastrophic class cheaply (6/6 recovered, 5/6 flagged at 0.60; ~$0.003 per 30 clues) — but read that as **in-sample on the six clues that motivated the instrument**, with the 0.60 threshold fit to those same six points, not as a demonstrated detection rate. A later probe of 12 ordinary clues hard-flagged only 2 and recovered only 3 (`BLIND_INVERSION_LIVE_PROBE_2026_08_01`), because target comparison in `inversion.ts` is **lexical**: a semantic leak such as `sword`→WARRIOR is undetectable at any threshold. This is a catastrophic-clue guardrail, not a clue-opacity measure. The veto tiers are decided provisionally (`PROVISIONAL_INVERSION_VETO_POLICY`). Two distinct roles must not be conflated: the exact **within-call candidate policy** (`candidatePolicy.ts`, content-hashed) makes the model self-check while it can still see its keywords and is a *treatment to measure*; only the **role-isolated external auditor** — whose blindness is structural, not instructed — can veto or license. Provider execution remains app-owned, but `inversion.ts` now gives both apps the same target-recovery and hard/soft/pass decision function after an audit. The known miss (FACTORY, rank 2, conf .35) is the accumulated-history class; a single-clue audit cannot see it, so the protocol roadmap adds a history-aware set-level audit rather than lowering the threshold. Minimum path to the first BotBuild promotion: (A) `blind-inversion@0.2` calibration — ≥90 proxy-control clues with rank-sensitive stats, 3 repeat runs, ≥20 human-adjudicated clues, threshold frozen; then (B) a seated strict A/B in Herpetarium (control prompts vs the exact Table treatment: `intermediate-hops@0.1.0` + candidate policy, both arms pinned 0731/DeepInfra, side-balanced, seeded, ≥12 matches/arm) whose passing `EvaluationRecord` requires **ceiling-free behavioral co-primaries** (interception rate and teammate-decode rate) plus an offline semantic-equivalence judge, and no miscommunication regression against control. Hard-flag count is a **secondary guardrail statistic only** — see `INVERSION_PROMOTION_PREREQUISITES`. An earlier draft of this section made "zero hard-flags" the passing bar; that is withdrawn, because a treatment can drive hard-flags to zero while leaving every semantic leak intact. Run both arms with the `no_scratch_notes` ablation: Herpetarium injects cross-game scratch notes that The Table has no equivalent of, so leaving them on confounds the comparison. No power analysis has been done for `≥12 matches/arm`; treat that number as a budget placeholder, not a powered design.

## 3. Vendoring rule

Both copies are byte-identical; any change lands in both in the same logical change, hashes regenerated together (`--emit-hashes`), parity script green. Herpetarium is the canonical twin (research owns semantics). No app-specific imports inside the substrate, ever. When drift is detected the change reverts to whichever side matches the goldens.

## 4. Adoption map (who wires what)

- **The Table — adopted now:** compiled strategy and candidate policy, bot clue legality, model-route evidence, role-isolated auditor, and `open | private` Table/Team chat. Native `ai_calls` preserve the evidence. **Next:** construct/assert/hash `DecryptoObservation`, freeze actor-vs-system-auditor trace semantics, project native calls into a separate operator-only TraceEnvelope export, and stamp authoritative applied outcomes.
- **Herpetarium — adopted now:** exact compiled prompt overrides, candidate-policy treatment arms, pinned model route, strict provider-attempt truth, and match-level strategy lineage. **Next:** per-call decision/team/actor/outcome identity, runtime observation assertion, TraceEnvelope emission, and ingestion of Table research exports. No current run is eligible for an `EvaluationRecord` on the strength of the trace contract alone.
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

## 5. Non-goals of v0.1

Observation *rendering* to prompt text (each app renders its own until we compare formats under eval); the provider-backed auditor and a frozen calibrated `blind-inversion@0.2` protocol (the shared pure evaluator currently executes the explicitly probe-grade policy; repeat stability, human adjudication, and measured false-positive rates remain the next Herpetarium deliverable); engine unification (deliberately never — rules constants stay per-app with the divergences named in `actions.ts`); network/registry service (artifacts and evaluation records travel as JSON in-repo for now).
