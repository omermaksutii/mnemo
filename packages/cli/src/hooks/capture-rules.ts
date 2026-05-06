const AUTO_CAPTURE_PATTERNS: RegExp[] = [
  /(^|\/)CLAUDE\.md$/i,
  /(^|\/)AGENTS\.md$/i,
  /(^|\/)GEMINI\.md$/i,
  /\.adr\.md$/i,
  /(^|\/)docs\/decisions\//i,
  /(^|\/)docs\/adr\//i,
];

export function shouldAutoCapture(filePath: string): boolean {
  return AUTO_CAPTURE_PATTERNS.some(p => p.test(filePath));
}

export function snippet(content: string, maxLen = 500): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen) + '…';
}
