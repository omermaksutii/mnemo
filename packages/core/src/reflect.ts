/**
 * Self-reflective learning (v2.2). Scans a session/agent transcript for signals
 * that something went wrong — failed tests, errors, type-check failures, reverts
 * — so Mnemo can capture an *anti-pattern* memory ("last time we tried X it
 * failed with Y"). Pure string analysis: the hook reads the transcript file and
 * passes its text here, which keeps this trivially testable.
 */

export type FailureKind =
  | 'test-failure'
  | 'error'
  | 'type-error'
  | 'build-failure'
  | 'revert';

export type FailureSignal = {
  kind: FailureKind;
  /** A representative line, trimmed and length-capped. */
  evidence: string;
};

const PATTERNS: { kind: FailureKind; re: RegExp }[] = [
  { kind: 'test-failure', re: /\b\d+\s+(?:failed|failing)\b|\bFAIL\b|AssertionError|tests?\s+failed/i },
  { kind: 'type-error', re: /error\s+TS\d{4}\b|\bTS\d{4}:/ },
  { kind: 'build-failure', re: /\b(?:build|compilation)\s+failed\b/i },
  { kind: 'revert', re: /\bgit revert\b|\breverted\b|\brolled?\s+back\b/i },
  { kind: 'error', re: /Traceback \(most recent call last\)|^\s*panic:|\bUnhandled\b|\bError:\s|\bException\b/m },
];

const MAX_EVIDENCE = 200;

/** Detect distinct failure kinds with one piece of evidence each. */
export function detectFailures(text: string): FailureSignal[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const found = new Map<FailureKind, string>();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    for (const { kind, re } of PATTERNS) {
      if (found.has(kind)) continue;
      if (re.test(line)) {
        found.set(kind, line.length > MAX_EVIDENCE ? line.slice(0, MAX_EVIDENCE) + '…' : line);
      }
    }
  }
  return [...found.entries()].map(([kind, evidence]) => ({ kind, evidence }));
}

/** A one-paragraph anti-pattern summary suitable for storing as a memory. */
export function summarizeFailures(signals: FailureSignal[], context?: string): string {
  if (signals.length === 0) return '';
  const kinds = signals.map(s => s.kind).join(', ');
  const head = context
    ? `Anti-pattern while "${context}": ended with ${kinds}.`
    : `Anti-pattern: session ended with ${kinds}.`;
  const evidence = signals.map(s => `- [${s.kind}] ${s.evidence}`).join('\n');
  return `${head}\n${evidence}`;
}
