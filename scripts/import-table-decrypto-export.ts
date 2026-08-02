/**
 * Local-file-only importer for a completed-game Decrypto decision export.
 *
 * This command reads one bounded regular JSON file, verifies the entire export
 * before opening a database connection, and writes only immutable quarantine
 * rows in one transaction. It never calls The Table, a model provider, or any
 * other network source for input data.
 */
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import {
  PgTableDecryptoImportStore,
  TABLE_DECRYPTO_QUARANTINE_PARTITION,
  importPreparedTableDecryptoGame,
  parseAndPrepareTableDecryptoImport,
} from "../server/tableDecryptoImport";

export const MAX_TABLE_DECRYPTO_EXPORT_BYTES = 128 * 1024 * 1024;

export interface TableDecryptoImportCliOptions {
  readonly filePath: string;
  readonly partition: typeof TABLE_DECRYPTO_QUARANTINE_PARTITION;
}

export function parseTableDecryptoImportArgs(
  args: readonly string[],
): TableDecryptoImportCliOptions {
  let filePath: string | null = null;
  let partition: string | null = null;
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || value === undefined || value.startsWith("--")) {
      throw new Error(
        "usage: import-table-decrypto-export.ts --file <local-json-file> --partition legacy_unassigned",
      );
    }
    if (flag === "--file") {
      if (filePath !== null) throw new Error("--file may be provided only once");
      if (
        value === "-" ||
        /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ||
        value.startsWith("file:")
      ) {
        throw new Error("--file must name a local filesystem path");
      }
      filePath = resolve(value);
      continue;
    }
    if (flag === "--partition") {
      if (partition !== null) {
        throw new Error("--partition may be provided only once");
      }
      partition = value;
      continue;
    }
    throw new Error(`unknown argument ${flag}`);
  }
  if (filePath === null) throw new Error("--file is required");
  if (partition !== TABLE_DECRYPTO_QUARANTINE_PARTITION) {
    throw new Error(
      `--partition must be explicitly ${TABLE_DECRYPTO_QUARANTINE_PARTITION}`,
    );
  }
  return {
    filePath,
    partition: TABLE_DECRYPTO_QUARANTINE_PARTITION,
  };
}

export async function readLocalTableDecryptoExport(
  filePath: string,
): Promise<string> {
  const pathStat = await lstat(filePath);
  if (!pathStat.isFile() || pathStat.isSymbolicLink()) {
    throw new Error("--file must be a local regular file, not a link or directory");
  }
  if (pathStat.size > MAX_TABLE_DECRYPTO_EXPORT_BYTES) {
    throw new Error(
      `Table Decrypto export exceeds ${MAX_TABLE_DECRYPTO_EXPORT_BYTES} bytes`,
    );
  }
  const handle = await open(
    filePath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const openedStat = await handle.stat();
    if (!openedStat.isFile()) {
      throw new Error("--file changed and is no longer a regular file");
    }
    if (
      openedStat.dev !== pathStat.dev ||
      openedStat.ino !== pathStat.ino
    ) {
      throw new Error("--file changed while it was being opened");
    }
    if (openedStat.size > MAX_TABLE_DECRYPTO_EXPORT_BYTES) {
      throw new Error(
        `Table Decrypto export exceeds ${MAX_TABLE_DECRYPTO_EXPORT_BYTES} bytes`,
      );
    }
    const bytes = await handle.readFile();
    if (bytes.byteLength > MAX_TABLE_DECRYPTO_EXPORT_BYTES) {
      throw new Error(
        `Table Decrypto export exceeds ${MAX_TABLE_DECRYPTO_EXPORT_BYTES} bytes`,
      );
    }
    if (
      bytes.length >= 3 &&
      bytes[0] === 0xef &&
      bytes[1] === 0xbb &&
      bytes[2] === 0xbf
    ) {
      throw new Error("Table Decrypto export must not contain a UTF-8 BOM");
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("Table Decrypto export is not valid UTF-8");
    }
  } finally {
    await handle.close();
  }
}

function isDirectExecution(): boolean {
  return (
    process.argv[1] !== undefined &&
    resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  );
}

async function main(): Promise<void> {
  const options = parseTableDecryptoImportArgs(process.argv.slice(2));
  const jsonText = await readLocalTableDecryptoExport(options.filePath);
  // Complete local validation before DATABASE_URL is read or a pool exists.
  const prepared = parseAndPrepareTableDecryptoImport(jsonText);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  try {
    const result = await importPreparedTableDecryptoGame(
      new PgTableDecryptoImportStore(pool),
      prepared,
    );
    process.stdout.write(
      `${JSON.stringify({
        status: result.status,
        sourceGameId: result.sourceGameId,
        partition: options.partition,
        decisionCount: result.decisionCount,
        canonicalExportSha256: result.canonicalExportSha256,
      })}\n`,
    );
  } finally {
    await pool.end();
  }
}

if (isDirectExecution()) {
  void main().catch((error) => {
    process.stderr.write(
      `[table-decrypto-import] ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  });
}
