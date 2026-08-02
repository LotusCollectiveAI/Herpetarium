# Decrypto S1 paired cluegiver mechanism canary — provider-free preregistration

**Status:** deterministic provider-free dry run with the reviewed shared
cluegiver contracts adopted. It executes zero provider calls, has no
dispatcher, records no behavioral outcomes, licenses no spend, and supports no
strategic-strength, efficacy, seating, or promotion claim.

**Base:** Herpetarium
`6fe13f87fb97fa0fc27e0c3ef4ea588a92471110`, including reviewed
cluegiver-contract commit
`86207c58d10eb6ed0deb8830335249f936e11525`.
This v0.4 execution amendment is based on reviewed preregistration/scaffold
parent `e729624dff0c024a7ca152cc423392ca8ccbac0a`. That third hash is parent
provenance, not the underlying integration base and not a self-referential
claim about the eventual amendment commit.

**Shared-contract integration is satisfied.** The scaffold now uses the actual
shared `mintCluegiverObservation` / `verifyCluegiverObservation` and
`mintCluegiverBotBuildManifest` / `verifyCluegiverBotBuildManifest`
implementations. The registry-aware role/build gates are load-bearing:

- `validateCluegiverDecisionContext` runs before every cluegiver compilation;
- `validateGuessDecisionContext` runs before every decoder/interceptor
  compilation and before and after parent-clue materialization.

Unresolved, wrong-scope, and tampered manifests fail closed in adversarial
tests. Provider dispatch remains independently unlicensed because this
provider-free scaffold contains no dispatcher, not because shared-contract
integration is pending. The exact reviewed source bytes are pinned:

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
candidate generation nor isolates history check item 4. The treatment package
also includes the resulting prompt-length increase: C1's provider-visible user
prompt is exactly 2,477 UTF-8 bytes longer than C0. Prompt length is not held
constant or controlled away.

**C2 is reserved and has zero jobs.** A future exact no-history ablation may
define C2; only a future C1−C2 comparison may be described as isolating item 4.
The b41 integrated `cipher_encrypt` instruction is not used as either S1 arm.
The b41 ledger provenance pin is metadata-only: runtime ledger authority comes
from this scaffold's implementation-bound compiler and the shared
`buildPublicClueLedger`, not from unverified b41 source bytes.

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

This is a four-position **mechanism** canary, not an efficacy sample. The
preregistration computes the following disclosure from each fixture focal code
and its resolved round-one focal code; none of these counts is a hardcoded
manifest value. Digit, slot, and history-stratum balance is materially
incomplete:

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

Every job records its unique `jobId`, exact dependency, role, assessor
replication (`1..3` or null for the parent), route, prompt compiler contract
and implementation identity, action contract and validator, planned
one-attempt execution, and null outcome. Jobs are topologically enumerated as
each parent followed by its six children. Cell ranking uses SHA-256 and
explicit ECMAScript UTF-16 code-unit comparison, never locale ordering.

The future executor must persist and deduplicate exclusively by the globally
unique `jobId`, with at most one terminal record for that key. Arm-neutral
`decisionId` and `logicalActionKey` exist only for matched experimental
identity and must never be persistence/idempotency keys. Every preregistered
job carries `idempotencyKey === jobId`, and deterministic tests enforce global
uniqueness and reject either arm-neutral substitute.

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

The cluegiver compiler consumes the actual shared observation and BotBuild
types. It verifies the observation, resolves the observation's build reference
through `validateCluegiverDecisionContext`, and rejects unknown nested
resolved-round fields, tampered manifests, wrong scopes, unresolved builds,
and ad-hoc compiler hashes before it can produce provider-visible prompt
bytes. Its compiler identity binds the exact implementation bytes containing
its system prompt, renderer, carrier helpers, shared decision-context gate,
action-validator bridge, and compiler. The exact local compiler implementation
source is pinned at
`629aaccff8b2ef537213058ccdfc2b270ae22077739ae4ec62127bfd0bb8bbf1`.

The decoder/interceptor path similarly routes all compilations through
`validateGuessDecisionContext`. Its parent-action materializer validates the
template/build pair before projection and the minted observation/build pair
after projection. The DAG records the exact required assessor-build identity
for every materializer invocation.

The load-bearing preparation boundary is
`prepareCluegiverS1Dispatch`. For a parent it reruns
`compileCluegiverS1Prompt`, verifies every preregistered prompt hash, and
returns the exact fresh provider payload inside a content-addressed, deeply
frozen `cluegiver_parent_dispatch` artifact. For a child it accepts one parent
terminal record, obtains the action only from that record, materializes and
verifies the child observation, reruns the shared assessor compiler, and
returns the exact fresh payload inside an `assessor_child_dispatch` artifact.
The private constructor adds that exact deeply frozen object to a
module-private, process-local `WeakSet`. Verification begins by requiring
membership in that set, so the authority is neither serializable nor
transportable: unchanged structured clones, JSON-rehydrated objects, and
mutated clones with self-consistently recomputed nested and outer hashes all
fail. The separately reviewed future provider adapter is typed to accept only
this artifact, must call
`verifyCluegiverS1PreparedDispatchArtifact` immediately before the provider
invocation, and must reject any failed verification; raw or independently
stored prompt payloads are not a parallel input. No provider adapter is
implemented here.

