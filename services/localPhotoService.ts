const DB_NAME = 'slaptrip-local-photos';
const STORE_NAME = 'photos';
const DB_VERSION = 1;

const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
  const request = window.indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const run = async <T>(mode: 'readonly' | 'readwrite', action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error);
  });
};

const keyFor = (userId: string, historyId: string) => `${userId}:${historyId}`;

export const localPhotoService = {
  async save(userId: string, historyId: string, dataUrl: string): Promise<void> {
    await run('readwrite', store => store.put(dataUrl, keyFor(userId, historyId)));
  },
  async get(userId: string, historyId: string): Promise<string> {
    return (await run('readonly', store => store.get(keyFor(userId, historyId)))) || '';
  },
  async remove(userId: string, historyId: string): Promise<void> {
    await run('readwrite', store => store.delete(keyFor(userId, historyId)));
  },
  async clearUser(userId: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const request = transaction.objectStore(STORE_NAME).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(`${userId}:`)) cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    });
  }
};
