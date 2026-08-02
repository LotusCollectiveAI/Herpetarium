import {
  deepStrictEqual,
  equal,
  rejects,
  strictEqual,
} from "node:assert";
import {
  ExportQueryError,
  loadAiLogsForExport,
  parseOptionalExperimentId,
  type AiLogExportScopeStore,
} from "../server/exportScope";

interface FakeLog {
  id: string;
  matchId: number;
}

function fakeStore(input: {
  matchesByExperiment: Record<string, number[]>;
  logs: FakeLog[];
}): AiLogExportScopeStore<FakeLog> & {
  matchQueries: Array<{ experimentId: string }>;
  logQueries: Array<number[] | undefined>;
} {
  const matchQueries: Array<{ experimentId: string }> = [];
  const logQueries: Array<number[] | undefined> = [];
  return {
    matchQueries,
    logQueries,
    async getAllMatches(params) {
      matchQueries.push(params);
      return (input.matchesByExperiment[params.experimentId] ?? []).map(
        (id) => ({ id }),
      );
    },
    async getAllAiCallLogs(matchIds) {
      logQueries.push(matchIds);
      if (matchIds === undefined) return input.logs;
      return input.logs.filter(
        (log) => matchIds.includes(log.matchId),
      );
    },
  };
}

async function main(): Promise<void> {
  equal(parseOptionalExperimentId(undefined), undefined);
  equal(parseOptionalExperimentId("  experiment-a  "), "experiment-a");
  for (const invalid of ["", "   ", ["experiment-a"], { id: "a" }, 1, null]) {
    try {
      parseOptionalExperimentId(invalid);
      throw new Error("invalid experimentId was accepted");
    } catch (error) {
      strictEqual(error instanceof ExportQueryError, true);
    }
  }

  const allStore = fakeStore({
    matchesByExperiment: {},
    logs: [
      { id: "visible-a", matchId: 1 },
      { id: "out-of-scope-sentinel", matchId: 999 },
    ],
  });
  const unfiltered = await loadAiLogsForExport(undefined, allStore);
  equal(unfiltered.experimentId, undefined);
  equal(unfiltered.matchIds, undefined);
  deepStrictEqual(
    unfiltered.logs.map((log) => log.id),
    ["visible-a", "out-of-scope-sentinel"],
  );
  deepStrictEqual(allStore.matchQueries, []);
  deepStrictEqual(allStore.logQueries, [undefined]);

  const scopedStore = fakeStore({
    matchesByExperiment: { "experiment-a": [1, 2] },
    logs: [
      { id: "visible-a", matchId: 1 },
      { id: "visible-b", matchId: 2 },
      { id: "out-of-scope-sentinel", matchId: 999 },
    ],
  });
  const scoped = await loadAiLogsForExport("experiment-a", scopedStore);
  deepStrictEqual(scoped.matchIds, [1, 2]);
  deepStrictEqual(
    scoped.logs.map((log) => log.id),
    ["visible-a", "visible-b"],
  );
  deepStrictEqual(scopedStore.logQueries, [[1, 2]]);

  const emptyStore = fakeStore({
    matchesByExperiment: {},
    logs: [{ id: "out-of-scope-sentinel", matchId: 999 }],
  });
  const empty = await loadAiLogsForExport("missing", emptyStore);
  deepStrictEqual(empty.matchIds, []);
  deepStrictEqual(empty.logs, []);
  deepStrictEqual(emptyStore.logQueries, [[]]);

  const invalidStore = fakeStore({
    matchesByExperiment: {},
    logs: [{ id: "out-of-scope-sentinel", matchId: 999 }],
  });
  await rejects(
    loadAiLogsForExport(["repeated", "filter"], invalidStore),
    ExportQueryError,
  );
  deepStrictEqual(invalidStore.matchQueries, []);
  deepStrictEqual(invalidStore.logQueries, []);

  console.log("export filter scope checks passed (22 assertions)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
