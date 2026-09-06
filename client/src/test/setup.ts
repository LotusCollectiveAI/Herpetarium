import { afterEach } from "vitest";

// jest-dom's matchers only make sense against a real document, so they are
// registered lazily -- server tests run under the node environment and
// importing it there throws.
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());
}
