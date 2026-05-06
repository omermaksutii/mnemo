/**
 * Detects obvious secrets in proposed memory content. Conservative — favors
 * letting things through over false positives. The goal is to prevent the
 * "Mnemo just stored my GitHub token" failure mode.
 */

export type SecretMatch = {
  kind: string;
  /** Redacted snippet showing the match without leaking the secret. */
  preview: string;
};

const PATTERNS: Array<{ kind: string; re: RegExp }> = [
  { kind: 'github-token-classic', re: /\bghp_[A-Za-z0-9]{36,}\b/ },
  { kind: 'github-token-fine', re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { kind: 'github-oauth', re: /\bgho_[A-Za-z0-9]{36,}\b/ },
  { kind: 'npm-token', re: /\bnpm_[A-Za-z0-9]{36,}\b/ },
  { kind: 'aws-access-key', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { kind: 'aws-secret-key', re: /\b[A-Za-z0-9/+=]{40}\b(?=.*aws|.*secret)/i },
  { kind: 'openai-key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { kind: 'anthropic-key', re: /\bsk-ant-(?:api03-|admin01-)?[A-Za-z0-9_-]{30,}\b/ },
  { kind: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { kind: 'stripe-key', re: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{24,}\b/ },
  { kind: 'jwt', re: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{10,}\b/ },
  { kind: 'private-key-block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
];

export function detectSecrets(content: string): SecretMatch[] {
  const out: SecretMatch[] = [];
  for (const { kind, re } of PATTERNS) {
    const m = re.exec(content);
    if (m) out.push({ kind, preview: redact(m[0]) });
  }
  return out;
}

export function hasSecrets(content: string): boolean {
  return detectSecrets(content).length > 0;
}

function redact(s: string): string {
  if (s.length <= 8) return '*'.repeat(s.length);
  return s.slice(0, 4) + '…' + '*'.repeat(Math.min(8, s.length - 8)) + '…' + s.slice(-2);
}
