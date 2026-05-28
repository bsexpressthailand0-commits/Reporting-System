import { db, nowIso, toJson } from './db.js';

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      collection_name TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (collection_name, id)
    );
    CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection_name);
    CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(collection_name, updated_at);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT,
      display_name TEXT,
      role TEXT,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      import_batch_id TEXT,
      order_date TEXT,
      branch_code TEXT,
      branch_group TEXT,
      sender_name TEXT,
      tracking_no TEXT,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_shipments_order_date ON shipments(order_date);
    CREATE INDEX IF NOT EXISTS idx_shipments_branch_code ON shipments(branch_code);
    CREATE INDEX IF NOT EXISTS idx_shipments_branch_group ON shipments(branch_group);
    CREATE INDEX IF NOT EXISTS idx_shipments_sender_name ON shipments(sender_name);
    CREATE INDEX IF NOT EXISTS idx_shipments_import_batch ON shipments(import_batch_id);

    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!admin) {
    const now = nowIso();
    const id = 'admin';
    const data = {
      uid: id,
      username: 'admin',
      password: 'admin123',
      displayName: 'Administrator',
      role: 'super_admin',
      status: 'active',
      permissions: ['*'],
      createdAt: now,
      updatedAt: now
    };
    db.prepare('INSERT INTO users (id, username, password, display_name, role, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, data.username, data.password, data.displayName, data.role, toJson(data), now, now);
    db.prepare('INSERT OR REPLACE INTO documents (collection_name, id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('users', id, toJson(data), now, now);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  initDatabase();
  console.log('SQLite database initialized');
}
