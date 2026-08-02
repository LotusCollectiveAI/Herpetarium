import type { PrivateProviderResponseReceipt } from "@shared/schema";
import {
  canonicalJson,
  sha256Hex,
} from "@shared/substrate/hash";

type UnavailableBodyStorage =
  | "not_stored_non_2xx"
  | "unavailable_before_response"
  | "body_read_failed";

function sha256(value: string): string {
  return sha256Hex(value);
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function presentReasoningValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function withReceiptHash(
  receipt: Omit<
    PrivateProviderResponseReceipt,
    "receiptContentSha256"
  >,
): PrivateProviderResponseReceipt {
  return {
    ...receipt,
    // The receipt lives in PostgreSQL JSONB, which does not preserve object
    // key order. Canonical JSON makes the digest stable across that roundtrip.
    receiptContentSha256: sha256(canonicalJson(receipt)),
  };
}

/**
 * Preserve the exact successful HTTP body. Reasoning is not duplicated: when
 * present, its field names and digest point into the exact body stored in this
 * same operator-private receipt.
 */
export function storedPrivateProviderReceipt(input: {
  responseBodyText: string;
  parsedResponse: unknown | null;
  bodyFormat: "parsed_json" | "invalid_json";
}): PrivateProviderResponseReceipt {
  const parsed = objectValue(input.parsedResponse);
  const choices = Array.isArray(parsed?.choices) ? parsed.choices : [];
  const choice = objectValue(choices[0]);
  const message = objectValue(choice?.message);
  const candidates = [
    ["choices[0].message.reasoning", message?.reasoning],
    [
      "choices[0].message.reasoning_content",
      message?.reasoning_content,
    ],
    [
      "choices[0].message.reasoning_details",
      message?.reasoning_details,
    ],
  ] as const;
  const present = candidates.filter(([, value]) =>
    presentReasoningValue(value),
  );
  const reasoningCanonical =
    present.length > 0
      ? canonicalJson(
          Object.fromEntries(
            present.map(([field, value]) => [field, value]),
          ),
        )
      : null;
  const usage = objectValue(parsed?.usage);
  const completionDetails = objectValue(
    usage?.completion_tokens_details,
  );
  const reasoningTokens =
    typeof completionDetails?.reasoning_tokens === "number"
      ? completionDetails.reasoning_tokens
      : null;
  const reasoningPresence =
    input.bodyFormat === "invalid_json"
      ? ("uninspectable_invalid_json" as const)
      : present.length > 0
        ? ("present" as const)
        : ("absent" as const);

  return withReceiptHash({
    version: "openrouter-private-paid-call-receipt@0.1.0",
    storageClass: "operator_private",
    source: "openrouter_http_response",
    responseBody: {
      storage: "stored_exact",
      text: input.responseBodyText,
      sha256: sha256(input.responseBodyText),
      utf8Bytes: utf8Bytes(input.responseBodyText),
    },
    reasoning: {
      presence: reasoningPresence,
      storage:
        reasoningPresence === "present"
          ? "within_exact_response_body"
          : reasoningPresence === "absent"
            ? "not_returned"
            : "uninspectable",
      providerFields: present.map(([field]) => field),
      sha256:
        reasoningCanonical === null
          ? null
          : sha256(reasoningCanonical),
      utf8Bytes:
        reasoningCanonical === null
          ? null
          : utf8Bytes(reasoningCanonical),
      reasoningTokens,
    },
    exactResponseBodyStored: true,
    hiddenReasoningStored: reasoningPresence === "present",
  });
}

export function unavailablePrivateProviderReceipt(
  storage: UnavailableBodyStorage,
): PrivateProviderResponseReceipt {
  return withReceiptHash({
    version: "openrouter-private-paid-call-receipt@0.1.0",
    storageClass: "operator_private",
    source: "openrouter_http_response",
    responseBody: {
      storage,
      text: null,
      sha256: null,
      utf8Bytes: null,
    },
    reasoning: {
      presence: "unavailable",
      storage: "unavailable",
      providerFields: [],
      sha256: null,
      utf8Bytes: null,
      reasoningTokens: null,
    },
    exactResponseBodyStored: false,
    hiddenReasoningStored: false,
  });
}

export function verifyPrivateProviderReceipt(
  value: unknown,
): string[] {
  const issues: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["private provider receipt is missing or not an object"];
  }
  const receipt = value as PrivateProviderResponseReceipt;
  if (
    receipt.version !==
      "openrouter-private-paid-call-receipt@0.1.0" ||
    receipt.storageClass !== "operator_private" ||
    receipt.source !== "openrouter_http_response" ||
    !receipt.responseBody ||
    typeof receipt.responseBody !== "object" ||
    Array.isArray(receipt.responseBody) ||
    !receipt.reasoning ||
    typeof receipt.reasoning !== "object" ||
    Array.isArray(receipt.reasoning) ||
    typeof receipt.receiptContentSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(receipt.receiptContentSha256)
  ) {
    return ["private provider receipt shape/identity mismatch"];
  }
  const { receiptContentSha256, ...withoutHash } = receipt;
  if (
    sha256(canonicalJson(withoutHash)) !== receiptContentSha256
  ) {
    issues.push("private provider receipt content hash mismatch");
  }
  const body = receipt.responseBody;
  const allowedBodyStorage = new Set([
    "stored_exact",
    "not_stored_non_2xx",
    "unavailable_before_response",
    "body_read_failed",
  ]);
  if (!allowedBodyStorage.has(body.storage)) {
    issues.push("private provider response body storage is invalid");
  }
  const reasoning = receipt.reasoning;
  const allowedReasoningPresence = new Set([
    "present",
    "absent",
    "uninspectable_invalid_json",
    "unavailable",
  ]);
  const allowedReasoningStorage = new Set([
    "within_exact_response_body",
    "not_returned",
    "uninspectable",
    "unavailable",
  ]);
  if (
    !allowedReasoningPresence.has(reasoning.presence) ||
    !allowedReasoningStorage.has(reasoning.storage) ||
    !Array.isArray(reasoning.providerFields) ||
    reasoning.providerFields.some(
      (field) => typeof field !== "string",
    ) ||
    !(
      reasoning.sha256 === null ||
      (typeof reasoning.sha256 === "string" &&
        /^[0-9a-f]{64}$/.test(reasoning.sha256))
    ) ||
    !(
      reasoning.utf8Bytes === null ||
      (Number.isInteger(reasoning.utf8Bytes) &&
        reasoning.utf8Bytes >= 0)
    ) ||
    !(
      reasoning.reasoningTokens === null ||
      (Number.isInteger(reasoning.reasoningTokens) &&
        reasoning.reasoningTokens >= 0)
    )
  ) {
    issues.push("private provider reasoning receipt shape is invalid");
  }
  if (body.storage === "stored_exact") {
    if (
      typeof body.text !== "string" ||
      typeof body.sha256 !== "string" ||
      typeof body.utf8Bytes !== "number" ||
      body.sha256 !== sha256(body.text) ||
      body.utf8Bytes !== utf8Bytes(body.text)
    ) {
      issues.push("private provider exact response body lineage mismatch");
    } else {
      let parsed: unknown | null = null;
      let bodyFormat: "parsed_json" | "invalid_json" =
        "parsed_json";
      try {
        parsed = JSON.parse(body.text) as unknown;
      } catch {
        bodyFormat = "invalid_json";
      }
      const rebuilt = storedPrivateProviderReceipt({
        responseBodyText: body.text,
        parsedResponse: parsed,
        bodyFormat,
      });
      if (
        canonicalJson(rebuilt.reasoning) !==
        canonicalJson(receipt.reasoning)
      ) {
        issues.push("private provider reasoning lineage mismatch");
      }
    }
    if (receipt.exactResponseBodyStored !== true) {
      issues.push("private provider exact-body storage flag mismatch");
    }
  } else if (
    body.text !== null ||
    body.sha256 !== null ||
    body.utf8Bytes !== null
  ) {
    issues.push("unavailable private provider body carries content");
  } else if (allowedBodyStorage.has(body.storage)) {
    const expectedUnavailable = unavailablePrivateProviderReceipt(
      body.storage as UnavailableBodyStorage,
    );
    if (
      canonicalJson(receipt.reasoning) !==
        canonicalJson(expectedUnavailable.reasoning) ||
      receipt.exactResponseBodyStored !== false
    ) {
      issues.push(
        "unavailable private provider receipt disposition mismatch",
      );
    }
  }
  if (
    receipt.hiddenReasoningStored !==
    (receipt.reasoning.presence === "present" &&
      body.storage === "stored_exact")
  ) {
    issues.push("private provider reasoning storage flag mismatch");
  }
  return issues;
}
