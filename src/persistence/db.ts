export interface VersionedSave {
  profileId: string;
  revision: number;
  updatedAt: string;
}

export class SaveConflict extends Error {
  constructor() {
    super('別の画面でセーブが更新されました。最新のデータを読み込み直してください。');
  }
}

export class SaveDatabase<T extends VersionedSave> {
  private connection?: Promise<IDBDatabase>;

  constructor(private readonly name = 'study-world') {}

  private open(): Promise<IDBDatabase> {
    return this.connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => {
        for (const name of ['profiles', 'saves', 'backups']) {
          request.result.createObjectStore(name, { keyPath: 'profileId' });
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          this.connection = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    }).catch(error => {
      this.connection = undefined;
      throw error;
    });
  }

  async profiles(): Promise<{ profileId: string; updatedAt: string }[]> {
    const db = await this.open();
    return this.read(db.transaction('profiles').objectStore('profiles').getAll());
  }

  async load(id: string): Promise<T | undefined> {
    const db = await this.open();
    return this.read(db.transaction('saves').objectStore('saves').get(id));
  }

  private read<R>(request: IDBRequest<R>): Promise<R> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async commit(next: T, expectedRevision: number | null): Promise<T> {
    const db = await this.open();
    const saved = { ...next, revision: (expectedRevision ?? -1) + 1, updatedAt: new Date().toISOString() };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['profiles', 'saves', 'backups'], 'readwrite');
      const saves = tx.objectStore('saves');
      let failure: unknown;
      tx.oncomplete = () => resolve(saved);
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('保存が中断されました。'));
      const request = saves.get(saved.profileId);
      request.onsuccess = () => {
        try {
          const prior = request.result as T | undefined;
          if ((prior?.revision ?? null) !== expectedRevision) throw new SaveConflict();
          if (prior) tx.objectStore('backups').put(prior);
          saves.put(saved);
          tx.objectStore('profiles').put({ profileId: saved.profileId, updatedAt: saved.updatedAt });
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
    });
  }
}
