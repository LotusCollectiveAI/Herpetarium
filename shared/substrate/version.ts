/**
 * Shared Decrypto substrate — the versioned vocabulary that lets Herpetarium
 * train and evaluate named immutable strategy artifacts, and lets The Table
 * seat those exact artifacts in human games and return standardized traces.
 *
 * This directory is intentionally dependency-free (node:crypto only) and is
 * vendored byte-identically into both applications:
 *   Herpetarium:        shared/substrate/
 *   the-table-handoff:  lib/decrypto-substrate/src/
 * Any change must land in both copies; `runConformance()` plus the parity
 * script prove the copies agree. Do not add app-specific imports here.
 */
export const SUBSTRATE_NAME = "decrypto-substrate";
export const SUBSTRATE_VERSION = "0.1.0";
