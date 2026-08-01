/**
 * Run the shared-substrate conformance suite.
 *
 *   npx tsx scripts/substrate-conformance.ts               # this repo's copy
 *   npx tsx scripts/substrate-conformance.ts <dir>         # another copy (e.g.
 *       ../the-table-handoff/lib/decrypto-substrate/src)
 *   npx tsx scripts/substrate-conformance.ts --emit-hashes # print golden hashes
 *
 * Exits non-zero on any failing check.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const emitOnly = args.includes("--emit-hashes");
  const dirArg = args.find((a) => !a.startsWith("--"));
  const dir = dirArg ? resolve(dirArg) : resolve(import.meta.dirname, "../shared/substrate");

  const mod = (await import(pathToFileURL(resolve(dir, "conformance.ts")).href)) as {
    runConformance: () => {
      passed: boolean;
      checks: Array<{ name: string; ok: boolean; detail?: string }>;
      hashes: Record<string, string>;
    };
  };

  const report = mod.runConformance();

  if (emitOnly) {
    console.log(JSON.stringify(report.hashes, null, 2));
    return;
  }

  console.log(`substrate conformance — ${dir}`);
  for (const check of report.checks) {
    const mark = check.ok ? "ok " : "FAIL";
    console.log(`  [${mark}] ${check.name}${check.ok || !check.detail ? "" : ` — ${check.detail}`}`);
  }
  const failed = report.checks.filter((c) => !c.ok).length;
  console.log(
    failed === 0
      ? `all ${report.checks.length} checks passed`
      : `${failed}/${report.checks.length} checks FAILED`,
  );
  if (!report.passed) process.exitCode = 1;
}

void main();
