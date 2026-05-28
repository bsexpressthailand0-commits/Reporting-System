export const app = { name: 'sqlite-local' };
export const db = { provider: 'sqlite', apiBase: import.meta.env.VITE_API_BASE || 'http://localhost:3001' };
export const auth = { provider: 'sqlite' };
export const storage = { provider: 'sqlite' };

export enum OperationType {
  READ = 'read', WRITE = 'write', DELETE = 'delete', QUERY = 'query', AGGREGATE = 'aggregate'
}

export function handleFirestoreError(error: any, operation?: OperationType) {
  console.error(`SQLite API ${operation || 'operation'} error:`, error);
  return error;
}
