export async function runBoundedSettledPool<T>(
  tasks: Array<() => Promise<T>>,
  maxConcurrency: number,
): Promise<Array<PromiseSettledResult<T>>> {
  const concurrency = Math.max(1, Math.floor(maxConcurrency));
  const results: Array<PromiseSettledResult<T>> = new Array(tasks.length);
  const running = new Map<number, Promise<void>>();
  let nextIndex = 0;

  const launch = (taskIndex: number) => {
    const promise = tasks[taskIndex]().then(
      (value) => {
        results[taskIndex] = { status: "fulfilled", value };
      },
      (reason) => {
        results[taskIndex] = { status: "rejected", reason };
      },
    ).finally(() => {
      running.delete(taskIndex);
    });

    running.set(taskIndex, promise);
  };

  while (nextIndex < tasks.length || running.size > 0) {
    while (running.size < concurrency && nextIndex < tasks.length) {
      launch(nextIndex);
      nextIndex += 1;
    }

    if (running.size > 0) {
      await Promise.race(Array.from(running.values()));
    }
  }

  return results;
}
