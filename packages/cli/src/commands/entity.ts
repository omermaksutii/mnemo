import type { Command } from 'commander';
import { Mnemo, projectHashOf, RELATION_KINDS, type MemoryScope, type RelationKind } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { writeJsonResult } from '../json-mode.js';

type ScopeOpts = { global?: boolean; team?: boolean; dataDir?: string };

function scopeFromOpts(opts: { global?: boolean; team?: boolean }): MemoryScope {
  if (opts.team) return 'team';
  if (opts.global) return 'global';
  return 'project';
}

function projectHashFor(scope: MemoryScope): string | null {
  return scope === 'project' ? projectHashOf(process.cwd()) : null;
}

function open(opts: { dataDir?: string }) {
  const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
  return Mnemo.open({ dataDir: opts.dataDir, embedderType });
}

/**
 * `mnemo entity` — the knowledge-graph surface (v2.1). Entities are named things
 * (services, modules, concepts); memories attach to them and entities relate to
 * each other so you can ask "everything we know about X" and "what depends on X".
 */
export function registerEntity(program: Command): void {
  const entity = program
    .command('entity')
    .description('Knowledge graph: entities, relations, and "what depends on X"');

  // --- create ---
  entity
    .command('create <name>')
    .description('Create or update an entity')
    .option('-t, --type <type>', 'Classifier, e.g. service | module | concept')
    .option('-d, --description <text>', 'One-line description')
    .option('-g, --global', 'Global scope', false)
    .option('--team', 'Team scope', false)
    .option('--data-dir <path>', 'Data directory override')
    .action(async (name: string, opts: ScopeOpts & { type?: string; description?: string }) => {
      const m = await open(opts);
      try {
        const scope = scopeFromOpts(opts);
        const e = await m.createEntity({
          name,
          type: opts.type,
          description: opts.description,
          scope,
          projectHash: projectHashFor(scope),
        });
        if (writeJsonResult(e)) return;
        console.log(chalk.green('entity'), chalk.cyan(e.name), chalk.dim(`(${e.type ?? 'untyped'}, ${e.scope})`));
      } finally {
        await m.close();
      }
    });

  // --- link (relation) ---
  entity
    .command('link <from> <kind> <to>')
    .description(`Relate two entities: kind ∈ {${RELATION_KINDS.join(', ')}}`)
    .option('-g, --global', 'Global scope', false)
    .option('--team', 'Team scope', false)
    .option('--data-dir <path>', 'Data directory override')
    .action(async (from: string, kind: string, to: string, opts: ScopeOpts) => {
      const m = await open(opts);
      try {
        if (!RELATION_KINDS.includes(kind as RelationKind)) {
          if (writeJsonResult({ error: 'bad_kind', kind, allowed: RELATION_KINDS })) return;
          console.error(chalk.red(`invalid kind "${kind}". Allowed: ${RELATION_KINDS.join(', ')}`));
          process.exitCode = 2;
          return;
        }
        const scope = scopeFromOpts(opts);
        const rel = await m.relate(from, kind as RelationKind, to, { scope, projectHash: projectHashFor(scope) });
        if (writeJsonResult(rel)) return;
        console.log(chalk.green('linked'), chalk.cyan(from), chalk.dim(kind), chalk.cyan(to));
      } finally {
        await m.close();
      }
    });

  // --- attach a memory to an entity ---
  entity
    .command('attach <memoryId> <name>')
    .description('Attach a memory (id or 8-char prefix) to an entity')
    .option('-g, --global', 'Global scope', false)
    .option('--team', 'Team scope', false)
    .option('--data-dir <path>', 'Data directory override')
    .action(async (memoryId: string, name: string, opts: ScopeOpts) => {
      const m = await open(opts);
      try {
        const all = await m.list({ includeExpired: true });
        const match = all.find(r => r.id === memoryId || r.id.startsWith(memoryId));
        if (!match) {
          if (writeJsonResult({ error: 'not_found', memoryId })) return;
          console.error(chalk.yellow(`no memory matches "${memoryId}"`));
          process.exitCode = 1;
          return;
        }
        const scope = scopeFromOpts(opts);
        const e = await m.attachMemory(match.id, name, { scope, projectHash: projectHashFor(scope) });
        if (writeJsonResult({ memoryId: match.id, entity: e.name })) return;
        console.log(chalk.green('attached'), chalk.dim(match.id.slice(0, 8)), '→', chalk.cyan(e.name));
      } finally {
        await m.close();
      }
    });

  // --- list ---
  entity
    .command('list')
    .description('List entities')
    .option('-s, --scope <scope>', 'project | global | team')
    .option('-t, --type <type>', 'Filter by type')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (opts: { scope?: MemoryScope; type?: string; dataDir?: string }) => {
      const m = await open(opts);
      try {
        const list = await m.listEntities({ scope: opts.scope, type: opts.type });
        if (writeJsonResult(list)) return;
        if (list.length === 0) {
          console.log(chalk.dim('no entities yet — try `mnemo entity create`'));
          return;
        }
        for (const e of list) {
          console.log(`${chalk.cyan(e.name)}  ${chalk.dim(e.type ?? 'untyped')}  ${chalk.dim(e.scope)}`);
          if (e.description) console.log(`  ${e.description}`);
        }
      } finally {
        await m.close();
      }
    });

  // --- show (entity context) ---
  entity
    .command('show <name>')
    .description('Show everything known about an entity: memories + relations')
    .option('--depends', 'Also list what (transitively) depends on this entity', false)
    .option('--data-dir <path>', 'Data directory override')
    .action(async (name: string, opts: { depends?: boolean; dataDir?: string }) => {
      const m = await open(opts);
      try {
        const ctx = await m.entityContext(name);
        if (!ctx) {
          if (writeJsonResult({ error: 'not_found', name })) return;
          console.error(chalk.yellow(`no entity named "${name}"`));
          process.exitCode = 1;
          return;
        }
        const dependents = opts.depends ? await m.whatDependsOn(name) : [];
        if (writeJsonResult({ ...ctx, dependents })) return;

        console.log(chalk.bold(chalk.cyan(ctx.entity.name)), chalk.dim(`(${ctx.entity.type ?? 'untyped'}, ${ctx.entity.scope})`));
        if (ctx.entity.description) console.log(ctx.entity.description);
        if (ctx.relations.length) {
          console.log('');
          console.log(chalk.bold('relations'));
          for (const r of ctx.relations) {
            const arrow = r.direction === 'out' ? '→' : '←';
            console.log(`  ${arrow} ${chalk.dim(r.relation.kind)} ${chalk.cyan(r.entity.name)}`);
          }
        }
        if (ctx.memories.length) {
          console.log('');
          console.log(chalk.bold(`memories (${ctx.memories.length})`));
          for (const mem of ctx.memories) console.log(`  ${chalk.dim(mem.id.slice(0, 8))} ${mem.content}`);
        }
        if (opts.depends) {
          console.log('');
          console.log(chalk.bold('depends on this'));
          if (dependents.length === 0) console.log(chalk.dim('  (nothing)'));
          for (const d of dependents) console.log(`  ${chalk.cyan(d.name)}`);
        }
      } finally {
        await m.close();
      }
    });

  // --- delete ---
  entity
    .command('delete <name>')
    .alias('rm')
    .description('Delete an entity and its relations')
    .option('--data-dir <path>', 'Data directory override')
    .action(async (name: string, opts: { dataDir?: string }) => {
      const m = await open(opts);
      try {
        const ok = await m.deleteEntity(name);
        if (writeJsonResult({ deleted: ok, name })) return;
        if (!ok) {
          console.error(chalk.yellow(`no entity named "${name}"`));
          process.exitCode = 1;
          return;
        }
        console.log(chalk.green('deleted'), chalk.cyan(name));
      } finally {
        await m.close();
      }
    });
}
