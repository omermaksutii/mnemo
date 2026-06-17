import { runReflection, type ReflectPayload } from './reflect.js';

/** SubagentStop hook: capture lessons from a spawned agent that hit failures. */
export async function runSubagentStop(payload: ReflectPayload): Promise<string> {
  return runReflection(payload, 'subagent');
}
