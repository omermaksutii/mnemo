import type { MemoryChannel } from './types.js';

export type IngestChunk = {
  content: string;
  /** Inferred channel based on heading text or content. */
  channel: MemoryChannel | null;
  /** Heading path that produced this chunk, if any. */
  heading?: string;
};

const CHANNEL_HINTS: Array<{ re: RegExp; channel: MemoryChannel }> = [
  // Order matters: more specific phrases checked first.
  { re: /\b(anti-?pattern|never do|avoid)\b/i, channel: 'anti-pattern' },
  { re: /\b(gotcha|warning|careful|caveat|beware|watch out)\b/i, channel: 'gotcha' },
  { re: /\b(decision|adr|chose to|decided to)\b/i, channel: 'decision' },
  { re: /\b(todo|fixme|hack|note to self)\b/i, channel: 'todo' },
  { re: /\b(convention|always use|prefer|standard|style)\b/i, channel: 'convention' },
];

function inferChannel(content: string): MemoryChannel | null {
  for (const { re, channel } of CHANNEL_HINTS) {
    if (re.test(content)) return channel;
  }
  return null;
}

/**
 * Parse markdown into ingestible chunks. Splits on:
 *   - Top-level (#) and second-level (##) headings → boundaries
 *   - Bullet lists → each bullet becomes a chunk if standalone
 *   - Otherwise falls back to paragraph (double-newline) splits.
 */
export function parseMarkdown(md: string): IngestChunk[] {
  const lines = md.split(/\r?\n/);
  const chunks: IngestChunk[] = [];
  let buf: string[] = [];
  let heading: string | undefined;

  const flush = () => {
    const text = buf.join('\n').trim();
    buf = [];
    if (!text) return;
    // Split into paragraph chunks
    const paras = text.split(/\n{2,}/);
    for (const p of paras) {
      const t = p.trim();
      if (!t) continue;
      if (/^[-*+]\s/.test(t.split('\n')[0]!)) {
        // Bulleted block — split each bullet into its own chunk
        for (const line of t.split(/\n(?=[-*+]\s)/)) {
          const item = line.replace(/^[-*+]\s+/, '').trim();
          if (item.length >= 8) chunks.push({ content: item, channel: inferChannel(item), heading });
        }
      } else if (t.length >= 8) {
        chunks.push({ content: t, channel: inferChannel(t), heading });
      }
    }
  };

  for (const line of lines) {
    const m = /^(#{1,3})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      heading = m[2]!.trim();
      continue;
    }
    buf.push(line);
  }
  flush();
  return chunks;
}

/**
 * Parse plain text. Splits on blank lines. Useful for non-markdown sources.
 */
export function parsePlain(text: string): IngestChunk[] {
  return text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length >= 8)
    .map(p => ({ content: p, channel: inferChannel(p) }));
}
