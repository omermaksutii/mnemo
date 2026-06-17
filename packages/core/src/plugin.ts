import type { Embedder } from './embedder.js';
import type { MemoryChannel, MemoryRecord } from './types.js';

/**
 * Plug-in framework (v2.4). Other developers extend Mnemo with custom embedders,
 * rankers, capture rules, and hook handlers. Plugins are discovered from the
 * `mnemo` key in a package.json (or an explicit list) and follow the
 * `@mnemo-mcp/plugin-*` / `mnemo-plugin-*` naming convention.
 *
 * A plugin module exports either a default factory or a named `mnemoPlugin`
 * factory returning a {@link MnemoPlugin}.
 */

/** A ranking function: higher is better. `now` is injected for determinism. */
export type RankerFn = (similarity: number, rec: MemoryRecord, now: number) => number;

/** An auto-capture rule for file watching / post-edit hooks. */
export type CaptureRule = {
  match: (filePath: string) => boolean;
  channel?: MemoryChannel;
};

export type MnemoPlugin = {
  name: string;
  /** Provide a custom embedder. First plugin to provide one wins. */
  embedder?: (opts: { dataDir: string }) => Promise<Embedder> | Embedder;
  /** Override the default composite ranking score. First plugin to provide one wins. */
  ranker?: RankerFn;
  /** Extra auto-capture rules, merged across plugins. */
  captureRules?: CaptureRule[];
  /** Named hook handlers, merged across plugins (later plugins override on name clash). */
  hooks?: Record<string, (payload: Record<string, unknown>) => Promise<string> | string>;
};

export type PluginFactory = () => MnemoPlugin | Promise<MnemoPlugin>;

export type DiscoverOpts = {
  /** Directory whose package.json `mnemo.plugins` is read. Default: process.cwd(). */
  cwd?: string;
  /** Explicit plugin specifiers; bypasses manifest discovery when provided. */
  plugins?: string[];
  /** Injectable module importer (for tests). Default: dynamic import. */
  importer?: (spec: string) => Promise<unknown>;
  /** Injectable manifest reader (for tests). Default: read+parse package.json. */
  readManifest?: (cwd: string) => Promise<Record<string, unknown> | null>;
};

const PLUGIN_NAME_RE = /^(@mnemo-mcp\/plugin-|mnemo-plugin-)/;

async function defaultReadManifest(cwd: string): Promise<Record<string, unknown> | null> {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  try {
    return JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** Plugin specifiers declared in a manifest: the `mnemo.plugins` list plus any
 * dependency that matches the plugin naming convention. */
export function pluginSpecsFromManifest(manifest: Record<string, unknown> | null): string[] {
  if (!manifest) return [];
  const out = new Set<string>();
  const mnemoKey = manifest.mnemo as { plugins?: unknown } | undefined;
  if (mnemoKey && Array.isArray(mnemoKey.plugins)) {
    for (const p of mnemoKey.plugins) if (typeof p === 'string') out.add(p);
  }
  for (const field of ['dependencies', 'devDependencies'] as const) {
    const deps = manifest[field] as Record<string, string> | undefined;
    if (!deps) continue;
    for (const dep of Object.keys(deps)) if (PLUGIN_NAME_RE.test(dep)) out.add(dep);
  }
  return [...out];
}

function resolveFactory(mod: unknown): PluginFactory | null {
  if (!mod || typeof mod !== 'object') return typeof mod === 'function' ? (mod as PluginFactory) : null;
  const m = mod as Record<string, unknown>;
  const candidate = m.default ?? m.mnemoPlugin;
  return typeof candidate === 'function' ? (candidate as PluginFactory) : null;
}

/** Discover and instantiate plugins. Failures are skipped, never thrown. */
export async function discoverPlugins(opts: DiscoverOpts = {}): Promise<MnemoPlugin[]> {
  const importer = opts.importer ?? ((spec: string) => import(spec));
  const readManifest = opts.readManifest ?? defaultReadManifest;
  let specs = opts.plugins;
  if (!specs) {
    const manifest = await readManifest(opts.cwd ?? process.cwd());
    specs = pluginSpecsFromManifest(manifest);
  }
  const plugins: MnemoPlugin[] = [];
  for (const spec of specs) {
    try {
      const mod = await importer(spec);
      const factory = resolveFactory(mod);
      if (!factory) continue;
      const plugin = await factory();
      if (plugin && typeof plugin.name === 'string') plugins.push(plugin);
    } catch {
      // A broken plugin must never break Mnemo. Skip it.
    }
  }
  return plugins;
}

/** Collapse a plugin list into the effective extension points. */
export function composePlugins(plugins: MnemoPlugin[]): {
  embedder?: MnemoPlugin['embedder'];
  ranker?: RankerFn;
  captureRules: CaptureRule[];
  hooks: Record<string, (payload: Record<string, unknown>) => Promise<string> | string>;
} {
  let embedder: MnemoPlugin['embedder'];
  let ranker: RankerFn | undefined;
  const captureRules: CaptureRule[] = [];
  const hooks: Record<string, (payload: Record<string, unknown>) => Promise<string> | string> = {};
  for (const p of plugins) {
    if (!embedder && p.embedder) embedder = p.embedder;
    if (!ranker && p.ranker) ranker = p.ranker;
    if (p.captureRules) captureRules.push(...p.captureRules);
    if (p.hooks) Object.assign(hooks, p.hooks);
  }
  return { embedder, ranker, captureRules, hooks };
}
