/**
 * Side-effect-free application logging.
 *
 * Runtime modules import this file instead of server/index.ts so importing
 * research code cannot start Express or resume interrupted jobs.
 */
export function log(message: string, source = "express"): void {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}
