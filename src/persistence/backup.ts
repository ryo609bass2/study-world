import { createSave } from '../app/state.ts';
import type { Save } from '../app/state.ts';
import { defaults } from '../app/settings.ts';
import { balanceCap, buildingIds, placementError, resourceIds } from '../building/catalog.ts';
import type { Building, Placement } from '../building/catalog.ts';
import { display, equal, skills, unitIds } from '../learning/math.ts';
import type { ExactNumber, UnitId } from '../learning/math.ts';
import { achievements, treasures } from '../progression/levels.ts';
import { maps } from '../worlds/maps.ts';
import { nodeDefinitions } from '../app/domain.ts';

const oneOf = (x: unknown, values: readonly unknown[]) => values.includes(x);
const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const int = (x: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= min && x <= max;
const text = (x: unknown, max = 3000): x is string => typeof x === 'string' && x.length > 0 && x.length <= max;
const id = (x: unknown): x is string => text(x, 220) && /^[a-zA-Z0-9_.:-]+$/.test(x);
const bool = (x: unknown): x is boolean => typeof x === 'boolean';
const time = (x: unknown) => text(x, 32) && Number.isFinite(Date.parse(x));
const list = (x: unknown, predicate: (v: unknown) => boolean, limit = 250_000): x is unknown[] => Array.isArray(x) && x.length <= limit && x.every(predicate);
const set = (x: unknown, predicate: (v: unknown) => boolean) => list(x, predicate) && new Set(x).size === x.length;
const choice = (x: unknown, values: readonly unknown[]) => set(x, v => oneOf(v, values));
const difficulty = (x: unknown) => oneOf(x, ['basic', 'standard', 'advanced']);
const action = (x: unknown) => oneOf(x, ['assist', 'standard', 'advanced']);
const worldIds = Object.keys(maps);
const world = (x: unknown) => oneOf(x, worldIds);
const buildingId = (x: unknown) => oneOf(x, buildingIds);
const tutorial = (x: unknown) => oneOf(x, ['move', 'chest', 'learn', 'craft', 'place', 'hub', 'done']);
const quests = ['bridge-materials', 'bridge'];
const balance = (x: unknown) => isObject(x) && resourceIds.every(k => int(x[k], 0, balanceCap));

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('読み込めないセーブデータです。' + message);
}

function isPlacement(x: unknown): x is Placement {
  return isObject(x) && int(x.x, -12, 11) && int(x.z, -12, 11) && x.y === 0 && oneOf(x.rotation, [0, 90, 180, 270]);
}

function isBuilding(x: unknown): x is Building {
  return isObject(x) && id(x.instanceId) && buildingId(x.buildingId) && (x.placement === null || isPlacement(x.placement));
}

function validSettings(x: unknown) {
  if (!isObject(x)) return false;
  const toggles = (Object.keys(defaults) as (keyof typeof defaults)[]).filter(k => typeof defaults[k] === 'boolean');
  return difficulty(x.learningDifficulty) && action(x.actionDifficulty) && toggles.every(k => bool(x[k])) &&
    oneOf(x.guidance, ['free', 'standard', 'support']) && oneOf(x.textScale, [1, 1.25, 1.5]) &&
    oneOf(x.cameraSensitivity, ['low', 'medium', 'high']) && oneOf(x.graphics, ['low', 'standard', 'high']) &&
    oneOf(x.sessionReminderMinutes, [0, 5, 10, 15]) && int(x.bgmVolume, 0, 100) && int(x.seVolume, 0, 100);
}

function validOptions(x: unknown): x is Record<string, unknown> {
  return isObject(x) && oneOf(x.mode, ['tutorial', 'mining', 'obby', 'bridge']) && Array.isArray(x.unitIds) &&
    x.unitIds.length > 0 && choice(x.unitIds, unitIds) && difficulty(x.difficulty) && action(x.actionDifficulty) &&
    oneOf(x.count, [1, 3, 5, 10]) && oneOf(x.answerMode, ['choice', 'number', 'worldChoice']) &&
    oneOf(x.rewardMaterial, ['wood', 'stone']) && oneOf(x.originScreen, ['title', 'world']) &&
    (x.mode !== 'tutorial' || (x.count === 3 && x.rewardMaterial === 'wood')) &&
    (x.mode !== 'bridge' || (x.count === 1 && x.rewardMaterial === 'wood')) &&
    (x.mode !== 'mining' || x.rewardMaterial === 'stone') && (x.mode !== 'obby' || x.count !== 1);
}

