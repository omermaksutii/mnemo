import { runReflection, type ReflectPayload } from './reflect.js';

/** Stop hook: capture an anti-pattern when a session ends with failures. */
export async function runStop(payload: ReflectPayload): Promise<string> {
  return runReflection(payload, 'stop');
}
