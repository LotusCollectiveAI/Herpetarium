import type {
  CandidatePolicyArtifact,
  HeadlessPromptOverrides,
  PromptRole,
  TeamId,
} from "@shared/schema";
import { CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT } from "@shared/substrate";

function isCanonicalCandidatePolicy(
  policy: CandidatePolicyArtifact,
): boolean {
  return (
    policy.id === CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.id &&
    policy.instruction ===
      CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.instruction &&
    policy.contentHash ===
      CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.contentHash
  );
}

/**
 * Candidate selection is an encryptor-only actor-call treatment. It is never
 * inherited by decoders, interceptors, deliberators, coaches, or the opposite
 * team merely because they share the same compiled genome.
 */
export function resolveRoleCandidatePolicy(
  overrides: HeadlessPromptOverrides | undefined,
  team: TeamId,
  role: PromptRole,
): CandidatePolicyArtifact | undefined {
  if (role !== "cluegiver") return undefined;

  const policy = overrides?.[team]?.candidatePolicy;
  if (!policy) return undefined;
  if (!isCanonicalCandidatePolicy(policy)) {
    throw new Error(
      "Headless candidate policy does not match the canonical cipher-encrypt treatment",
    );
  }
  return policy;
}
