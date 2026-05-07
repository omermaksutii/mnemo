import type { MemoryRecord, MemoryScope, Procedure } from './types.js';

export type RecordProcedureInput = {
  name: string;
  description: string;
  steps: string[];
  scope?: MemoryScope;
  projectHash?: string | null;
};

const PROCEDURE_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export function validateProcedureName(name: string): void {
  if (!PROCEDURE_NAME_RE.test(name)) {
    throw new Error(
      `invalid procedure name "${name}": must be kebab-case (a-z, 0-9, -)`,
    );
  }
}

export function procedureToContent(input: RecordProcedureInput): string {
  const lines: string[] = [`# procedure: ${input.name}`, '', input.description.trim(), ''];
  input.steps.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.trim()}`);
  });
  return lines.join('\n').trim();
}

export function procedureFromRecord(rec: MemoryRecord): Procedure | null {
  if (rec.channel !== 'procedure') return null;
  const meta = rec.metadata as Partial<Procedure> | null;
  if (!meta || typeof meta.name !== 'string' || !Array.isArray(meta.steps)) return null;
  return {
    name: meta.name,
    description: meta.description ?? '',
    steps: meta.steps as string[],
    runs: meta.runs ?? 0,
    successes: meta.successes ?? 0,
    failures: meta.failures ?? 0,
    memoryId: rec.id,
    scope: rec.scope,
  };
}

export function procedureMetadata(input: RecordProcedureInput): Record<string, unknown> {
  return {
    name: input.name,
    description: input.description,
    steps: input.steps,
    runs: 0,
    successes: 0,
    failures: 0,
  };
}
