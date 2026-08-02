# Cross-round v0.3 repeat measurement — 2026-08-02

This is the compact, non-sensitive evidence index for the completed repeat
measurement. The raw prompts, responses, receipts, and per-draw records remain
in the local private experiment corpus and are intentionally not duplicated
here.

## Identity and integrity

- Experiment: `cross-round-v03-repeat-measurement@0.2`
- Status: **incomplete**
- Release boundary: **not a release boundary**
- Registered: `2026-08-02T06:59:19.405Z`
- Completed report: `2026-08-02T08:41:29.775Z`
- Source commit: `128f1248fbe08f4011b86e7429b39330f3f2b3cc`
- Source tree: `a13ab20787d7fbf22f6fffc83440b258a7f47222`
- Source set hash: `9c4e4e2a744ca18d1cb673df922750b21578a7a1f877c90bc1160d1818e5a341`
- Pre-registration content hash:
  `3a614ba55232cae89cc5c88144ed2a6f875729b28850c987445f62faf5b80723`
- Report content hash:
  `523cee53712d823a107acf709a418c789e143ee2078d10f7dadeaf599f960881`
- Pre-registration file SHA-256:
  `a76556401da8e4550cd4add75199457092c5f14ff08fd50ccf542f7c6b4e0caf`
- Report file SHA-256:
  `1bfead1ac9ba3394f0022656474f1a8f20e00157351b26f84cdbd5cc650c90e8`
- Post-run verification found no source-lineage mismatch.

## Fixed route and completeness

The pre-registered route was OpenRouter
`deepseek/deepseek-v4-flash-0731`, pinned to DeepInfra, with fallbacks disabled,
one physical attempt per job, no retries, and no replacement calls. Of 60
scheduled calls, 58 produced valid records and all 58 carried the exact
requested model/upstream route proof. Two calls failed after HTTP 200 because
the response body was truncated JSON; they were retained as failures and not
replaced. The global result is therefore incomplete.

### The two failed draws

- Failed case id: `synthetic-opaque-negative-control` — the post-incident
  hand-authored shaped input, and the only case with fewer than 20 valid
  draws (18/20). Both failures fall in this case; `red-production-incident-2026-08-01`
  and `blue-production-incident-2026-08-01` were 20/20 valid.
- Job enumeration is deterministic: cases cycle Red, Blue, shaped input, so
  this case owns ordinals 3, 6, 9, … 60, with repeat `r = ordinal / 3`.
- Run files follow `runs/<ordinal:0000>-synthetic-opaque-negative-control-r<repeat:00>.json`
  with the paired raw receipt at the same stem plus `.raw.json` — that is, the
  twenty files `runs/0003-…-r01.json` through `runs/0060-…-r20.json`.
- The failing jobs were ordinal 51 / repeat 17 and ordinal 54 / repeat 18:
  `runs/0051-synthetic-opaque-negative-control-r17.json` and
  `runs/0054-synthetic-opaque-negative-control-r18.json`, with paired raw
  receipts at the same stems plus `.raw.json`. Their full per-draw records and
  provider receipts remain only in the local private experiment corpus.

## Descriptive outcomes

These are repeated draws of byte-identical prompts. They are descriptive
measurements, not independent Bernoulli trials or formal inference.

- Red incident: the human-observed whole code had actionable support in 19/20
  draws and appeared in the credible set in 20/20.
- Blue incident: the human-observed whole code had actionable support in 0/20
  draws.
- Blue mechanistic secondary: the analyst-hypothesized `turret -> slot 1` edge
  had actionable support in 3/20 draws. The observed human interception does
  not establish that particular rationale.
- Post-incident shaped input: its intended whole code had actionable support
  in 3/18 valid draws; 10/18 valid draws contained at least one strong cell.
  This input was hand-authored after the incident. It is not held out, does
  not estimate a false-positive rate, and does not establish safety,
  calibration, or non-leakage.

## Operational evidence

- Completion tokens across 58 valid calls: minimum 14,932; reported median
  32,712; nearest-rank p95 50,980; maximum 58,441.
- The maximum used 89.2% of the 65,536-token completion allowance.
- Per-case completion maxima: Red 36,992 (56.4%); Blue 48,338 (73.8%);
  shaped input 58,441 (89.2%).
- Latency: minimum 183,256 ms; reported median 468,722 ms; nearest-rank p95
  789,509 ms; maximum 983,480 ms.
- Provider-reported cost across valid calls: `$0.351762516`.

The completion and latency tails are direct empirical reasons for the candidate
A/B harness to retain per-call completion-token headroom, unknown-count, and
latency fields even when behavioral analysis is suppressed.

## Epistemic boundary

No human reasoning transcript was inspected for this measurement. The shaped
input is not a held-out control. The repeat does not validate the current
instrument for product gating, establish population error rates, or authorize
release. It establishes a reproducible operational and descriptive record of
the unchanged v0.3 instrument, including a Blue whole-code result of 0/20 and
material completion-token/latency tails.

0/20 falls in the lowest pre-registered descriptive band, whose frozen label is
`systematic_omission_candidate` (0–4 of 20). That label is a name for the count
range and nothing more. This measurement did not identify, isolate, or test any
systematic cause; it repeated one unchanged instrument on one input and found
the target absent every time. Read it as a reproducible omission on this target
under this instrument — the reason to build a different elicitation instrument,
not a finding about why.