Before preparing any job, that boundary recompiles all eight parent prompts
and all 48 assessor prompt templates from their preregistered observations and
source-bound compilers, hashes the complete provider-visible projection, and
requires the independently reviewed hard constant
`56989a03e8482f2df20ef9cc112584f2408a5693006c58131ba95d4bf4019b40`.
Neither a copied invariant nor self-consistent prompt metadata and a recomputed
outer manifest hash can substitute for that fresh full-projection check.

The preparation boundary separately enforces source-derived canonical
observation semantics that do not depend on each observation's own hash. Its
reviewed position metadata binds the fixture game and team identities, focal
cluegiver actor/seat, teammate decoder actor/seat, opponent active cluegiver
seat, opponent interceptor actor/seat, and fixed current-opponent clue triple.
Parent and both child roles must also match their exact observation version,
decision and logical-action IDs, round, role, active cluegiver seat, table
identities, decision focus, and empty transcript. Each child additionally
derives its complete historical rounds, outcome booleans, token totals,
keyword view, clue orientation, and chat visibility from that cell's
canonical parent, swapping own/opponent orientation for the interceptor.
Consequently, rewriting actor IDs, actor seats, active cluegiver seats,
decision focus, role-hidden history, or a self-consistent outcome/token tuple
and then recomputing every dependent hash still fails. The adversarial matrix
covers the parent, teammate-decoder children, and opponent-interceptor
children; it distinguishes provider-visible fields from role-hidden state.

Before any compilation, preparation also requires the three complete reviewed
BotBuild identities: assessor
`b8a030163a0ac93e6a516511b5b7d9d7481dd8d886ce500cf856d35fb1f6e142`,
C0 `2565b04bfc7d6181b32a1c92ea3750ded6555d004063370c5e4aa1288c5c201f`,
and C1 `1ff827ef6824412eda177d0ad242e50f8065fb7a5ddc3763bcd4212c02f73281`.
The literal hashes live in a separate source-bound pins module because each
BotBuild itself binds the preparation module's source SHA; putting the
BotBuild hashes into that same source would be self-referential. The pins
module's exact raw SHA
`978d92b98b9f11dabc05de1b5d94749dc0e5564775f60bbf4689d4bc0310095e` is
bound by the source loader, implementation bindings, executor contract,
manifest, receipt, and tests. Rehashing a changed inner BotBuild identity and
all dependent observations, projections, templates, and outer manifest cannot
bypass the independent full-identity check.

The parent terminal record consumed by each child binds the exact parent
`jobId`, cell, arm, `succeeded` status, validation state, action, action hash,
and record hash.
Cross-parent, cross-cell, wrong-arm, failed-status, action-hash, record-hash,
noncanonical-role, route, execution, graph, and template tampering all fail
closed. The complete top-level execution object and every per-job execution
copy are compared with their canonical plans after ordinary JSON round trips.
Every cell and every parent/assessor job must also equal its complete canonical
object: position hash/history strata, persistence scope, output projection,
parent output metadata, compiler, action-contract, validator, and policy
identities are load-bearing, and unknown fields at those boundaries fail
closed.
This provider-free shape/hash check does **not** prove that a record was
durably loaded. Durable persistence and its load proof remain obligations of
the separately reviewed concrete executor.

The exact preparation implementation bytes contain the job-ID derivation,
canonical graph and source-derived observation checks, terminal-record
verifier, private process-local artifact mint capability, dispatch preparation,
and receipt builder. The executor contract, manifest, and v0.4 receipt bind
those bytes at
`cf14cc25df50cf808f59fbe0d092dbaf3f01dd20dc15bf95adfd0d5206b9ac95`.

## Planned route and stopping behavior

No route is called by this scaffold. A separately reviewed dispatcher would
have to use exactly:

- OpenRouter model `deepseek/deepseek-v4-flash-0731`;
- only the `deepinfra` upstream;
- fallbacks disabled and parameter support required;
- application effort `xhigh`, wire effort `max`;
- `temperature`, `top_p`, and `seed` keys absent from the provider wire body;
- route/wire/request `maxTokens: 65536`;
- one attempt, no retry, no fallback;
- warning at 300 seconds, then continue waiting;
- hard stop at 600 seconds, recorded with no retry or fallback.

