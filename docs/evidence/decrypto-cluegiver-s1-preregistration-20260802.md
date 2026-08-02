# Decrypto S1 paired cluegiver mechanism canary — provider-free preregistration

**Status:** deterministic descriptor-only dry run. It executes zero provider
calls, has no dispatcher, records no behavioral outcomes, licenses no spend,
and supports no strategic-strength, efficacy, seating, or promotion claim.

**Base:** Herpetarium
`b23ea40210dddbfea73b57de5f5820857f63293c`.

**Blocking integration gate:** before any provider dispatch, this branch must
rebase onto or cherry-pick reviewed shared cluegiver-contract integration
commit `86207c5` (or a reviewed descendant). The experiment-local exact-shape
descriptors must then be replaced with actual shared
`mintCluegiverObservation` / `verifyCluegiverObservation` and
`mintCluegiverBotBuildManifest` / `verifyCluegiverBotBuildManifest` imports.
Both registry-aware role/build gates must be load-bearing before compilation:

- `validateCluegiverDecisionContext(observation, cluegiverBuild)`;
- `validateGuessDecisionContext(observation, assessorBuild)`.

The reviewed cluegiver source bytes are pinned now:

- `shared/substrate/cluegiverObservation.ts`:
  `d4ff0ba4f6205c6740236b66643ce3e9a58dbd2720094cbd36d07bd1f589a106`;
- `shared/substrate/cluegiverBotBuild.ts`:
  `fabc173bb5d2533ccbbe90af63dc94b163dff1085691f31f191ca0f597dc5c7f`.

## Exact paired treatment

The future mechanism canary compares exactly two arms.

- **C0 — implicit old instruction.** The exact Table `cipher_encrypt`
  instruction at commit `7dde6c2f0deeb3c774a38e08e74c9d5c5fe281d0`, recombined with the same later
  public-column ledger and authoritative action contract used in C1. It is
  truthfully labeled `not_claimed_synthetic_recombination`; it is not claimed
  as a replay of one historical production prompt.
- **C1 — explicit four-check policy.** The exact same C0 carrier plus the
  canonical shared
  `CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT`
  (`within-call-blind-inversion-selection@0.3.0`) inserted through the real
  shared composer in its operative-directives → candidate-policy →
  authoritative-action-contract order.

The exact old instruction already requires multiple candidate generation,
teammate simulation, blind-opponent simulation, and inspection of resolved
history. C1−C0 therefore describes the incremental **full explicit four-check
package** over that implicit instruction. It neither estimates generic
candidate generation nor isolates history check item 4.

**C2 is reserved and has zero jobs.** A future exact no-history ablation may
define C2; only a future C1−C2 comparison may be described as isolating item 4.
The b41 integrated `cipher_encrypt` instruction is not used as either S1 arm.

The C0 authority is mechanical rather than metadata-only. The repository
checks in exact Git source-range bytes from Table lines 248–293, mechanically
extracts the 44 string literals, and fails closed if the bytes or extraction
drift:

- range bytes: 3,071;
- range SHA-256:
  `6c0b3c37489e6b428b983b3bd18987cd1b915d77bc9001db1a37bfdcf0a5c645`;
- extracted instruction SHA-256:
  `045090814d7e073b525b9293fdcf752b5acad4b5e8e95d4710f26682578e5794`;
- original full source-file SHA-256:
  `5a3ea639638e91f12e652645fff253477203b622d370eca2a59d88975fdd099d`.

For every position, removing exactly the canonical candidate block from C1's
full provider-visible user prompt produces C0 byte-for-byte. System prompts,
decision IDs, logical action keys, position state, ledger, dialogue, and action
contract are otherwise identical.

## Frozen role-complete positions

The v0.2 fixture has four complete two-sided round-two positions. Every
position specifies focal team and role-legal `agent_b` cluegiver, own keywords
and live code, both resolved round-one clue triples/codes/own decodes/null
intercepts, derived tokens, fixed current opponent clues/code, chat setting,
and an empty transcript.

One position is a production-state anchor:

- focal Red keywords: `QUARRY / RAVEN / TIGER / LADDER`;
- Red round one: `Aggregate / Bengal / Firetruck`, code `[1,3,4]`;
- Red focal round two: code `[1,3,4]`;
- Blue round one: `pillow / crown / telescope`, code `[2,1,3]`;
- fixed Blue round two: `treetop / turret / nebula`, code `[4,1,3]`.

Those public state fields and the game ID are exact, content-addressed
projections of
`CROSS_ROUND_COLUMN_LEAK_2026_08_01`,
`CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01`, and
`CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01`. The fixture
separately labels:

- exact shared-fixture fields;
- round-one outcomes/tokens reconstructed from outcome evidence;
- synthetic harness fields, including every actor ID and seat ID.

It does not imply that synthetic IDs came from production. Chat was not
inspected, the transcript is empty, and no human reasoning path is invented.
The other three positions are wholly experimenter-authored, two-sided,
role-legal states fixed without target-model sampling. Focal sides are balanced
two Red / two Blue.

This is a four-position **mechanism** canary, not an efficacy sample. Digit,
slot, and history-stratum balance is materially incomplete:

- focal code digit counts are `1:2`, `2:3`, `3:3`, `4:4`;
- slot 1 has 2 history-bearing / 2 history-free targets;
- slot 2 has 3 history-bearing / 1 history-free target;
- slot 3 has 4 history-bearing / 0 history-free targets;
- overall there are 9 history-bearing / 3 history-free targets.

Those imbalances preclude efficacy inference even before considering sample
size.

## Preregistered parent/child DAG

