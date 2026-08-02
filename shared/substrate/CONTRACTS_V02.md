# Shared runtime contracts v0.2 (decoder slice)

Status: contract and deterministic conformance surface, 2026-08-02.

Neither runtime constructs, enforces, exports, or ingests these v0.2 objects
yet. The Table engine, visibility projection, `ai_calls`, turn tasks, and game
events remain authoritative. This file and the TypeScript beside it are a test
oracle for the next integration slice, not deployment evidence.

The slice is deliberately one decision wide:

`bot decoder observation → provider attempt → parsed decode → application → outcome`

Deferred rather than implied:

- BotBuild licenses, seating manifests, trusted issuers, and revocation;
- human, system, and operator observations or traces;
- post-outcome observations and trace supersession;
- encryptor, interceptor, deliberation, social, and reflection traces;
- clue-generation legality identities and bot publication policy.

Observation retains an interceptor view only to fail closed on the current
engine's round and clue preconditions. Trace v0.2 remains decode-only.

## BotBuildManifest v0.1

A strategy name is not a complete bot identity. `BotBuildManifest` binds the
decoder behavior that can affect one request or accepted action:

- exact StrategyArtifact, compiler, context compiler, and compiled carrier;
- exact response parser, action validator, provider adapter, orchestration,
  retry, and fallback identities;
- provider, model, upstream, alias epoch, reasoning settings, and
  content-addressed request wire configuration;
- the exact current Table protocol, visibility, and rules identities;
- origin and mint timestamp.

Every fixed object rejects missing and unknown keys. The wire-parameter map is
the sole extensible JSON object and is part of the hash. Recursive
credential-bearing keys are forbidden. This is an immutable implementation
identity, not an evaluation or seating claim.

Pinned conformance BotBuild hash:

`e81a7caa7c6a07e75ec3bb8dc83f6e19ef8b6c0bb76e07b7272cd4a59c8fa083`

## `table-competitive-v1`

The protocol freezes only current-engine facts needed at the guess boundary:

- two three-seat teams, four numbered keywords, and distinct 3-of-4 codes;
- `agent_a → agent_b → agent_c` encryptor rotation by zero-based round index;
- both clue sets before any guess;
- no round-1 intercept;
- both later-round intercepts before either own decode;
- the active encryptor cannot decode or intercept;
- two-token win thresholds, eight-round limit, all seven terminal collision
  branches in engine order, and the maximum-round tiebreak;
- Table, open Team, and private Team read projections, with the chat setting
  frozen at game start.

Clue wording, publication authority, and operator visibility are not part of
this decoder contract. A Table-only differential test must compare these
constants to actual pure-engine outputs and lane projections.

Protocol content hash:

`17e20ef1ee3367d53bb3cb11699c51522ace8df7abeeb4c244e6c103ab4f08e4`

The derived rules and visibility hashes are authoritative. Observation,
trace, and BotBuild validators reject well-formed foreign identities instead
of accepting any syntactically valid sha-256 reference.

## Observation v0.2

`DecryptoObservationV2` is a content-addressed live bot view for either a
decoder or interceptor. It carries stable game, decision, logical-action,
actor, seat, team, role, and active-encryptor identities; the exact BotBuild
and Table protocol identity set; current clues; complete public history;
tokens; and semantic transcript lanes.

Fail-closed gates include:

- decoder and interceptor both require exactly three clues from each team;
- decoder receives exactly four own keywords; interceptor receives null;
- interceptor is rejected in round 1;
- the actor's own-team active encryptor cannot receive either guess view;
- `resolvedRounds` is exactly contiguous rounds
  `1..roundNumber-1`, with complete clues, codes, decodes, intercepts, and
  truth values;
- recorded correctness must agree with the corresponding code and guess;
- tokens must equal the complete history and remain below terminal thresholds
  for a live view;
- opponent Team transcript is present only when Team chat is open;
- extra fields such as opponent keywords and secret-bearing keys fail closed.

Pinned conformance observation hash:

`2820c1acbb29f23ac1564dead906ebca0af6d78f7c7ebc62980efec9d1160988`

## Trace v0.2 and actual persistence

`TraceEnvelopeV2` records one bot decode attempt. Its evidence maps to fields
The Table already retains:

| Contract evidence                       | Table authority                           |
| --------------------------------------- | ----------------------------------------- |
| attempt, decision, logical action, seat | `ai_calls` + durable turn task            |
| request JSON value                      | `ai_calls.request_json`                   |
| provider-visible response text          | `ai_calls.response_raw`                   |
| allowlisted provider metadata           | `ai_calls.response_meta` / call metadata  |
| input/output tokens and latency         | `ai_calls`                                |
| record time                             | `ai_calls.created_at`                     |
| parsed decode and application           | turn command + authoritative action event |
| resolved outcome                        | later authoritative round/game event      |

`request_json` is an exact retained JSON value. Its contract hash uses
canonical JSON, so it does not pretend PostgreSQL JSONB preserves HTTP key
order or raw transport bytes. Prompt content remains inside the actual request
messages; v0.2 does not substitute a weaker standalone prompt claim. Likewise,
`response_raw` is the exact buffered provider-visible string, not provider
reasoning blocks or hidden chain of thought.

Successful traces require request, response, route, parsed action, accepted
validation, and coherent application evidence. Provider failures use explicit
nulls rather than invented evidence. Blob references are opaque private-store
keys; classification is lineage, not access authorization.

Pinned conformance trace hash:

`5e8be20491a31fdf92ce706da0e943b8cfb6938d19a30b8cc296ceb605647f0d`

## Decision-chain gate

`validateDecisionChain(observation, trace)` independently verifies both
objects and binds:

- observation content hash;
- game, round, decision, and logical action;
- actor, seat, team, and role;
- BotBuild, protocol, visibility, and rules identities;
- decoder/decode task identity;
- application logical action and parsed-action hash.

Conformance mutates each binding independently and requires all mismatches to
fail. BotBuild registry resolution remains a separate trusted boundary.

## Compatibility and adoption

Valid Observation and Trace v0.1 callers retain their legacy behavior.
Dispatchers now reject unknown versions instead of treating them as legacy.
The global `SUBSTRATE_VERSION` stays `0.5.0`: it is embedded in existing
compiled carriers, so changing it before runtime adoption would silently
change legacy goldens.

Runtime adoption still requires:

1. a private Table projector that constructs and validates the observation
   before provider dispatch;
2. a private operator export that hashes actual persisted values without
   exposing them through participant-safe endpoints;
3. Herpetarium ingestion that reruns object and decision-chain validation;
4. stable native ID mappings and a trusted BotBuild registry;
5. exact Table engine and lane differential tests kept green;
6. an explicit later design for outcome enrichment, human telemetry, and
   non-decoder tasks.
