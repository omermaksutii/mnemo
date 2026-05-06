import initSqlJs, { type Database } from 'sql.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MemoryRecord, MemoryScope, MemorySource, UpdateInput } from './types.js';

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
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_scope_project ON memories(scope, project_hash);
CREATE INDEX IF NOT EXISTS idx_updated ON memories(updated_at);
CREATE INDEX IF NOT EXISTS idx_expires ON memories(expires_at);
`;

export type StoreCounts = {
  total: number;
  byScope: Record<MemoryScope, number>;
  expired: number;
};

export type StoreListFilter = {
  scope?: MemoryScope;
  projectHash?: string | null;
  source?: MemorySource | MemorySource[];
  tags?: string[];
  limit?: number;
  since?: number;
  includeExpired?: boolean;
};

let cachedSqlPromise: Promise<typeof import('sql.js').default> | null = null;

function loadSql() {
  if (!cachedSqlPromise) {
    const here = dirname(fileURLToPath(import.meta.url));
    cachedSqlPromise = initSqlJs({
      locateFile: (file: string) => {
        const candidates = [
          join(here, '..', '..', '..', 'node_modules', 'sql.js', 'dist', file),
          join(here, '..', '..', 'node_modules', 'sql.js', 'dist', file),
          join(here, '..', 'node_modules', 'sql.js', 'dist', file),
        ];
        for (const c of candidates) if (existsSync(c)) return c;
        return file;
      },
    }) as unknown as Promise<typeof import('sql.js').default>;
  }
  return cachedSqlPromise;
}

export class Store {
  private constructor(
    private db: Database,
    private path: string,
  ) {}

  static async open(path: string): Promise<Store> {
    const SQL = (await loadSql()) as unknown as { Database: new (data?: Uint8Array) => Database };
    let db: Database;
    let isFresh = false;
    if (existsSync(path)) {
      const bytes = await readFile(path);
      db = new SQL.Database(new Uint8Array(bytes));
    } else {
      await mkdir(dirname(path), { recursive: true });
      db = new SQL.Database();
      isFresh = true;
    }
    db.exec(SCHEMA);
    // Best-effort migration for legacy dbs that predate expires_at:
    try {
      db.exec('ALTER TABLE memories ADD COLUMN expires_at INTEGER');
    } catch {
      // column already exists — fine
    }
    const store = new Store(db, path);
    if (isFresh) await store.flush();
    return store;
  }

  async upsert(rec: MemoryRecord): Promise<void> {
    this.db.run(
      `INSERT INTO memories
       (id, scope, project_hash, source, content, tags, created_at, updated_at, access_count, last_accessed_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         scope=excluded.scope,
         project_hash=excluded.project_hash,
         source=excluded.source,
         content=excluded.content,
         tags=excluded.tags,
         updated_at=excluded.updated_at,
         expires_at=excluded.expires_at`,
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
    const byScope: Record<MemoryScope, number> = { project: 0, global: 0 };
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
    return { total, byScope, expired };
  }

  async bumpAccess(id: string): Promise<void> {
    const now = Date.now();
    this.db.run(
      'UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?',
      [now, id],
    );
    await this.flush();
  }

  async flush(): Promise<void> {
    const data = this.db.export();
    await writeFile(this.path, Buffer.from(data));
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
    };
  }
}
