import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const dbPath = resolve(process.env.DB_PATH ?? "./data/app.db");
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'forward' CHECK (mode IN ('forward','backward')),
    anchor_time TEXT NOT NULL,
    is_template INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','done')),
    live_started_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    start_min INTEGER NOT NULL DEFAULT 0,
    duration_min INTEGER NOT NULL DEFAULT 10 CHECK (duration_min >= 1),
    color TEXT,
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','done')),
    actual_start_at TEXT,
    actual_done_at TEXT
  );

  CREATE TABLE IF NOT EXISTS deps (
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    predecessor_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    successor_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (predecessor_id, successor_id)
  );

  CREATE INDEX IF NOT EXISTS idx_groups_plan ON groups(plan_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_plan ON tasks(plan_id);
  CREATE INDEX IF NOT EXISTS idx_deps_plan ON deps(plan_id);
`);
