import express from 'express';
import { db, fromJson, toJson, nowIso, makeId } from '../database/db.js';

export const firestoreCompatRouter = express.Router();

const COLLECTION_TABLE = new Set(['shipments', 'importBatches']);
const tableFor = (collection) => collection === 'importBatches' ? 'import_batches' : collection;

function normalizeData(collection, id, data, createdAt, updatedAt) {
  const parsed = fromJson(data) || {};
  return { id, ...parsed, createdAt: parsed.createdAt || createdAt, updatedAt: parsed.updatedAt || updatedAt };
}

function saveDocument(collection, id, payload, merge = false) {
  const now = nowIso();
  const existing = getDocument(collection, id, false);
  const data = merge && existing ? { ...existing, ...payload, id } : { ...payload, id };
  data.updatedAt = data.updatedAt || now;
  if (!data.createdAt) data.createdAt = existing?.createdAt || now;

  if (COLLECTION_TABLE.has(collection)) {
    const table = tableFor(collection);
    if (collection === 'shipments') {
      db.prepare(`INSERT INTO shipments (id, import_batch_id, order_date, branch_code, branch_group, sender_name, tracking_no, data, created_at, updated_at)
        VALUES (@id, @importBatchId, @orderDate, @branchCode, @branchGroup, @senderName, @trackingNo, @data, @createdAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET import_batch_id=excluded.import_batch_id, order_date=excluded.order_date, branch_code=excluded.branch_code,
        branch_group=excluded.branch_group, sender_name=excluded.sender_name, tracking_no=excluded.tracking_no, data=excluded.data, updated_at=excluded.updated_at`).run({
        id, importBatchId: data.importBatchId || data.import_batch_id || null, orderDate: data.orderDate || null,
        branchCode: data.branchCode || null, branchGroup: data.branchGroup || data.reportBranchGroup || null,
        senderName: data.senderName || null, trackingNo: data.trackingNo || data.trackingNumber || null,
        data: toJson(data), createdAt: data.createdAt, updatedAt: data.updatedAt
      });
    } else {
      db.prepare(`INSERT INTO ${table} (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`).run(id, toJson(data), data.createdAt, data.updatedAt);
    }
  }

  db.prepare(`INSERT INTO documents (collection_name, id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(collection_name, id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`).run(collection, id, toJson(data), data.createdAt, data.updatedAt);

  if (collection === 'users') {
    db.prepare(`INSERT INTO users (id, username, password, display_name, role, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET username=excluded.username, password=excluded.password, display_name=excluded.display_name, role=excluded.role, data=excluded.data, updated_at=excluded.updated_at`)
      .run(id, data.username || id, data.password || null, data.displayName || data.name || null, data.role || null, toJson(data), data.createdAt, data.updatedAt);
  }
  return data;
}

function getDocument(collection, id, includeId = true) {
  const row = db.prepare('SELECT id, data, created_at, updated_at FROM documents WHERE collection_name = ? AND id = ?').get(collection, id);
  if (!row) return null;
  return normalizeData(collection, includeId ? row.id : id, row.data, row.created_at, row.updated_at);
}

function compare(a, op, b) {
  if (op === '==') return a === b;
  if (op === '!=') return a !== b;
  if (op === '>=') return a >= b;
  if (op === '<=') return a <= b;
  if (op === '>') return a > b;
  if (op === '<') return a < b;
  if (op === 'in') return Array.isArray(b) && b.includes(a);
  if (op === 'array-contains') return Array.isArray(a) && a.includes(b);
  return true;
}

function queryDocuments(collection, constraints = []) {
  let rows = db.prepare('SELECT id, data, created_at, updated_at FROM documents WHERE collection_name = ?').all(collection)
    .map(r => normalizeData(collection, r.id, r.data, r.created_at, r.updated_at));
  for (const c of constraints) {
    if (c.type === 'where') rows = rows.filter(item => compare(c.field === '__name__' ? item.id : item[c.field], c.op, c.value));
    if (c.type === 'orderBy') rows = [...rows].sort((a, b) => {
      const av = c.field === '__name__' ? a.id : a[c.field];
      const bv = c.field === '__name__' ? b.id : b[c.field];
      const result = av === bv ? 0 : av > bv ? 1 : -1;
      return c.direction === 'desc' ? -result : result;
    });
    if (c.type === 'startAfter') {
      const idx = rows.findIndex(item => item.id === (c.value?.id || c.value));
      if (idx >= 0) rows = rows.slice(idx + 1);
    }
    if (c.type === 'limit') rows = rows.slice(0, Number(c.count));
  }
  return rows;
}

firestoreCompatRouter.get('/collections/:collection/docs', (req, res, next) => {
  try {
    const constraints = req.query.constraints ? JSON.parse(String(req.query.constraints)) : [];
    res.json({ docs: queryDocuments(req.params.collection, constraints) });
  } catch (err) { next(err); }
});

firestoreCompatRouter.get('/collections/:collection/docs/:id', (req, res, next) => {
  try { res.json({ doc: getDocument(req.params.collection, req.params.id) }); } catch (err) { next(err); }
});

firestoreCompatRouter.put('/collections/:collection/docs/:id', (req, res, next) => {
  try { res.json({ doc: saveDocument(req.params.collection, req.params.id, req.body.data || {}, Boolean(req.body.merge)) }); } catch (err) { next(err); }
});

firestoreCompatRouter.post('/collections/:collection/docs', (req, res, next) => {
  try {
    const id = req.body.id || makeId();
    res.json({ doc: saveDocument(req.params.collection, id, req.body.data || {}, false) });
  } catch (err) { next(err); }
});

firestoreCompatRouter.patch('/collections/:collection/docs/:id', (req, res, next) => {
  try { res.json({ doc: saveDocument(req.params.collection, req.params.id, req.body.data || {}, true) }); } catch (err) { next(err); }
});

firestoreCompatRouter.delete('/collections/:collection/docs/:id', (req, res, next) => {
  try {
    db.prepare('DELETE FROM documents WHERE collection_name = ? AND id = ?').run(req.params.collection, req.params.id);
    if (COLLECTION_TABLE.has(req.params.collection)) db.prepare(`DELETE FROM ${tableFor(req.params.collection)} WHERE id = ?`).run(req.params.id);
    if (req.params.collection === 'users') db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

firestoreCompatRouter.post('/batch', (req, res, next) => {
  try {
    const tx = db.transaction((ops) => {
      for (const op of ops) {
        if (op.type === 'set') saveDocument(op.collection, op.id, op.data || {}, Boolean(op.merge));
        if (op.type === 'update') saveDocument(op.collection, op.id, op.data || {}, true);
        if (op.type === 'delete') db.prepare('DELETE FROM documents WHERE collection_name = ? AND id = ?').run(op.collection, op.id);
      }
    });
    tx(req.body.operations || []);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
