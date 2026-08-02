/**
 * Guarded schema-sync preparation for the disposable candidate-policy A/B
 * database. Importing this module is side-effect free.
 */
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import {
  assertDisposableLocalDatabaseUrl,
  inspectDisposableLocalDatabase,
  type CandidatePolicyAbDatabaseLineage,
} from "./run-candidate-policy-ab-experiment";

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

export interface CandidatePolicyAbDatabasePreparationPlan {
  databaseName: string;
  socketDirectory: string;
  repositoryRoot: string;
  executable: "npm";
  args: readonly ["run", "db:push"];
  schemaSyncCommand: "npm run db:push";
  migrationReplayAllowed: false;
}

export interface CandidatePolicyAbDatabasePreparationDependencies {
  assertBlankDatabase?: (databaseUrl: string) => Promise<void>;
  runSchemaSync?: (databaseUrl: string) => Promise<void>;
  inspectPreparedDatabase?: (
    databaseUrl: string,
  ) => Promise<CandidatePolicyAbDatabaseLineage>;
}

export function candidatePolicyAbDatabasePreparationPlan(
  databaseUrl: string | undefined,
): CandidatePolicyAbDatabasePreparationPlan {
  const identity = assertDisposableLocalDatabaseUrl(databaseUrl);
  return {
    ...identity,
    repositoryRoot: REPOSITORY_ROOT,
    executable: "npm",
    args: ["run", "db:push"],
    schemaSyncCommand: "npm run db:push",
    migrationReplayAllowed: false,
  };
}

async function assertBlankDisposableDatabase(
  databaseUrl: string,
): Promise<void> {
  const expected = assertDisposableLocalDatabaseUrl(databaseUrl);
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  try {
    const identity = await pool.query<{
      database_name: string;
      server_address: string | null;
    }>(
      "SELECT current_database() AS database_name, inet_server_addr()::text AS server_address",
    );
    const row = identity.rows[0];
    if (
      !row ||
      row.database_name !== expected.databaseName ||
      row.server_address !== null
    ) {
      throw new Error(
        "candidate-policy database preflight could not prove the expected local Unix-socket database",
      );
    }
    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
    );
    let applicationRows = 0;
    for (const { table_name: tableName } of tables.rows) {
      if (tableName.startsWith("__drizzle")) continue;
      if (!/^[a-z_][a-z0-9_]*$/.test(tableName)) {
        throw new Error(
          `unsafe table identity during blank-database preflight: ${tableName}`,
        );
      }
      const count = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM "${tableName}"`,
      );
      applicationRows += Number.parseInt(
        count.rows[0]?.count ?? "0",
        10,
      );
    }
    if (applicationRows !== 0) {
      throw new Error(
        `candidate-policy database must be blank before db:push; found ${applicationRows} application rows`,
      );
    }
  } finally {
    await pool.end();
  }
}

async function runDbPush(databaseUrl: string): Promise<void> {
  await execFileAsync("npm", ["run", "db:push"], {
    cwd: REPOSITORY_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

export async function prepareCandidatePolicyAbDatabase(
  databaseUrl: string | undefined = process.env.DATABASE_URL,
  dependencies: CandidatePolicyAbDatabasePreparationDependencies = {},
): Promise<CandidatePolicyAbDatabaseLineage> {
  const plan = candidatePolicyAbDatabasePreparationPlan(databaseUrl);
  const assertBlank =
    dependencies.assertBlankDatabase ??
    assertBlankDisposableDatabase;
  const sync = dependencies.runSchemaSync ?? runDbPush;
  const inspect =
    dependencies.inspectPreparedDatabase ??
    inspectDisposableLocalDatabase;

  await assertBlank(databaseUrl!);
  await sync(databaseUrl!);
  const lineage = await inspect(databaseUrl!);
  if (
    lineage.databaseName !== plan.databaseName ||
    lineage.socketDirectory !== plan.socketDirectory ||
    lineage.provisioningContract.schemaSyncCommand !==
      plan.schemaSyncCommand
  ) {
    throw new Error(
      "post-db:push inspection did not match the guarded provisioning plan",
    );
  }
  return lineage;
}

function isDirectExecution(): boolean {
  return (
    Boolean(process.argv[1]) &&
    resolve(process.argv[1]!) === fileURLToPath(import.meta.url)
  );
}

if (isDirectExecution()) {
  prepareCandidatePolicyAbDatabase()
    .then((lineage) => {
      console.log(
        JSON.stringify(
          {
            status: "prepared",
            databaseName: lineage.databaseName,
            socketDirectory: lineage.socketDirectory,
            schemaHash: lineage.schemaHash,
            provisioningContract: lineage.provisioningContract,
          },
          null,
          2,
        ),
      );
    })
    .catch((error) => {
      console.error(
        error instanceof Error ? error.message : String(error),
      );
      process.exitCode = 1;
    });
}
