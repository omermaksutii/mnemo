import initSqlJs, { type Database } from 'sql.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type { Entity, MemoryChannel, MemoryRecord, MemoryScope, MemorySource, Relation, RelationKind, UpdateInput } from './types.js';
import { decryptBytes, encryptBytes, isEncrypted, resolveEncryptionKey } from './crypto.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  project_hash TEXT,
  source TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at INTEGER NOT NULL,
  expires_at INTEGER,
  channel TEXT,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_scope_project ON memories(scope, project_hash);
CREATE INDEX IF NOT EXISTS idx_updated ON memories(updated_at);
CREATE INDEX IF NOT EXISTS idx_expires ON memories(expires_at);
CREATE INDEX IF NOT EXISTS idx_channel ON memories(channel);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  scope TEXT NOT NULL,
  project_hash TEXT,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_name ON entities(scope, project_hash, name);

CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rel_from ON relations(from_id);
CREATE INDEX IF NOT EXISTS idx_rel_to ON relations(to_id);

CREATE TABLE IF NOT EXISTS memory_entities (
  memory_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  PRIMARY KEY (memory_id, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_me_entity ON memory_entities(entity_id);
`;

export type StoreCounts = {
  total: number;
  byScope: Record<MemoryScope, number>;
  byChannel: Record<string, number>;
  expired: number;
  neverRecalled: number;
};

export type StoreListFilter = {
  scope?: MemoryScope;
  projectHash?: string | null;
  source?: MemorySource | MemorySource[];
  channel?: MemoryChannel | MemoryChannel[];
  tags?: string[];
  limit?: number;
  since?: number;
  includeExpired?: boolean;
};

let cachedSqlPromise: Promise<typeof import('sql.js').default> | null = null;

function locateSqlAsset(file: string): string {
  // Use Node's resolution from our own module location — works regardless of how
  // the consumer hoists @mnemo-mcp/core, sql.js, and friends in node_modules.
  const require = createRequire(import.meta.url);
  try {
    // sql.js exposes its package.json so we can find dist/ deterministically.
    const pkgPath = require.resolve('sql.js/package.json');
    const candidate = join(dirname(pkgPath), 'dist', file);
    if (existsSync(candidate)) return candidate;
  } catch {
    // fall through to relative scan
  }

  // Fallback: walk up from our own dir looking for any node_modules/sql.js/dist/<file>
  let cursor = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const c = join(cursor, 'node_modules', 'sql.js', 'dist', file);
    if (existsSync(c)) return c;
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return file;
}

function loadSql() {
  if (!cachedSqlPromise) {
    cachedSqlPromise = initSqlJs({
      locateFile: locateSqlAsset,
    }) as unknown as Promise<typeof import('sql.js').default>;
  }
  return cachedSqlPromise;
}

export class Store {
  private constructor(
    private db: Database,
    private path: string,
    private encryptionKey: string | null,
  ) {}

  static async open(path: string, opts: { encryptionKey?: string } = {}): Promise<Store> {
    const SQL = (await loadSql()) as unknown as { Database: new (data?: Uint8Array) => Database };
    const encryptionKey = resolveEncryptionKey(opts.encryptionKey);
    let db: Database;
    let isFresh = false;
    if (existsSync(path)) {
      let bytes: Uint8Array = await readFile(path);
      if (isEncrypted(bytes)) {
        if (!encryptionKey) {
          throw new Error(
            'memory.db is encrypted but no MNEMO_ENCRYPTION_KEY is set',
          );
        }
        bytes = decryptBytes(bytes, encryptionKey);
      }
      db = new SQL.Database(new Uint8Array(bytes));
    } else {
      await mkdir(dirname(path), { recursive: true });
      db = new SQL.Database();
      isFresh = true;
    }
    db.exec(SCHEMA);
    // Best-effort migrations for legacy dbs:
    try { db.exec('ALTER TABLE memories ADD COLUMN expires_at INTEGER'); } catch {}
    try { db.exec('ALTER TABLE memories ADD COLUMN channel TEXT'); } catch {}
    try { db.exec('ALTER TABLE memories ADD COLUMN metadata TEXT'); } catch {}
    const store = new Store(db, path, encryptionKey);
    if (isFresh) await store.flush();
    return store;
  }

  async upsert(rec: MemoryRecord): Promise<void> {
    this.db.run(
      `INSERT INTO memories
       (id, scope, project_hash, source, content, tags, created_at, updated_at, access_count, last_accessed_at, expires_at, channel, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         scope=excluded.scope,
         project_hash=excluded.project_hash,
         source=excluded.source,
         content=excluded.content,
         tags=excluded.tags,
         updated_at=excluded.updated_at,
         expires_at=excluded.expires_at,
         channel=excluded.channel,
         metadata=excluded.metadata`,
      [
        rec.id,
        rec.scope,
        rec.projectHash,
        rec.source,
        rec.content,
        JSON.stringify(rec.tags),
        rec.createdAt,
        rec.updatedAt,
        rec.accessCount,
        rec.lastAccessedAt,
        rec.expiresAt,
        rec.channel,
        rec.metadata == null ? null : JSON.stringify(rec.metadata),
      ],
    );
    await this.flush();
  }

  async update(id: string, fields: UpdateInput): Promise<MemoryRecord | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const next: MemoryRecord = {
      ...existing,
      content: fields.content ?? existing.content,
      tags: fields.tags ?? existing.tags,
      scope: fields.scope ?? existing.scope,
      projectHash: fields.projectHash !== undefined ? fields.projectHash : existing.projectHash,
      expiresAt: fields.expiresAt !== undefined ? fields.expiresAt : existing.expiresAt,
      channel: fields.channel !== undefined ? fields.channel : existing.channel,
      metadata: fields.metadata !== undefined ? fields.metadata : existing.metadata,
      updatedAt: Date.now(),
    };
    await this.upsert(next);
    return next;
  }

  async get(id: string): Promise<MemoryRecord | null> {
    const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject();
    stmt.free();
    return this.fromRow(row);
  }

  async delete(id: string): Promise<void> {
    this.db.run('DELETE FROM memories WHERE id = ?', [id]);
    await this.flush();
  }

  async list(filter: StoreListFilter = {}): Promise<MemoryRecord[]> {
    const where: string[] = [];
    const args: unknown[] = [];
    if (filter.scope) {
      where.push('scope = ?');
      args.push(filter.scope);
    }
    if (filter.projectHash !== undefined) {
      if (filter.projectHash === null) {
        where.push('project_hash IS NULL');
      } else {
        where.push('project_hash = ?');
        args.push(filter.projectHash);
      }
    }
    if (filter.since) {
      where.push('updated_at >= ?');
      args.push(filter.since);
    }
    if (filter.source) {
      const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
      where.push(`source IN (${sources.map(() => '?').join(',')})`);
      args.push(...sources);
    }
    if (filter.channel) {
      const chans = Array.isArray(filter.channel) ? filter.channel : [filter.channel];
      where.push(`channel IN (${chans.map(() => '?').join(',')})`);
      args.push(...chans);
    }
    if (!filter.includeExpired) {
      where.push('(expires_at IS NULL OR expires_at > ?)');
      args.push(Date.now());
    }
    const sql = `SELECT * FROM memories ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC ${filter.limit ? 'LIMIT ' + Number(filter.limit) : ''}`;
    const stmt = this.db.prepare(sql);
    if (args.length) stmt.bind(args as never);
    let rows: MemoryRecord[] = [];
    while (stmt.step()) rows.push(this.fromRow(stmt.getAsObject()));
    stmt.free();
    if (filter.tags && filter.tags.length) {
      const required = filter.tags;
      rows = rows.filter(r => required.every(t => r.tags.includes(t)));
    }
    return rows;
  }

  async count(): Promise<StoreCounts> {
    const stmt = this.db.prepare('SELECT scope, COUNT(*) as n FROM memories GROUP BY scope');
    const byScope: Record<MemoryScope, number> = { project: 0, global: 0, team: 0 };
    let total = 0;
    while (stmt.step()) {
      const row = stmt.getAsObject() as { scope: MemoryScope; n: number };
      byScope[row.scope] = row.n;
      total += row.n;
    }
    stmt.free();
    const expStmt = this.db.prepare('SELECT COUNT(*) as n FROM memories WHERE expires_at IS NOT NULL AND expires_at <= ?');
    expStmt.bind([Date.now()]);
    let expired = 0;
    if (expStmt.step()) expired = Number((expStmt.getAsObject() as { n: number }).n);
    expStmt.free();
    const chanStmt = this.db.prepare(`SELECT channel, COUNT(*) as n FROM memories WHERE channel IS NOT NULL GROUP BY channel`);
    const byChannel: Record<string, number> = {};
    while (chanStmt.step()) {
      const row = chanStmt.getAsObject() as { channel: string; n: number };
      byChannel[row.channel] = Number(row.n);
    }
    chanStmt.free();
    const ncStmt = this.db.prepare('SELECT COUNT(*) as n FROM memories WHERE access_count = 0');
    let neverRecalled = 0;
    if (ncStmt.step()) neverRecalled = Number((ncStmt.getAsObject() as { n: number }).n);
    ncStmt.free();
    return { total, byScope, byChannel, expired, neverRecalled };
  }

  async bumpAccess(id: string): Promise<void> {
    const now = Date.now();
    this.db.run(
      'UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?',
      [now, id],
    );
    await this.flush();
  }

  // ---------- knowledge graph (v2.1) ----------

  async upsertEntity(e: Entity): Promise<void> {
    this.db.run(
      `INSERT INTO entities (id, name, type, scope, project_hash, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, type=excluded.type, scope=excluded.scope,
         project_hash=excluded.project_hash, description=excluded.description,
         updated_at=excluded.updated_at`,
      [e.id, e.name, e.type, e.scope, e.projectHash, e.description, e.createdAt, e.updatedAt],
    );
    await this.flush();
  }

  async getEntity(id: string): Promise<Entity | null> {
    const stmt = this.db.prepare('SELECT * FROM entities WHERE id = ?');
    stmt.bind([id]);
    const got = stmt.step() ? entityFromRow(stmt.getAsObject()) : null;
    stmt.free();
    return got;
  }

  async getEntityByName(name: string, scope?: MemoryScope, projectHash?: string | null): Promise<Entity | null> {
    const where = ['name = ?'];
    const args: unknown[] = [name];
    if (scope) { where.push('scope = ?'); args.push(scope); }
    if (projectHash !== undefined) {
      if (projectHash === null) where.push('project_hash IS NULL');
      else { where.push('project_hash = ?'); args.push(projectHash); }
    }
    const stmt = this.db.prepare(`SELECT * FROM entities WHERE ${where.join(' AND ')} LIMIT 1`);
    stmt.bind(args as never);
    const got = stmt.step() ? entityFromRow(stmt.getAsObject()) : null;
    stmt.free();
    return got;
  }

  async listEntities(filter: { scope?: MemoryScope; projectHash?: string | null; type?: string } = {}): Promise<Entity[]> {
    const where: string[] = [];
    const args: unknown[] = [];
    if (filter.scope) { where.push('scope = ?'); args.push(filter.scope); }
    if (filter.projectHash !== undefined) {
      if (filter.projectHash === null) where.push('project_hash IS NULL');
      else { where.push('project_hash = ?'); args.push(filter.projectHash); }
    }
    if (filter.type) { where.push('type = ?'); args.push(filter.type); }
    const stmt = this.db.prepare(
      `SELECT * FROM entities ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name ASC`,
    );
    if (args.length) stmt.bind(args as never);
    const out: Entity[] = [];
    while (stmt.step()) out.push(entityFromRow(stmt.getAsObject()));
    stmt.free();
    return out;
  }

  async deleteEntity(id: string): Promise<void> {
    this.db.run('DELETE FROM entities WHERE id = ?', [id]);
    this.db.run('DELETE FROM relations WHERE from_id = ? OR to_id = ?', [id, id]);
    this.db.run('DELETE FROM memory_entities WHERE entity_id = ?', [id]);
    await this.flush();
  }

  async addRelation(r: Relation): Promise<void> {
    this.db.run(
      `INSERT INTO relations (id, from_id, to_id, kind, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [r.id, r.fromId, r.toId, r.kind, r.createdAt],
    );
    await this.flush();
  }

  async removeRelation(id: string): Promise<void> {
    this.db.run('DELETE FROM relations WHERE id = ?', [id]);
    await this.flush();
  }

  /** Relations touching an entity, in either direction. */
  async relationsFor(entityId: string): Promise<Relation[]> {
    const stmt = this.db.prepare('SELECT * FROM relations WHERE from_id = ? OR to_id = ?');
    stmt.bind([entityId, entityId]);
    const out: Relation[] = [];
    while (stmt.step()) out.push(relationFromRow(stmt.getAsObject()));
    stmt.free();
    return out;
  }

  async linkMemoryToEntity(memoryId: string, entityId: string): Promise<void> {
    this.db.run(
      'INSERT INTO memory_entities (memory_id, entity_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
      [memoryId, entityId],
    );
    await this.flush();
  }

  async memoriesForEntity(entityId: string): Promise<MemoryRecord[]> {
    const stmt = this.db.prepare(
      `SELECT m.* FROM memories m JOIN memory_entities me ON m.id = me.memory_id
       WHERE me.entity_id = ? ORDER BY m.updated_at DESC`,
    );
    stmt.bind([entityId]);
    const out: MemoryRecord[] = [];
    while (stmt.step()) out.push(this.fromRow(stmt.getAsObject()));
    stmt.free();
    return out;
  }

  async entitiesForMemory(memoryId: string): Promise<Entity[]> {
    const stmt = this.db.prepare(
      `SELECT e.* FROM entities e JOIN memory_entities me ON e.id = me.entity_id
       WHERE me.memory_id = ? ORDER BY e.name ASC`,
    );
    stmt.bind([memoryId]);
    const out: Entity[] = [];
    while (stmt.step()) out.push(entityFromRow(stmt.getAsObject()));
    stmt.free();
    return out;
  }

  async flush(): Promise<void> {
    const data = this.db.export();
    const payload = this.encryptionKey
      ? encryptBytes(data, this.encryptionKey)
      : Buffer.from(data);
    await writeFile(this.path, payload);
  }

  /** Whether this store is persisting an encrypted envelope. */
  get encrypted(): boolean {
    return this.encryptionKey !== null;
  }

  close(): void {
    this.db.close();
  }

  private fromRow(row: Record<string, unknown>): MemoryRecord {
    return {
      id: String(row.id),
      scope: row.scope as MemoryScope,
      projectHash: (row.project_hash as string | null) ?? null,
      source: row.source as MemoryRecord['source'],
      content: String(row.content),
      tags: JSON.parse(String(row.tags ?? '[]')),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      accessCount: Number(row.access_count),
      lastAccessedAt: Number(row.last_accessed_at),
      expiresAt: row.expires_at == null ? null : Number(row.expires_at),
      channel: (row.channel as MemoryChannel | null) ?? null,
      metadata: row.metadata == null ? null : JSON.parse(String(row.metadata)),
    };
  }
}

function entityFromRow(row: Record<string, unknown>): Entity {
  return {
    id: String(row.id),
    name: String(row.name),
    type: (row.type as string | null) ?? null,
    scope: row.scope as MemoryScope,
    projectHash: (row.project_hash as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function relationFromRow(row: Record<string, unknown>): Relation {
  return {
    id: String(row.id),
    fromId: String(row.from_id),
    toId: String(row.to_id),
    kind: row.kind as RelationKind,
    createdAt: Number(row.created_at),
  };
}
