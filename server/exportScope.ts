export class ExportQueryError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "ExportQueryError";
  }
}

export function parseOptionalExperimentId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ExportQueryError(
      "experimentId must be provided exactly once as a string",
    );
  }
  const experimentId = value.trim();
  if (experimentId.length === 0) {
    throw new ExportQueryError("experimentId must not be blank");
  }
  return experimentId;
}

export interface AiLogExportScopeStore<TLog> {
  getAllMatches(params: { experimentId: string }): Promise<Array<{ id: number }>>;
  getAllAiCallLogs(matchIds?: number[]): Promise<TLog[]>;
}

/**
 * Preserve the semantic difference between an omitted filter (`undefined`,
 * intentionally all logs) and an explicit filter with no matches (`[]`,
 * intentionally no logs).
 */
export async function loadAiLogsForExport<TLog>(
  rawExperimentId: unknown,
  store: AiLogExportScopeStore<TLog>,
): Promise<{
  experimentId: string | undefined;
  matchIds: number[] | undefined;
  logs: TLog[];
}> {
  const experimentId = parseOptionalExperimentId(rawExperimentId);
  const matchIds =
    experimentId === undefined
      ? undefined
      : (await store.getAllMatches({ experimentId })).map((match) => match.id);
  const logs = await store.getAllAiCallLogs(matchIds);
  return { experimentId, matchIds, logs };
}
