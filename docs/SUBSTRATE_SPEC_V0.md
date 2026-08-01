# Shared Decrypto Substrate — v0.1 Specification

**Status:** implemented (v0.1.0, 2026-08-01) — `shared/substrate/` here, vendored twin at `the-table-handoff/lib/decrypto-substrate/src/`.
**Motivation:** `docs/DECRYPTO_TRANSFER_DIAGNOSTIC_2026-08-01.md` — no artifact boundary existed between research and product; this is that boundary.
**Validation today:** `npx tsx scripts/substrate-conformance.ts` (29 deterministic checks, runs against either copy), `scripts/substrate-parity.sh` (byte parity), `npm run check` / `pnpm -w run typecheck`.

## 1. What it is

A dependency-free TypeScript vocabulary both applications compile against, defining the six things worth sharing — and nothing else. The apps stay distinct: Herpetarium keeps its engine, arena, coach loop, dashboards; The Table keeps its engine, visibility chokepoint, orchestrator, UI. The substrate is the *contract between* them:

| Piece | File | Contract |
|---|---|---|
| Strategy payload | `genome.ts` | Herpetarium's six-module genome, unchanged, so every existing genome/coach patch/seed is a valid payload |
| Named immutable artifacts | `artifact.ts` | `name@version` + sha-256 content hash; mint/verify/registry-conflict guard; **typed evaluation records** (`EvaluationRecord`: binds exact artifact id+hash, model route, compiler version, and candidate policy to a named protocol version, held-out matched tests, verdict, and scope); **promotion gate** (`evaluateSeating`) consumes records, never pointer lists — unvalidated artifacts seat only by explicit policy and traces must say so |
| Prompt compilation | `compile.ts` | Semantics-preserving port of `genomeCompiler.ts` v2.0.0 (same titles, composition, output text) so trained genomes compile identically in both apps; legacy 32-bit hash retained for DB lineage |
| Role-legal observations | `observation.ts` | The schema *cannot express* opponent keywords; live code is encryptor-only; team-chat visibility (`open | private` — the two product worlds) is part of the observation and `assertRoleLegal` enforces transcript legality against it; `decisionFocus` names the one pending decision (feeds both prompts and UI) |
| Action schemas + rule legality | `actions.ts` | Guess validation (3 distinct 1..4); clue legality (keyword echo/derivative/stem/repeat/length) with both rule regimes explicit: `TABLE_CLUE_RULES` (≤120-char phrases) vs `HERPETARIUM_CLUE_RULES` (single word) |
| Model identity | `modelRef.ts` | Pinned `ModelRef` (provider, canonical slug, pinned upstream, alias epoch); `KNOWN_ALIAS_MUTATIONS` ledger (entry #1: DeepSeek `deepseek-v4-flash` → 0731 on 2026-07-31); the two sanctioned DeepSeek lanes (dated OpenRouter slug + upstream pin as canonical treatment; direct alias as provenance canary) |
| Trace envelope | `trace.ts` | One record per model decision, identical shape in both apps: artifact id+hash, requested AND served model, observation/prompt hashes, outcome, usage. `responseText` is provider-visible text only. Dialogue is research/training material by founder direction: traces reference it (`transcriptRef`) by default and may carry it inline only under an `operator_research` export stamp (who/when), so access control and lineage travel with the data |
| Goldens | `fixtures.ts` | First named artifacts (`sensory-anchor@0.1.0`, `intermediate-hops@0.1.0`, minted verbatim from P4-D seeds, provenance marked unvalidated); the 20610f90 baseline game (six rule-legal definition clues, all intercepted — the bar every promoted artifact must beat); the 2026-08-01 blind-inversion **live probe** (0731-via-DeepInfra auditor reconstructed all six blind at .60–.99 for $0.000155/4.8s — probe, not validated benchmark; provisional flag threshold 0.60); expected hashes |
| Conformance | `conformance.ts` | 36 pure checks; same goldens in both copies ⇒ passing twice proves behavioral parity |

## 2. The loop it enables

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

Promotion gate: an artifact seats *as validated* only when a verifying `EvaluationRecord` with verdict `pass` binds its exact id + content hash (optionally constrained to a required protocol and model route); the seating decision carries the record's protocol and scope as a license. Seeds seat early only via `allowUnvalidated: true` and their traces carry `validated: false`. The first protocol to build is `blind-inversion@0.1`: the live probe proved the mechanism catches the production failure for a sixth of a cent; what remains is calibrating the false-positive rate on known-good clues. The same inversion call is cheap enough to run per clue submission at play time as a candidate-policy stage (generate → invert blind → discard flagged → submit).

## 3. Vendoring rule

Both copies are byte-identical; any change lands in both in the same logical change, hashes regenerated together (`--emit-hashes`), parity script green. Herpetarium is the canonical twin (research owns semantics). No app-specific imports inside the substrate, ever. When drift is detected the change reverts to whichever side matches the goldens.

## 4. Adoption map (who wires what)

- **The Table (Codex):** `runner.ts` builds `DecryptoObservation` from `viewCipherRelayState` and asserts role-legality before prompting; `prompts.ts` overlays compiled artifact `systemPrompt`/`taskDirectives` for seats with a `strategyArtifactId`; `ai_calls` writes gain a `TraceEnvelope` projection; per-game `teamChatVisibility` setting backs the new team channel. The existing visibility chokepoint stays authoritative — the substrate adds a second assertion, it does not replace projection.
- **Herpetarium (either):** `coachLoop`/`arena` mint artifacts at sprint commit; `headlessRunner` accepts a `StrategyArtifact` in place of raw overrides; evaluators consume TraceEnvelopes (from arena or The Table exports) instead of bespoke rows.
- **Extrospection:** records the artifact ledger (name@version + hash + eval verdicts) as canonical knowledge.

## 5. Non-goals of v0.1

Observation *rendering* to prompt text (each app renders its own until we compare formats under eval); the calibrated blind-inversion evaluator itself (the probe proves mechanism and cost; the versioned protocol with a measured false-positive rate is the next Herpetarium deliverable — its acceptance test is flagging all six baseline clues); engine unification (deliberately never — rules constants stay per-app with the divergences named in `actions.ts`); network/registry service (artifacts and evaluation records travel as JSON in-repo for now).
