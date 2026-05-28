export function getFunctions(app?: any) { return { app, provider: 'sqlite' }; }
export function httpsCallable(_functions: any, name: string) {
  return async (data?: any) => ({ data: { ok: true, name, skipped: true, message: 'Firebase Functions ถูกปิดใช้งาน ระบบใช้ SQLite backend แทน', input: data } });
}