That sampling omission is exact: each key is
`wire_key_must_be_absent`, not merely unspecified or unpreregistered. The
preregistration claims no provider default value for any of the three keys and
treats the resulting nondeterminism as uncontrolled provider sampling. The
three same-prompt assessor calls are repeated physical draws sharing one clue
set, not independent position observations; they add no independent-position
power. A future adapter must prove that its actual provider wire body omits all
three keys before paid calls can be reviewed or licensed.

The planned orchestration/execution concurrency is exactly `4`. It is a worker
limit, not a route or provider-wire parameter, and it does not flatten or relax
the DAG. A child is ineligible for preparation without its one exact
hash-verified succeeded parent terminal record, at every worker count. The
route, requested wire configuration, orchestration identity, executor
contract, top-level execution plan, every job copy, receipt, and tests bind the
applicable settings.

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
npm run --silent experiment:cluegiver-s1-prereg-dry-run -- --emit-receipt
```

The last command emits the complete deterministic receipt and performs zero
provider calls. To regenerate the checked-in file mechanically, redirect its
stdout to
`scripts/fixtures/decrypto-cluegiver-s1-prereg-dry-run-receipt-v0.4.json`;
the focused test requires byte-for-byte equality with that rendering.

Pinned v0.4 identities:

- role-complete fixture:
  `53dd8478fb38e6dfbc4f158c53ae42dc09e32d56a04062211f0089245560aae1`;
- exact C0 policy artifact:
  `da0e7912541eedbb9468ccc3ee9152710c96b6ade8c4677896e657a9b7cf269c`;
- exact shared C1 candidate artifact:
  `cbaa877a34ae392be36a3cbd11e9b6d3cf1574433bfed34adbe0d5282792b068`;
- implementation-bound cluegiver compiler:
  `d2c478c81ab12b7e94694e39943a76ff85ac8163d8474f1763769fc533928818`;
- route:
  `71ed0052d726f9d713e5fd4701d0445a71407ba045ff38553a383133708f23f0`;
- orchestration:
  `22a25e3178b98d64ef56c645e3dc6ec0bec77318d3992804fa26031639096f86`;
- executor contract:
  `c7e59d8a20e01b334d490fdca98554396f2e55865c114744070e6e86eb0a2dfc`;
- execution-preparation implementation:
  `cf14cc25df50cf808f59fbe0d092dbaf3f01dd20dc15bf95adfd0d5206b9ac95`;
- reviewed BotBuild-pin source:
  `978d92b98b9f11dabc05de1b5d94749dc0e5564775f60bbf4689d4bc0310095e`;
- full assessor BotBuild:
  `b8a030163a0ac93e6a516511b5b7d9d7481dd8d886ce500cf856d35fb1f6e142`;
- full C0 cluegiver BotBuild:
  `2565b04bfc7d6181b32a1c92ea3750ded6555d004063370c5e4aa1288c5c201f`;
- full C1 cluegiver BotBuild:
  `1ff827ef6824412eda177d0ad242e50f8065fb7a5ddc3763bcd4212c02f73281`;
- unchanged provider-visible prompt projection:
  `56989a03e8482f2df20ef9cc112584f2408a5693006c58131ba95d4bf4019b40`;
- ordering-seed SHA-256:
  `4073f75d46c3012a209c6aabbc9ea32ea667526b704dc09c9395011b2d46a724`;
- eight cells:
  `13eb781ebf785d41fe3849d064a132e86b755355eabdf97f3e11aed86feb51ac`;
- complete 56-job DAG:
  `57287b16ceaff43a023fd07cb5085ba2a531904967319d75ec4c754c90eb0679`;
- full preregistration:
  `96639e317913cfa2f2ade55f3a745f550d459092138c30522c93706cd3420d70`;
- compact receipt canonical content hash:
  `b68f410036f48b424cc986ca40616fec73b2c3182eb5b8e04fd92e1d03db8d27`;
- compact receipt raw-byte SHA-256:
  `61e28ab2619f7ddcd2d059b89ab680d02663f926bb331f761da47388d63dfa63`.

The historical checked-in v0.2 receipt is immutable. Its raw-byte SHA-256 is
`181fd6f3c1d40d7722018cecf181838d366f8c97062a7cbbe8484c4eb3c936b2`;
v0.4 binds and tests that exact value rather than rewriting history.

The checked-in receipt is generated from the manifest and loaded source
identities rather than manually assembled. It mechanically reproduces and
cross-checks base/scaffold provenance, source bytes, fixture, cells, all 56
jobs, exact first/last/topological job IDs, counts, compiler identities,
`maxTokens`, concurrency, route/orchestration/executor identities, the
unchanged provider-visible projection, zero provider calls, and the satisfied
shared-contract integration gate.
