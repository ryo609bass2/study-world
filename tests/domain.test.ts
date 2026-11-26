import assert from 'node:assert/strict';
import { test } from 'node:test';
import { update } from '../src/app/domain.ts';
import { createSave } from '../src/app/state.ts';
import type { Save } from '../src/app/state.ts';
import { footprint, placementError } from '../src/building/catalog.ts';
import type { Building, Placement } from '../src/building/catalog.ts';
import { parseBackup, serialize } from '../src/persistence/backup.ts';
import { display, unitIds } from '../src/learning/math.ts';
import type { Session, SessionOptions } from '../src/learning/session.ts';
import { levelAt } from '../src/progression/levels.ts';
import { makeObby } from '../src/minigames/obby.ts';
import { groundAt, stepAround } from '../src/worlds/geometry.ts';
import { mineBarriers } from '../src/worlds/maps.ts';

const options: SessionOptions = {
  mode: 'mining', unitIds, difficulty: 'standard', actionDifficulty: 'standard', count: 5,
  answerMode: 'number', rewardMaterial: 'stone', originScreen: 'title',
};
const placement: Placement = { x: 0, y: 0, z: 0, rotation: 0 };
const key = (s: Session) => ({ sessionId: s.id, instanceId: s.questions[s.questionIndex].instanceId });
const active = (s: Save, tutorial = false) => (tutorial ? s.learning.tutorialSession : s.learning.suspendedSession)!;
const start = (s: Save, id = 'session', opts = options) => update(s, { type: 'start', id, options: opts });

function answer(s: Save, tutorial = false) {
  const v = active(s, tutorial);
  return update(s, { type: 'answer', ...key(v), input: display(v.questions[v.questionIndex].answer), ms: 100 });
}

function solve(s: Save, count: number, tutorial = false) {
  for (let i = 0; i < count; i++) {
    if (active(s, tutorial).attempts[active(s, tutorial).questionIndex].resolved) s = update(s, { type: 'next', ...key(active(s, tutorial)) });
    if (active(s, tutorial).mode === 'obby') s = update(s, { type: 'gate', ...key(active(s, tutorial)) });
    s = answer(s, tutorial);
  }
  return s;
}

function introductorySave() {
  let s = createSave('p');
  s = update(s, { type: 'moved' });
  s = update(s, { type: 'open-home-chest' });
  return solve(start(s, 'tutorial', { ...options, mode: 'tutorial', unitIds: ['M01'], count: 3,
    difficulty: 'basic', rewardMaterial: 'wood', originScreen: 'world' }), 3, true);
}

function homeWithHouse() {
  let s = introductorySave();
  s = update(s, { type: 'craft', buildingId: 'house_small', instanceId: 'h' });
  return update(s, { type: 'place', instanceId: 'h', placement });
}

test('T01 P3: 初回3問の所持資源、作成後の残高、家の配置で初めて広場解放', () => {
  let s = introductorySave();
  assert.deepEqual(s.economy, { coin: 40, wood: 10, stone: 4 });
  assert.equal(s.player.totalXP, 45);
  assert.ok(!s.appliedEventIds.includes('first:mining'));
  s = update(s, { type: 'craft', buildingId: 'house_small', instanceId: 'h' });
  assert.deepEqual(s.economy, { coin: 10, wood: 0, stone: 0 });
  assert.deepEqual(s.world.unlocked, ['home']);
  assert.equal(s.buildings[0].placement, null);
  s = update(s, { type: 'place', instanceId: 'h', placement });
  assert.deepEqual(s.world.unlocked, ['home', 'hub']);
  assert.equal(s.player.totalXP, 55);
  assert.deepEqual(parseBackup(serialize(s)), s);
  s = update(s, { type: 'place', instanceId: 'h', placement: null });
  assert.ok(s.world.unlocked.includes('hub'));
});

test('T02/T03 P2: 初回クイック5問90コイン、再挑戦70コイン、物理解放とは独立', () => {
  let s = solve(start(createSave('p')), 5);
  assert.deepEqual(s.economy, { coin: 90, wood: 0, stone: 15 });
  assert.deepEqual(s.world.unlocked, ['home']);
  assert.equal(s.player.totalXP, 70);
  assert.ok(s.progress.achievements.includes('mining'));
  s = solve(start(s, 'retry'), 5);
  assert.deepEqual(s.economy, { coin: 160, wood: 0, stone: 30 });
  assert.equal(s.player.totalXP, 140);
  assert.equal(s.appliedEventIds.filter(id => id === 'first:mining').length, 1);
});

