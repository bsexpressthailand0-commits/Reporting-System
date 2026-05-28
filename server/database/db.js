import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultPath = path.join(__dirname, 'bsexpress.db');
const dbPath = process.env.DATABASE_PATH || defaultPath;
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function nowIso() { return new Date().toISOString(); }
export function toJson(value) { return JSON.stringify(value ?? null); }
export function fromJson(value) { try { return value ? JSON.parse(value) : null; } catch { return null; } }
export function makeId(prefix = '') { return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