There are eight matched cells: `4 positions × 2 arms`. Each cell contains:

1. one cluegiver parent producing one three-clue action;
2. three blinded teammate-decoder children sharing that exact clue triple;
3. three blinded opponent-interceptor children sharing that exact clue triple.

That is seven jobs per cell and 56 planned calls total:

```text
8 cluegiver parents + 24 teammate decoders + 24 opponent interceptors = 56
```

There are no cluegiver replications. The three assessor calls within a role
are clustered replications of one clue set, not independent observations.
`position` is the independent unit.

Every job records its ID, exact dependency, role, assessor replication
(`1..3` or null for the parent), route, prompt compiler contract and
implementation identity, action contract and validator, planned one-attempt
execution, and null outcome. Jobs are topologically enumerated as each parent
followed by its six children. Cell ranking uses SHA-256 and explicit ECMAScript
UTF-16 code-unit comparison, never locale ordering.

Child input is role-legal and blinded:

- teammate decoders receive focal own keywords and the parent clue
  placeholders as own clues;
- opponent interceptors receive `ownKeywords: null` and the parent clue
  placeholders as opponent clues;
- neither receives a live target code;
- all six depend on one parent action and materialize **only** its `clues`
  field;
- parent `rationale` is private and structurally excluded from downstream
  observations and prompts.

Matched C0/C1 assessor observation IDs and logical action keys are arm-neutral.
Before materializing the parent clue triple, the full assessor observations
and compiled shared joint-assignment prompt templates are byte-identical
across arms for the same position, role, and replication.

All decoder/interceptor children use the exact shared
`JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT`,
`compileJointAssignmentDecoderPrompt`, and
`validateJointAssignmentAction`. Their `BotBuild` binds both the frozen shared
compiler contract hash and the exact implementation bytes containing system
prompt, renderer, column-ledger helpers, and compiler verification:
`d12e079c4dd9fd8e770ec51c74508b7f477d3f32cd4b8aa46ff4ec045517e63e`.
The shared action source is independently pinned at
`4ddba7a357ebccaf590cdddcf595049ba9f2ed6a4472b00853d6cb43d5c871e1`.

The local cluegiver compiler is strict even before integration: it rejects
unknown nested resolved-round fields, recomputes the observation content hash,
checks Table protocol identities, and rejects ad-hoc compiler hashes. Its
compiler identity binds the exact implementation bytes containing its system
prompt, renderer, carrier helpers, action validator bridge, and compiler:
`624079a69db342ad82f3f50a4db351220ebdba9ebf781e4d2f590afbb1da9686`.
This local validation does not waive the shared-contract and registry gates
above.

## Planned route and stopping behavior

No route is called by this scaffold. A separately reviewed dispatcher would
have to use exactly:

- OpenRouter model `deepseek/deepseek-v4-flash-0731`;
- only the `deepinfra` upstream;
- fallbacks disabled and parameter support required;
- application effort `xhigh`, wire effort `max`;
- one attempt, no retry, no fallback;
- warning at 300 seconds, then continue waiting;
- hard stop at 600 seconds, recorded with no retry or fallback.

Every job currently says `planned_unlicensed`, `providerDispatches: 0`, and
`outcome: null`.

## Descriptive estimands, not results

For each position × arm cell:

- `decodeRate` is the mean of three teammate exact-code indicators;
- `interceptRate` is the mean of three opponent exact-code indicators;
- `net = decodeRate − interceptRate`.

The only paired contrast is descriptive C1−C0 at the position level.
Interceptor per-slot correctness is described separately for history-bearing
and history-free slots. C1's teammate guardrail requires both:

- absolute decode rate at least `0.75`;
- no decode-rate deficit greater than `0.10` versus C0.

No inference, promotion, seating license, or strength claim may be made from
this canary.

## Reproduction and pinned dry-run identities

From a fully installed Herpetarium checkout:

```sh
npm run test:cluegiver-s1-prereg
npm run experiment:cluegiver-s1-prereg-dry-run
```

Pinned v0.2 identities:

- role-complete fixture:
  `53dd8478fb38e6dfbc4f158c53ae42dc09e32d56a04062211f0089245560aae1`;
- exact C0 policy artifact:
  `da0e7912541eedbb9468ccc3ee9152710c96b6ade8c4677896e657a9b7cf269c`;
- exact shared C1 candidate artifact:
  `cbaa877a34ae392be36a3cbd11e9b6d3cf1574433bfed34adbe0d5282792b068`;
- implementation-bound cluegiver compiler:
  `6b0b027564b4e8fd0cb1a3f56f7fac128cd7ad94d60cc1d37d63334c39477dad`;
- route:
  `1e0718acd814309bea3330240a972c761e2245f4de8a8a7a94f8ea3bb433260a`;
- ordering-seed SHA-256:
  `4073f75d46c3012a209c6aabbc9ea32ea667526b704dc09c9395011b2d46a724`;
- eight cells:
  `13eb781ebf785d41fe3849d064a132e86b755355eabdf97f3e11aed86feb51ac`;
- complete 56-job DAG:
  `9409b51f907e1348a8774e7d1b459a6060b3e867b466c09485431695538ae192`;
- full preregistration:
  `cc749a9177fb720b4c668e729a25e49ffde7d680a995c407c48030c2dc11606c`;
- compact receipt:
  `a8096ce880387f336af37beb8240e6b688f2bb08b19c21d8100e9f4ccb1b93f1`.

The checked-in receipt binds source bytes, fixture, cells, all 56 jobs, exact
topological job IDs, compiler identities, zero provider calls, and the
still-blocking shared-contract integration gate.