test('T04/T05 P2: 中断・復元時は確定済みを保持し、二重確定を拒否', () => {
  let s = solve(start(createSave('p')), 3);
  const attempt = key(active(s));
  assert.throws(() => update(s, { type: 'answer', ...attempt, input: '1', ms: 0 }));
  s = update(s, { type: 'suspend', ...attempt });
  s = parseBackup(serialize(s));
  assert.deepEqual(s.economy, { coin: 30, wood: 0, stone: 6 });
  assert.equal(active(s).questionIndex, 2);
  assert.equal(active(s).status, 'suspended');
  s = solve(update(s, { type: 'resume', ...attempt }), 2);
  assert.deepEqual(active(s).earned, { coin: 90, wood: 0, stone: 15, xp: 70 });
  assert.throws(() => update(s, { type: 'guide', ...key(active(s)), ms: 0 }));
  assert.equal(s.appliedEventIds.filter(id => id === 'session:session:complete').length, 1);
  assert.equal(s.learning.attempts.length, 5);
});

test('T06 P2: 誤形式と誤答を区別し、3回誤答後のガイドも同額', () => {
  let s = start(createSave('p'), 'guide', { ...options, count: 1 });
  const k = key(active(s));
  assert.throws(() => update(s, { type: 'answer', ...k, input: '4.', ms: 0 }));
  for (let i = 0; i < 3; i++) s = update(s, { type: 'answer', ...k, input: '9999999999', ms: 100 });
  s = update(s, { type: 'hint', ...k, ms: 40 });
  s = update(s, { type: 'guide', ...k, ms: 100 });
  assert.equal(s.learning.attempts[0].wrongCount, 3);
  assert.equal(s.learning.attempts[0].firstSubmittedCorrect, false);
  assert.equal(s.learning.attempts[0].resolvedWithHelp, true);
  assert.deepEqual(active(s).earned, { coin: 30, wood: 0, stone: 2, xp: 10 });
  assert.ok(s.progress.achievements.includes('retry'));
});

test('T08 P3: 回転・境界・隣接・重複・収納・取消・保護区域・60個上限', () => {
  const warehouse: Building = { buildingId: 'warehouse', instanceId: 'w', placement: null };
  const p = { x: 9, z: 8, y: 0, rotation: 90 } as const;
  assert.deepEqual(footprint('warehouse', p), { x: 9, z: 8, width: 3, depth: 4 });
  assert.equal(placementError([], warehouse, p), null);
  assert.match(placementError([], warehouse, { ...p, x: 10 })!, /建築エリア/);
  const path: Building = { buildingId: 'stone_path', instanceId: 'a', placement: { ...placement, x: 8, z: 8 } };
  assert.equal(placementError([path], warehouse, p), null);
  assert.match(placementError([path], warehouse, { ...p, x: 8 })!, /重なって/);
  assert.match(placementError([], warehouse, p, [{ x: 9, z: 8, width: 1, depth: 1 }])!, /建築できません/);
  const many: Building[] = Array.from({ length: 60 }, (_, i) => ({
    buildingId: 'stone_path', instanceId: 'b' + i, placement: { ...placement, x: -12 + i % 6, z: -12 + Math.floor(i / 6) },
  }));
  assert.match(placementError(many, warehouse, p)!, /60個/);
  let s = homeWithHouse();
  assert.throws(() => update(s, { type: 'craft', buildingId: 'house_small', instanceId: 'h2' }));
  s = update(s, { type: 'place', instanceId: 'h', placement: null });
  s = update(s, { type: 'undo' });
  assert.equal(s.buildings.length, 1);
  assert.deepEqual(s.buildings[0].placement, placement);
  assert.equal(s.player.totalXP, 55);
});

