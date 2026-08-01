import { createHash } from "node:crypto";

/**
 * Canonical JSON: deterministic serialization used for all content hashes.
 * Objects serialize with sorted keys at every depth; undefined-valued keys
 * are omitted (matching JSON.stringify); arrays keep order.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = sortValue(v);
    return out;
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function contentHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/**
 * Port of Herpetarium's legacy 32-bit genome hash (genomeCompiler.ts
 * v2.0.0 `simpleGenomeHash`). Kept only so pre-substrate DB lineage rows
 * can be correlated with substrate artifacts. New identity is contentHash.
 */
export function legacyGenomeHash(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (Math.imul(31, hash) + input.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
