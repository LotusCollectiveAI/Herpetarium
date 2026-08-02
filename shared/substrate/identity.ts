import { contentHash } from "./hash";

export const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Minimal content-addressed identity used wherever one immutable contract
 * cites another. An id is for humans; the hash is the authority.
 */
export interface ContentIdentityRef {
  readonly id: string;
  readonly contentHash: string;
}

/** Reject missing and unknown fields on a fixed-shape contract object. */
export function exactKeys(
  value: unknown,
  required: readonly string[],
  label: string,
): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [`${label} must be an object`];
  }
  const allowed = new Set(required);
  return [
    ...required
      .filter((key) => !Object.prototype.hasOwnProperty.call(value, key))
      .map((key) => `${label}.${key} is required`),
    ...Object.keys(value)
      .filter((key) => !allowed.has(key))
      .map((key) => `${label} has unknown field "${key}"`),
  ];
}

export function validateContentIdentityRef(
  ref: ContentIdentityRef | null | undefined,
  fieldName = "identity",
): string[] {
  const problems: string[] = [];
  if (!ref || typeof ref.id !== "string" || ref.id.trim() === "") {
    problems.push(`${fieldName}.id is required`);
  }
  if (
    !ref ||
    typeof ref.contentHash !== "string" ||
    !SHA256_HEX_PATTERN.test(ref.contentHash)
  ) {
    problems.push(`${fieldName}.contentHash must be a lowercase sha-256 hex digest`);
  }
  return problems;
}

export function validateExactContentIdentityRef(
  ref: ContentIdentityRef | null | undefined,
  fieldName = "identity",
): string[] {
  return [
    ...exactKeys(ref, ["id", "contentHash"], fieldName),
    ...validateContentIdentityRef(ref, fieldName),
  ];
}

export function sameContentIdentity(
  left: ContentIdentityRef | null | undefined,
  right: ContentIdentityRef | null | undefined,
): boolean {
  return (
    !!left &&
    !!right &&
    left.id === right.id &&
    left.contentHash === right.contentHash
  );
}

/** Clone before recursively freezing so a minted contract cannot be mutated. */
export function cloneAndDeepFreeze<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (entry: unknown): void => {
    if (entry !== null && typeof entry === "object" && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry as Record<string, unknown>)) {
        freeze(child);
      }
      Object.freeze(entry);
    }
  };
  freeze(clone);
  return clone;
}

/** Build a reference from the exact immutable payload it names. */
export function identityRef(id: string, payload: unknown): ContentIdentityRef {
  if (id.trim() === "") {
    throw new Error("identity id is required");
  }
  return Object.freeze({ id, contentHash: contentHash(payload) });
}

/**
 * Contracts carry hashes and opaque blob references, never provider
 * credentials. This recursive key guard catches the common ways a malformed
 * runtime projection could accidentally embed a secret-bearing field.
 *
 * It is deliberately a key guard rather than a value scanner: a Decrypto clue
 * may legitimately look like a token. Runtime exporters still own redaction
 * of values before constructing a contract.
 */
const SECRET_KEY_PATTERN =
  /^(?:api[-_]?key|authorization|access[-_]?token|refresh[-_]?token|private[-_]?key|provider[-_]?secret|client[-_]?secret|password|secret|token|credentials?|cookie|set[-_]?cookie)$/i;

export function findSecretBearingPaths(
  value: unknown,
  path = "$",
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      findSecretBearingPaths(entry, `${path}[${index}]`),
    );
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  const problems: string[] = [];
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (SECRET_KEY_PATTERN.test(key)) {
      problems.push(childPath);
    }
    problems.push(...findSecretBearingPaths(entry, childPath));
  }
  return problems;
}

export function assertNoSecretBearingFields(
  value: unknown,
  label: string,
): void {
  const paths = findSecretBearingPaths(value);
  if (paths.length > 0) {
    throw new Error(
      `${label} contains forbidden secret-bearing fields: ${paths.join(", ")}`,
    );
  }
}