test('T09/T10: 5問と初回家でSTAGE2、レベル境界とXP保持', () => {
  let s = homeWithHouse();
  s = solve(start(s), 2);
  assert.equal(s.progress.islandStage, 2);
  assert.ok(s.recipes.includes('warehouse'));
  assert.equal(s.player.totalXP, 55 + 20 + 50);
  assert.equal(update(s, { type: 'moved' }).player.totalXP, s.player.totalXP);
  assert.deepEqual([0, 59, 60, 360, 1260, 100_000].map(levelAt), [1, 1, 2, 5, 10, 10]);
});

test('T07 P4: 案内を確認して森林解放、橋の正答後は専用資材で修復、通行と採集', () => {
  let s = homeWithHouse();
  s = update(s, { type: 'travel', world: 'hub' });
  s = update(s, { type: 'hub-guide' });
  s = update(s, { type: 'travel', world: 'greenwood_mine' });
  const at = { x: 35, z: -25 };
  const action = { type: 'explore', world: 'greenwood_mine', marker: 'woods-stone', at, eventId: 'node' } as const;
  assert.throws(() => update(s, action));
  const bridge = { ...options, mode: 'bridge', unitIds: ['M02'], count: 1, rewardMaterial: 'wood', originScreen: 'world' } as const;
  s = start(s, 'bridge', { ...bridge, unitIds: [...bridge.unitIds] });
  assert.equal(display(active(s).questions[0].answer), '24');
  s = solve(s, 1);
  const resources = s.economy;
  s = update(s, { type: 'repair-bridge' });
  assert.deepEqual(s.economy, resources);
  assert.ok(s.world.repairedBridge);
  assert.deepEqual(stepAround({ x: 15, z: -1.5 }, { x: 0, z: -.6 }, mineBarriers(false)), { x: 15, z: -1.5 });
  assert.deepEqual(stepAround({ x: 15, z: -1.5 }, { x: 0, z: -.6 }, mineBarriers(true)), { x: 15, z: -2.1 });
  s = update(s, action);
  assert.equal(s.economy.stone, 2);
  s = parseBackup(serialize(s));
  s = update(s, { type: 'cooldown', ms: 29_999 });
  assert.throws(() => update(s, { ...action, eventId: 'retry' }), /戻るまで/);
  s = update(s, { type: 'cooldown', ms: 1 });
  s = update(s, { ...action, eventId: 'retry' });
  assert.equal(s.economy.stone, 4);
});

test('T11/T12 P5: 難易度と報酬を分離し、ゲート終了後も前問の報酬を保持', () => {
  let s = start(createSave('p'), 'obby', { ...options, mode: 'obby', count: 3, actionDifficulty: 'advanced', difficulty: 'basic' });
  assert.throws(() => answer(s));
  s = solve(s, 1);
  const prior = active(s).clearedInstanceIds[0];
  s = update(s, { type: 'next', ...key(active(s)) });
  assert.equal(active(s).checkpointId, 1);
  assert.equal(active(s).gateReady, false);
  assert.deepEqual(active(s).clearedInstanceIds, [prior]);
  assert.equal(groundAt(makeObby(1, 'advanced').map.spawn, makeObby(1, 'advanced').map.platforms, 0), 0);
  assert.equal(groundAt({ x: 0, z: -3 }, makeObby(1, 'assist').map.platforms, 0), 0);
  s = solve(s, 2);
  const assist = solve(start(createSave('p2'), 'assist', { ...options, mode: 'obby', count: 3, actionDifficulty: 'assist', difficulty: 'advanced' }), 3);
  assert.deepEqual(active(s).earned, active(assist).earned);
});

test('T15: 正常なJSONを復元し不正な型、資源、参照、問題を拒否する', () => {
  const s = solve(start(homeWithHouse()), 1);
  assert.deepEqual(parseBackup(serialize(s)), s);
  assert.throws(() => parseBackup('[]'));
  assert.throws(() => parseBackup(JSON.stringify({ ...s, schemaVersion: 2 })));
  assert.throws(() => parseBackup(JSON.stringify({ ...s, economy: { ...s.economy, coin: -1 } })));
  const bad = structuredClone(s);
  bad.learning.suspendedSession!.questions[0].answer.scale = -2;
  assert.throws(() => parseBackup(serialize(bad)), /ミッション/);
});