function validAttempt(x: unknown): x is Record<string, unknown> {
  return isObject(x) && id(x.instanceId) && oneOf(x.unitId, unitIds) && oneOf(x.skillId, skills[x.unitId as UnitId]) &&
    difficulty(x.difficulty) && (x.firstSubmittedCorrect === null || bool(x.firstSubmittedCorrect)) &&
    bool(x.hintBeforeFirst) && int(x.wrongCount) && int(x.hintCount, 0, 2) && bool(x.guidedUsed) &&
    bool(x.resolved) && bool(x.resolvedWithHelp) && int(x.activeResponseMs) && int(x.attemptCount) &&
    x.attemptCount >= x.wrongCount && (x.attemptCount > 0) === (x.firstSubmittedCorrect !== null) && time(x.timestamp);
}

function validExact(x: unknown): x is ExactNumber {
  return isObject(x) && text(x.coefficient, 12) && /^[0-9]+$/.test(x.coefficient) && int(x.scale, 0, 12);
}

function validQuestion(x: unknown, options: Record<string, unknown>): x is Record<string, unknown> {
  if (!isObject(x) || x.schemaVersion !== 1 || x.subject !== 'math' || x.grade !== 5 || !id(x.questionId) ||
      !id(x.instanceId) || !oneOf(x.unitId, unitIds) || !oneOf(x.unitId, options.unitIds as unknown[]) ||
      !oneOf(x.skillId, skills[x.unitId as UnitId]) || x.difficulty !== options.difficulty || x.context !== options.mode ||
      x.answerMode !== options.answerMode || x.rewardProfileId !== 'standard' || !text(x.seed) || !text(x.prompt) ||
      !text(x.expression) || !text(x.explanation) || !validExact(x.answer) || !list(x.hints, textValue, 2) ||
      x.hints.length !== 2 || !list(x.guidedSteps, textValue, 10) || !x.guidedSteps.length ||
      !(x.unitLabel === undefined || text(x.unitLabel, 30))) return false;
  if (x.answerMode === 'number') return x.choices === undefined;
  const answer = x.answer;
  if (!Array.isArray(x.choices) || x.choices.length !== (x.difficulty === 'basic' ? 3 : 4)) return false;
  const values: string[] = [];
  let correct = 0;
  for (const [i, c] of x.choices.entries()) {
    if (!isObject(c) || c.id !== 'abcd'[i] || !validExact(c.value) || c.label !== display(c.value)) return false;
    values.push(c.label as string);
    if (equal(c.value, answer)) correct++;
  }
  return correct === 1 && set(values, textValue);
}

function textValue(value: unknown) { return text(value); }

function validSession(x: unknown, attempts: Map<unknown, Record<string, unknown>>, events: Set<unknown>, mode?: string) {
  if (x === null) return true;
  if (!validOptions(x) || !id(x.id) || (mode ? x.mode !== mode : x.mode === 'tutorial') || !int(x.count, 1, 10) ||
      !int(x.questionIndex, 0, x.count - 1) || x.checkpointId !== x.questionIndex || !bool(x.gateReady) ||
      !bool(x.completionRewardGranted) || !oneOf(x.status, ['active', 'suspended', 'completed']) ||
      !Array.isArray(x.questions) || x.questions.length !== x.count || !Array.isArray(x.attempts) ||
      x.attempts.length !== x.questionIndex + 1 || !choice(x.clearedInstanceIds, x.questions.map(q => isObject(q) ? q.instanceId : null)) ||
      !balance(x.earned) || !isObject(x.earned) || !int(x.earned.xp)) return false;
  const cleared: string[] = [];
  for (let i = 0; i < x.questions.length; i++) {
    const q: unknown = x.questions[i];
    if (!validQuestion(q, x) || q.instanceId !== x.id + ':q' + i) return false;
    if (i <= x.questionIndex) {
      const a: unknown = x.attempts[i];
      if (!validAttempt(a) || a.instanceId !== q.instanceId || a.skillId !== q.skillId || a.difficulty !== q.difficulty) return false;
      const history = attempts.get(a.instanceId);
      if (!history || Object.keys(a).some(k => a[k] !== history[k])) return false;
      if (a.resolved) {
        if (!events.has('question:' + q.instanceId)) return false;
        cleared.push(q.instanceId);
      } else if (i < x.questionIndex) return false;
    }
  }
  return JSON.stringify(cleared) === JSON.stringify(x.clearedInstanceIds) &&
    (x.status === 'completed') === (cleared.length === x.count) && x.completionRewardGranted === (x.status === 'completed');
}

