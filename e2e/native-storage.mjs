import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';

const fallback = process.env.STUDY_WORLD_PLAYWRIGHT;
const { chromium } = await import(fallback ? pathToFileURL(fallback).href : '@playwright/test');
const code = stripTypeScriptTypes(await readFile(new URL('../src/persistence/db.ts', import.meta.url), 'utf8'), { mode: 'transform' });
const url = 'https://study-world.test';
const browser = await chromium.launch({
  executablePath: process.env.STUDY_WORLD_CHROMIUM,
  headless: true,
});
try {
  const context = await browser.newContext();
  await context.route(url + '/**', route => route.fulfill(route.request().url().endsWith('/db.js')
    ? { contentType: 'application/javascript', body: code }
    : { contentType: 'text/html', body: '<title>Study World IndexedDB smoke test</title>' }));
  const firstTab = await context.newPage();
  await firstTab.goto(url);
  const first = await firstTab.evaluate(async () => {
    const { SaveDatabase } = await import('/db.js');
    const db = new SaveDatabase();
    const initial = await db.commit({ profileId: 'profile', revision: 0, updatedAt: '', coin: 0 }, null);
    return db.commit({ ...initial, coin: 40 }, initial.revision);
  });
  await firstTab.reload();
  const secondTab = await context.newPage();
  await secondTab.goto(url);
  const result = await firstTab.evaluate(async () => {
    const { SaveDatabase } = await import('/db.js');
    const db = new SaveDatabase();
    return { save: await db.load('profile'), profiles: await db.profiles() };
  });
  assert.deepEqual(result.save, first);
  assert.equal(result.profiles.length, 1);
  const updated = await secondTab.evaluate(async () => {
    const { SaveDatabase } = await import('/db.js');
    const db = new SaveDatabase();
    const prior = await db.load('profile');
    return db.commit({ ...prior, coin: 10 }, prior.revision);
  });
  const conflict = await firstTab.evaluate(async first => {
    const { SaveDatabase } = await import('/db.js');
    try {
      await new SaveDatabase().commit({ ...first, coin: 70 }, first.revision);
    } catch (error) {
      return error.constructor.name;
    }
  }, first);
  assert.equal(updated.coin, 10);
  assert.equal(conflict, 'SaveConflict');
  const backup = await firstTab.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('study-world');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const get = db.transaction('backups').objectStore('backups').get('profile');
      get.onerror = () => reject(get.error);
      get.onsuccess = () => { db.close(); resolve(get.result); };
    };
  }));
  assert.deepEqual(backup, first);
  const failure = await secondTab.evaluate(async fresh => {
    const { SaveDatabase } = await import('/db.js');
    const db = new SaveDatabase();
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'saves') throw new DOMException('Simulated full storage', 'QuotaExceededError');
      return Reflect.apply(put, this, args);
    };
    try {
      await db.commit({ ...fresh, coin: 99 }, fresh.revision);
      return { succeeded: true };
    } catch (error) {
      return { name: error.name, value: await db.load('profile') };
    } finally {
      IDBObjectStore.prototype.put = put;
    }
  }, updated);
  assert.equal(failure.name, 'QuotaExceededError');
  assert.deepEqual(failure.value, updated);
  console.log('PASS Native Chromium IndexedDB: create, reload, conflict between tabs, prior snapshot, and rollback on a write failure.');
} finally {
  await browser.close();
}
