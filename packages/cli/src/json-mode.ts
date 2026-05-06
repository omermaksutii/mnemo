/**
 * Global --json mode: when MNEMO_JSON=1 is set in the env (set by the root
 * commander option), commands emit machine-readable JSON to stdout instead
 * of human output and skip the rest of their pretty printing.
 */

export function jsonMode(): boolean {
  return process.env.MNEMO_JSON === '1';
}

/**
 * Helper used by commands. If JSON mode is on, prints the payload and
 * returns `true` (caller should bail without further output).
 * Returns `false` in human mode so caller continues with chalk output.
 */
export function writeJsonResult(payload: unknown): boolean {
  if (!jsonMode()) return false;
  process.stdout.write(JSON.stringify(payload) + '\n');
  return true;
}
