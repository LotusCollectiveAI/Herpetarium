/**
 * Independently source-bound full BotBuild identities reviewed for the S1
 * provider-free execution amendment.
 *
 * These pins live outside the execution-preparation module because each
 * BotBuild binds that module's own source SHA. Keeping the literal final
 * BotBuild hashes here avoids an impossible self-referential source hash while
 * allowing the preparation boundary, executor contract, manifest, receipt,
 * and documentation to bind both sources explicitly.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloneAndDeepFreeze, sha256Hex } from "@shared/substrate";
import {
  CLUEGIVER_S1_C0_ARM,
  CLUEGIVER_S1_C1_ARM,
} from "./decrypto-cluegiver-s1-policies";

export const CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITIES_VERSION =
  "decrypto-cluegiver-s1-reviewed-botbuild-identities@0.1.0";

const REVIEWED_BOTBUILD_IDENTITY_SOURCE_BYTES = readFileSync(
  fileURLToPath(import.meta.url),
  "utf8",
);

export const CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITY_SOURCE =
  cloneAndDeepFreeze({
    path: "scripts/lib/decrypto-cluegiver-s1-reviewed-botbuild-identities.ts",
    sha256: sha256Hex(REVIEWED_BOTBUILD_IDENTITY_SOURCE_BYTES),
    bytes: Buffer.byteLength(REVIEWED_BOTBUILD_IDENTITY_SOURCE_BYTES, "utf8"),
  });

export const CLUEGIVER_S1_REVIEWED_BOTBUILD_IDENTITIES = cloneAndDeepFreeze({
  assessor: {
    id: "decrypto-s1-joint-assignment-assessor@0.1.0",
    contentHash:
      "b8a030163a0ac93e6a516511b5b7d9d7481dd8d886ce500cf856d35fb1f6e142",
  },
  cluegiverByArm: {
    [CLUEGIVER_S1_C0_ARM]: {
      id: "cluegiver:decrypto-s1-cluegiver-c0@0.1.0",
      contentHash:
        "2565b04bfc7d6181b32a1c92ea3750ded6555d004063370c5e4aa1288c5c201f",
    },
    [CLUEGIVER_S1_C1_ARM]: {
      id: "cluegiver:decrypto-s1-cluegiver-c1@0.1.0",
      contentHash:
        "1ff827ef6824412eda177d0ad242e50f8065fb7a5ddc3763bcd4212c02f73281",
    },
  },
});
