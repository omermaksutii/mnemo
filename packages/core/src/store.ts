import initSqlJs, { type Database } from 'sql.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MemoryRecord, MemoryScope } from './types.js';

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
  last_accessed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scope_project ON memories(scope, project_hash);
CREATE INDEX IF NOT EXISTS idx_updated ON memories(updated_at);
`;

export type StoreCounts = {
  total: number;
  byScope: Record<MemoryScope, number>;
};

export type StoreListFilter = {
  scope?: MemoryScope;
  projectHash?: string | null;
  limit?: number;
  since?: number;
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
    if (existsSync(path)) {
      const bytes = await readFile(path);
      db = new SQL.Database(new Uint8Array(bytes));
    } else {
      await mkdir(dirname(path), { recursive: true });
      db = new SQL.Database();
    }
    db.exec(SCHEMA);
    return new Store(db, path);
  }

  async upsert(rec: MemoryRecord): Promise<void> {
    this.db.run(
      `INSERT INTO memories
       (id, scope, project_hash, source, content, tags, created_at, updated_at, access_count, last_accessed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         scope=excluded.scope,
         project_hash=excluded.project_hash,
         source=excluded.source,
         content=excluded.content,
         tags=excluded.tags,
         updated_at=excluded.updated_at`,
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
      ],
    );
    await this.flush();
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
    const sql = `SELECT * FROM memories ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC ${filter.limit ? 'LIMIT ' + Number(filter.limit) : ''}`;
    const stmt = this.db.prepare(sql);
    if (args.length) stmt.bind(args as never);
    const out: MemoryRecord[] = [];
    while (stmt.step()) out.push(this.fromRow(stmt.getAsObject()));
    stmt.free();
    return out;
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
    return { total, byScope };
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
    };
  }
}
