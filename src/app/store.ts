import { SaveDatabase } from '../persistence/db.ts';
import { parseBackup, serialize } from '../persistence/backup.ts';
import type { Save } from './state.ts';
import { RuleError, update } from './domain.ts';
import type { Command } from './domain.ts';

type Pending = { draft: Save; expected: number | null };
interface StoreView { save: Save | null; busy: boolean; error: string; pending: Save | null }

export class Store {
  private db = new SaveDatabase<Save>();
  private view: StoreView = { save: null, busy: false, error: '', pending: null };
  private pending?: Pending;
  private listeners = new Set<() => void>();

  snapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  profiles = () => this.db.profiles();

  private publish(next: Partial<StoreView>) {
    this.view = { ...this.view, ...next };
    for (const listener of this.listeners) listener();
  }

  async load(profileId: string) {
    if (this.view.busy) return false;
    this.publish({ busy: true, error: '' });
    try {
      const save = await this.db.load(profileId);
      if (!save) throw new Error('プロフィールが見つかりません。');
      if (save.schemaVersion !== 1) throw new Error('このバージョンのセーブには対応していません。');
      const valid = parseBackup(serialize(save));
      this.pending = undefined;
      this.publish({ save: valid, pending: null });
      return true;
    } catch (error) {
      this.publish({ error: error instanceof Error ? error.message : '保存データを開けません。' });
      return false;
    } finally { this.publish({ busy: false }); }
  }

  async commit(draft: Save, expected: number | null = this.view.save?.revision ?? null) {
    if (this.view.busy) return false;
    this.pending = { draft, expected };
    this.publish({ busy: true, error: '' });
    try {
      const write = () => this.db.commit(draft, expected);
      const save = typeof navigator !== 'undefined' && navigator.locks
        ? await navigator.locks.request('study-world:' + draft.profileId, write) : await write();
      this.pending = undefined;
      this.publish({ save, pending: null });
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'この端末で保存できませんでした。';
      this.publish({ error: detail, pending: draft });
      return false;
    } finally { this.publish({ busy: false }); }
  }

  async dispatch(action: Command) {
    const current = this.view.save;
    if (!current || this.view.busy || this.pending) return false;
    try {
      return await this.commit(update(current, action), current.revision);
    } catch (error) {
      this.publish({ error: error instanceof RuleError ? error.message : '操作を完了できませんでした。' });
      return false;
    }
  }

  retry() {
    if (!this.pending) return Promise.resolve(false);
    return this.commit(this.pending.draft, this.pending.expected);
  }

  clearError() {
    if (!this.pending) this.publish({ error: '' });
  }
}
