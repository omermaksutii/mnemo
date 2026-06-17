import { Mnemo, discoverPlugins, type MnemoPlugin } from '@mnemo-mcp/core';

let cached: MnemoPlugin[] | null = null;

/** Discover plugins once per process (from the cwd package.json `mnemo` key). */
export async function loadPlugins(): Promise<MnemoPlugin[]> {
  if (cached) return cached;
  // Opt-out for users who do not want third-party code loaded.
  if (process.env.MNEMO_NO_PLUGINS === '1') return (cached = []);
  cached = await discoverPlugins({ cwd: process.cwd() });
  return cached;
}

/** Open the Mnemo engine with the standard env wiring and discovered plugins. */
export async function openEngine(opts: { dataDir?: string } = {}): Promise<Mnemo> {
  const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
  const plugins = await loadPlugins();
  return Mnemo.open({ dataDir: opts.dataDir, embedderType, plugins });
}
