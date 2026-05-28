const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

type Constraint = Record<string, any>;
type Ref = { type: 'collection' | 'doc'; path: string; collection: string; id?: string };

const encode = encodeURIComponent;
const makeId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function parsePath(parts: any[]): Ref {
  const clean = parts.filter(Boolean).map((p) => typeof p === 'string' ? p : p?.path || p?.id || '').filter(Boolean);
  const collection = clean[0];
  const id = clean[1];
  return { type: id ? 'doc' : 'collection', path: clean.join('/'), collection, id };
}

export function getFirestore(app?: any) { return { provider: 'sqlite', app }; }

export function collection(_db: any, path: string, ...segments: string[]): Ref {
  const ref = parsePath([path, ...segments]);
  return { ...ref, type: 'collection' };
}

export function doc(_dbOrCollection: any, path?: string, ...segments: string[]): Ref {
  if (typeof _dbOrCollection === 'object' && _dbOrCollection?.type === 'collection') {
    const id = path || makeId();
    return { type: 'doc', path: `${_dbOrCollection.collection}/${id}`, collection: _dbOrCollection.collection, id };
  }
  const ref = parsePath([path, ...segments]);
  return { ...ref, type: 'doc', id: ref.id || makeId() };
}

export function query(ref: Ref, ...constraints: Constraint[]) { return { ...ref, constraints }; }
export function where(field: string, op: string, value: any) { return { type: 'where', field, op, value }; }
export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc') { return { type: 'orderBy', field, direction }; }
export function limit(count: number) { return { type: 'limit', count }; }
export function startAfter(value: any) { return { type: 'startAfter', value }; }
export function documentId() { return '__name__'; }
export function serverTimestamp() { return new Date().toISOString(); }
export function increment(amount: number) { return { __op: 'increment', amount }; }
export function deleteField() { return { __op: 'deleteField' }; }
export function sum(field: string) { return { type: 'sum', field }; }
export function count() { return { type: 'count' }; }

function materialize(data: any, existing: any = {}) {
  const out: any = { ...data };
  Object.entries(out).forEach(([k, v]: any) => {
    if (v && typeof v === 'object' && v.__op === 'increment') out[k] = Number(existing[k] || 0) + Number(v.amount || 0);
    if (v && typeof v === 'object' && v.__op === 'deleteField') delete out[k];
  });
  return out;
}

function makeDocSnapshot(item: any) {
  return { id: item?.id, exists: () => Boolean(item), data: () => item ? { ...item } : undefined };
}

export async function getDoc(ref: Ref) {
  const result = await request(`/api/firestore/collections/${encode(ref.collection)}/docs/${encode(ref.id || '')}`);
  return makeDocSnapshot(result.doc);
}

export async function getDocs(ref: Ref & { constraints?: Constraint[] }) {
  const qs = ref.constraints?.length ? `?constraints=${encode(JSON.stringify(ref.constraints))}` : '';
  const result = await request(`/api/firestore/collections/${encode(ref.collection)}/docs${qs}`);
  const docs = (result.docs || []).map(makeDocSnapshot);
  return { docs, empty: docs.length === 0, size: docs.length, forEach: (cb: any) => docs.forEach(cb) };
}

export async function setDoc(ref: Ref, data: any, options?: { merge?: boolean }) {
  const payload = materialize(data);
  await request(`/api/firestore/collections/${encode(ref.collection)}/docs/${encode(ref.id || makeId())}`, {
    method: 'PUT', body: JSON.stringify({ data: payload, merge: Boolean(options?.merge) })
  });
}

export async function updateDoc(ref: Ref, data: any) {
  const current = await getDoc(ref).catch(() => null);
  const payload = materialize(data, current?.data?.() || {});
  await request(`/api/firestore/collections/${encode(ref.collection)}/docs/${encode(ref.id || '')}`, {
    method: 'PATCH', body: JSON.stringify({ data: payload })
  });
}

export async function addDoc(ref: Ref, data: any) {
  const result = await request(`/api/firestore/collections/${encode(ref.collection)}/docs`, {
    method: 'POST', body: JSON.stringify({ data: materialize(data) })
  });
  return doc({}, ref.collection, result.doc.id);
}

export async function deleteDoc(ref: Ref) {
  await request(`/api/firestore/collections/${encode(ref.collection)}/docs/${encode(ref.id || '')}`, { method: 'DELETE' });
}

export function writeBatch(_db: any) {
  const operations: any[] = [];
  return {
    set: (ref: Ref, data: any, options?: any) => operations.push({ type: 'set', collection: ref.collection, id: ref.id, data: materialize(data), merge: Boolean(options?.merge) }),
    update: (ref: Ref, data: any) => operations.push({ type: 'update', collection: ref.collection, id: ref.id, data: materialize(data) }),
    delete: (ref: Ref) => operations.push({ type: 'delete', collection: ref.collection, id: ref.id }),
    commit: async () => request('/api/firestore/batch', { method: 'POST', body: JSON.stringify({ operations }) })
  };
}

export function onSnapshot(ref: Ref, next: any, error?: any) {
  getDoc(ref).then(next).catch(error || console.error);
  return () => undefined;
}

export async function getCountFromServer(ref: Ref) {
  const snap = await getDocs(ref as any);
  return { data: () => ({ count: snap.size }) };
}

export async function getAggregateFromServer(ref: any, spec: Record<string, any>) {
  const snap = await getDocs(ref);
  const rows = snap.docs.map((d: any) => d.data());
  const data: Record<string, number> = {};
  Object.entries(spec).forEach(([key, agg]: any) => {
    if (agg?.type === 'count') data[key] = rows.length;
    if (agg?.type === 'sum') data[key] = rows.reduce((s, r) => s + Number(r?.[agg.field] || 0), 0);
  });
  return { data: () => data };
}

export const Timestamp = { now: () => new Date().toISOString(), fromDate: (d: Date) => d.toISOString() };
export const FieldValue = { serverTimestamp, increment };