export function parseBackup(input: string): Save {
  check(input.length < 25_000_000, 'ファイルが大きすぎます。');
  let raw: unknown;
  try { raw = JSON.parse(input); } catch { throw new Error('JSONファイルを読み込めません。'); }
  check(isObject(raw) && raw.schemaVersion === 1 && id(raw.profileId) && int(raw.revision) && time(raw.updatedAt), 'バージョンまたはプロフィールを確認してください。');
  check(balance(raw.economy) && isObject(raw.player) && int(raw.player.totalXP) && isObject(raw.player.avatar) &&
    int(raw.player.avatar.hair, 0, 2) && int(raw.player.avatar.skin, 0, 3) && int(raw.player.avatar.hairColor, 0, 3) &&
    int(raw.player.avatar.face, 0, 2) && int(raw.player.avatar.outfit, 0, 2) && int(raw.player.avatar.color, 0, 4) &&
    validSettings(raw.settings), '資源・外見・設定を確認してください。');
  check(list(raw.buildings, isBuilding) && choice(raw.recipes, buildingIds), '建物またはレシピが無効です。');
  const buildings = raw.buildings as Building[];
  check(set(buildings.map(b => b.instanceId), id) && buildings.every(b => !b.placement || !placementError(buildings, b, b.placement)), '建物が重複しているか、配置が範囲外です。');
  check(raw.undo === null || (isObject(raw.undo) && typeof raw.undo.instanceId === 'string' && buildings.some(b => b.instanceId === (raw.undo as Record<string, unknown>).instanceId) &&
    (raw.undo.placement === null || isPlacement(raw.undo.placement))), '建築履歴が無効です。');
  const w = raw.world, p = raw.progress, l = raw.learning;
  check(isObject(w) && Array.isArray(w.unlocked) && choice(w.unlocked, worldIds) && w.unlocked.includes('home') &&
    world(w.lastSafeWorldId) && w.unlocked.includes(w.lastSafeWorldId) && bool(w.repairedBridge) && isObject(w.nodeCooldownMs) &&
    Object.entries(w.nodeCooldownMs).every(([k, v]) => Object.hasOwn(nodeDefinitions, k) && int(v, 1, nodeDefinitions[k as keyof typeof nodeDefinitions].ms)) &&
    choice(w.discoveries, ['woods-ruins', 'woods-waterfall']) && choice(w.openedChests, ['home-chest', 'woods-chest']),
  'ワールドの状態を確認してください。');
  check(isObject(p) && oneOf(p.islandStage, [1, 2]) && tutorial(p.tutorialStep) && isObject(p.counters) &&
    int(p.counters.resolved) && int(p.counters.integers) && int(p.counters.decimals) &&
    p.counters.resolved === p.counters.integers + p.counters.decimals && choice(p.completedQuestIds, quests) &&
    choice(p.achievements, Object.keys(achievements)) && choice(p.collectionIds, Object.keys(treasures)) &&
    choice(p.firstPlacedBuildingIds, buildingIds), '進行状況を確認してください。');
  const placed = p.firstPlacedBuildingIds as string[];
  const questList = p.completedQuestIds as string[];
  check(w.unlocked.includes('hub') === placed.includes('house_small') &&
    (!w.unlocked.includes('greenwood_mine') || w.unlocked.includes('hub')) &&
    w.repairedBridge === questList.includes('bridge') &&
    (!w.repairedBridge || questList.includes('bridge-materials')) &&
    (p.islandStage === 2) === (placed.includes('house_small') && (p.counters.resolved as number) >= 5),
  '解放条件と進行状況が一致していません。');
  check(set(raw.appliedEventIds, id) && isObject(l) && list(l.attempts, validAttempt) &&
    (l.lastMission === null || (validOptions(l.lastMission) && oneOf(l.lastMission.mode, ['mining', 'obby']))), '学習記録が無効です。');
  const history = l.attempts as Record<string, unknown>[];
  const attempts = new Map(history.map(a => [a.instanceId, a]));
  check(attempts.size === history.length && p.counters.resolved === history.filter(a => a.resolved).length, '学習履歴と進行状況が一致していません。');
  const events = new Set(raw.appliedEventIds as unknown[]);
  check(validSession(l.suspendedSession, attempts, events) && validSession(l.tutorialSession, attempts, events, 'tutorial'), '中断ミッションを復元できません。');
  return raw as unknown as Save;
}

export function serialize(save: Save) {
  return JSON.stringify(save, null, 2);
}

export function downloadBackup(save: Save) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([serialize(save)], { type: 'application/json' }));
  link.href = url;
  link.download = 'study-world-backup-' + save.profileId.slice(-6) + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function resetSave(save: Save): Save {
  return createSave(save.profileId);
}
