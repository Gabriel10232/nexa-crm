/* Persistence adapter layer.
 * The UI never talks to localStorage directly: it goes through a StorageAdapter.
 * To move to a real backend, implement `StorageAdapter` (e.g. RestAdapter / SupabaseAdapter)
 * and swap `activeAdapter`. Keys map 1:1 to tables / endpoints. */

export interface StorageAdapter {
  readonly name: string;
  readonly remote: boolean;
  load<T>(key: string): T | null;
  save<T>(key: string, value: T): void;
  remove(key: string): void;
}

export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'LocalStorage (demonstração)';
  readonly remote = false;
  load<T>(key: string): T | null {
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
  }
  save<T>(key: string, value: T) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('[storage] save failed', e); }
  }
  remove(key: string) { try { localStorage.removeItem(key); } catch { /* ignore */ } }
}

/** Example of the contract a remote adapter would follow (not connected). */
export class RestAdapterStub implements StorageAdapter {
  readonly name = 'REST API (não conectada)';
  readonly remote = true;
  constructor(public baseUrl: string) {}
  load<T>(): T | null { throw new Error('RestAdapter não está conectado. Configure VITE_API_URL.'); }
  save() { throw new Error('RestAdapter não está conectado.'); }
  remove() { throw new Error('RestAdapter não está conectado.'); }
}

export const activeAdapter: StorageAdapter = new LocalStorageAdapter();
