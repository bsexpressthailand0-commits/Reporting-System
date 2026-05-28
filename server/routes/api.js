import express from 'express';
import { db, fromJson, makeId, nowIso, toJson } from '../database/db.js';

export const apiRouter = express.Router();
apiRouter.get('/health', (req, res) => {
  const collections = db.prepare('SELECT collection_name, COUNT(*) as count FROM documents GROUP BY collection_name').all();
  res.json({ ok: true, database: 'sqlite', collections });
});

apiRouter.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || (user.password && user.password !== password)) return res.status(401).json({ error: 'Invalid username or password' });
  const token = makeId('sess_');
  const now = nowIso();
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, user.id, now, expires);
  res.json({ token, user: fromJson(user.data) });
});
apiRouter.post('/auth/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});
apiRouter.get('/auth/me', (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const row = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token = ? AND s.expires_at > ?').get(token, nowIso());
  if (!row) return res.status(401).json({ error: 'Unauthenticated' });
  res.json({ user: fromJson(row.data) });
});
