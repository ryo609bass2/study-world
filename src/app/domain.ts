import { balanceCap, catalog, placementError, resourceIds, zeroBalance } from '../building/catalog.ts';
import type { Balance, BuildingId, Placement, Resource } from '../building/catalog.ts';
import { checkAnswer, unitIds } from '../learning/math.ts';
import { bonus, createSession, newAttempt } from '../learning/session.ts';
import type { Material, Session, SessionOptions } from '../learning/session.ts';
import type { AvatarConfig } from './avatar.ts';
import type { Settings } from './settings.ts';
import type { Save } from './state.ts';
import type { WorldId } from '../worlds/maps.ts';

export class RuleError extends Error {}

function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}

export function addUnique<T>(list: T[], value: T) {
  if (!list.includes(value)) list.push(value);
}

export function grant(s: Save, token: string, amount: Partial<Balance>, xp = 0) {
  if (s.appliedEventIds.includes(token)) return;
  const next: Balance = { ...s.economy };
  for (const key of resourceIds) {
    const value = next[key] + (amount[key] ?? 0);
    requireRule(Number.isSafeInteger(value) && value >= 0 && value <= balanceCap,
      value < 0 ? '必要な資源が足りません。' : '資源の上限に達しています。');
    next[key] = value;
  }
  s.economy = next;
  s.player.totalXP += xp;
  s.appliedEventIds.push(token);
}

type LearningCommand =
  | { type: 'start'; id: string; options: SessionOptions; replace?: boolean }
  | { type: 'discard' | 'resume' | 'suspend' | 'next' | 'gate'; sessionId: string; instanceId: string }
  | { type: 'answer'; sessionId: string; instanceId: string; input: string; ms: number }
  | { type: 'hint' | 'guide'; sessionId: string; instanceId: string; ms: number };

export type Command = LearningCommand
  | { type: 'moved' | 'open-home-chest' | 'hub-guide' | 'repair-bridge' }
  | { type: 'settings'; settings: Settings }
  | { type: 'avatar'; avatar: AvatarConfig }
  | { type: 'craft' | 'buy-building'; buildingId: BuildingId; instanceId: string }
  | { type: 'buy-material'; resource: Material; eventId: string }
  | { type: 'place'; instanceId: string; placement: Placement | null }
  | { type: 'undo' }
  | { type: 'travel'; world: WorldId }
  | { type: 'explore'; world: WorldId; marker: string; at: { x: number; z: number }; eventId: string }
  | { type: 'cooldown'; ms: number };

function sessionOf(s: Save, id: string): Session {
  const session = [s.learning.tutorialSession, s.learning.suspendedSession].find(current => current?.id === id);
  requireRule(session, 'このミッションは開かれていません。');
  return session;
}

function learn(s: Save, action: LearningCommand) {
  if (action.type === 'start') {
    requireRule(!s.learning.attempts.some(a => a.instanceId === action.id + ':q0'), 'このミッションは作成済みです。');
    const opt = action.options;
    requireRule(opt.unitIds.length > 0 && new Set(opt.unitIds).size === opt.unitIds.length && opt.unitIds.every(id => unitIds.includes(id)), '単元を選んでください。');
    if (opt.mode === 'tutorial') {
      requireRule(s.progress.tutorialStep === 'learn' && !s.learning.tutorialSession && opt.count === 3 &&
        opt.rewardMaterial === 'wood' && opt.unitIds.length === 1 && opt.unitIds[0] === 'M01', '先に宝箱を開けてください。');
      s.learning.tutorialSession = createSession(action.id, opt);
      s.learning.attempts.push(s.learning.tutorialSession.attempts[0]);
      return;
    }
    const prior = s.learning.suspendedSession;
    requireRule(!prior || prior.status === 'completed' || action.replace, '中断中のミッションを再開するか、終了してください。');
    if (opt.mode === 'bridge') requireRule(s.world.lastSafeWorldId === 'greenwood_mine' && !s.world.repairedBridge && opt.count === 1 && opt.rewardMaterial === 'wood', 'この橋は修復済みです。');
    if (opt.mode === 'obby') requireRule(opt.count !== 1, 'オビーは3・5・10問です。');
    if (opt.mode === 'mining') requireRule(opt.rewardMaterial === 'stone', '採掘の報酬は石材です。');
    s.learning.suspendedSession = createSession(action.id, opt);
    s.learning.attempts.push(s.learning.suspendedSession.attempts[0]);
    if (opt.mode === 'mining' || opt.mode === 'obby') s.learning.lastMission = { ...opt };
    return;
  }

  const session = sessionOf(s, action.sessionId);
  const question = session.questions[session.questionIndex];
  requireRule(question?.instanceId === action.instanceId, '問題が切り替わりました。');
  if (action.type === 'discard') {
    requireRule(session.mode !== 'tutorial', '最初の3問はいつでも再開できます。');
    s.learning.suspendedSession = null;
    return;
  }
  if (action.type === 'suspend' || action.type === 'resume') {
    if (session.status !== 'completed') session.status = action.type === 'suspend' ? 'suspended' : 'active';
    return;
  }
  requireRule(session.status === 'active', 'ミッションを再開してください。');
  const attempt = session.attempts[session.questionIndex];
  if (action.type === 'gate') {
    requireRule(session.mode === 'obby' && !session.gateReady && !attempt.resolved, 'このゲートは開いています。');
    session.gateReady = true;
    return;
  }
  if (action.type === 'next') {
    requireRule(attempt.resolved && session.questionIndex + 1 < session.questions.length, '次の問題はまだ開けません。');
    session.questionIndex++;
    session.checkpointId = session.questionIndex;
    session.gateReady = session.mode !== 'obby';
    const record = newAttempt(session.questions[session.questionIndex]);
    session.attempts.push(record);
    s.learning.attempts.push(record);
    return;
  }
  requireRule(!attempt.resolved && session.gateReady, 'この問題にはすでに答えています。');
  if (!('ms' in action)) return;
  attempt.activeResponseMs += Math.max(0, Math.min(3_600_000, Math.round(action.ms) || 0));
  attempt.timestamp = new Date().toISOString();
  if (action.type === 'hint') {
    requireRule(attempt.hintCount < question.hints.length, 'ヒントはすべて表示されています。');
    attempt.hintCount++;
    if (attempt.attemptCount === 0) attempt.hintBeforeFirst = true;
  } else {
    if (action.type === 'answer') {
      const result = checkAnswer(question, action.input);
      requireRule(result !== 'format', '答えの形を確かめよう。');
      attempt.attemptCount++;
      if (attempt.firstSubmittedCorrect === null) attempt.firstSubmittedCorrect = result === 'correct';
      if (result === 'wrong') attempt.wrongCount++;
      else resolve(s, session, attempt);
    } else {
      attempt.guidedUsed = true;
      resolve(s, session, attempt);
    }
  }
  const record = s.learning.attempts.findIndex(entry => entry.instanceId === question.instanceId);
  requireRule(record >= 0, '学習記録が見つかりません。');
  s.learning.attempts[record] = { ...attempt };
}

function resolve(s: Save, session: Session, attempt: Session['attempts'][number]) {
  const material = session.rewardMaterial;
  grant(s, 'question:' + attempt.instanceId, { coin: 10, [material]: 2 }, 10);
  session.earned.coin += 10;
  session.earned[material] += 2;
  session.earned.xp += 10;
  attempt.resolved = true;
  attempt.resolvedWithHelp = attempt.hintCount > 0 || attempt.guidedUsed;
  session.clearedInstanceIds.push(attempt.instanceId);
  s.progress.counters.resolved++;
  s.progress.counters[attempt.unitId === 'M01' || attempt.unitId === 'M02' ? 'integers' : 'decimals']++;
  addUnique(s.progress.achievements, 'learning');
  if (attempt.wrongCount > 0) addUnique(s.progress.achievements, 'retry');
  if (session.questionIndex !== session.questions.length - 1) return;

  const completion = bonus[session.count];
  if (session.mode !== 'bridge') {
    grant(s, 'session:' + session.id + ':complete', { coin: completion.coin, [material]: completion.material }, completion.coin);
    session.earned.coin += completion.coin;
    session.earned[material] += completion.material;
    session.earned.xp += completion.coin;
  }
  if (session.mode === 'tutorial') {
    grant(s, 'tutorial:materials', { wood: 2, stone: 4 });
    session.earned.wood += 2;
    session.earned.stone += 4;
    s.progress.tutorialStep = 'craft';
  }
  if (session.mode === 'mining' || session.mode === 'obby') {
    if (!s.appliedEventIds.includes('first:' + session.mode)) {
      grant(s, 'first:' + session.mode, { coin: 20 });
      session.earned.coin += 20;
    }
    addUnique(s.progress.achievements, session.mode);
    if (session.originScreen === 'world') addUnique(s.world.unlocked, 'sky_park');
  }
  if (session.mode === 'bridge') addUnique(s.progress.completedQuestIds, 'bridge-materials');
  session.completionRewardGranted = true;
  session.status = 'completed';
}

export const nodeDefinitions = {
  'woods-timber': { material: 'wood', amount: 2, ms: 30_000 },
  'woods-grove': { material: 'wood', amount: 5, ms: 60_000 },
  'woods-stone': { material: 'stone', amount: 2, ms: 30_000 },
  'woods-vein': { material: 'stone', amount: 5, ms: 60_000 },
} as const;

import { maps, mineBarriers } from '../worlds/maps.ts';
import type { Point, Rect } from '../worlds/geometry.ts';
import { contains } from '../worlds/geometry.ts';

function inReach(at: Point, target: Point, barriers: Rect[]) {
  if (Math.hypot(target.x - at.x, target.z - at.z) > 2.5) return false;
  for (let t = .05; t < .96; t += .05) {
    if (barriers.some(b => contains(b, { x: at.x + (target.x - at.x) * t, z: at.z + (target.z - at.z) * t }))) return false;
  }
  return true;
}
function explore(s: Save, action: Extract<Command, { type: 'explore' }>) {
  requireRule(s.world.lastSafeWorldId === action.world, '現在地を確認してください。');
  const map = maps[action.world];
  const discovery = map.discoveries.find(d => d.id === action.marker);
  if (discovery) {
    requireRule(Math.hypot(action.at.x - discovery.point.x, action.at.z - discovery.point.z) <= discovery.radius, 'もう少し近づこう。');
    requireRule(discovery.id !== 'woods-waterfall' || s.world.repairedBridge, '先に橋を修復しよう。');
    grant(s, 'discovery:' + discovery.id, {}, 15);
    addUnique(s.world.discoveries, discovery.id);
    return;
  }
  const marker = map.markers.find(m => m.id === action.marker);
  const barriers = action.world === 'greenwood_mine' ? mineBarriers(s.world.repairedBridge) : map.obstacles;
  requireRule(marker && inReach(action.at, marker, barriers), 'もう少し近づこう。');
  const node = nodeDefinitions[marker.id as keyof typeof nodeDefinitions];
  if (node) {
    requireRule(node.material !== 'stone' || s.world.repairedBridge, '先に橋を修復しよう。');
    requireRule(!s.world.nodeCooldownMs[marker.id], '資源が戻るまで待とう。');
    requireRule(!s.appliedEventIds.includes('node:' + action.eventId), 'この採集は確定済みです。');
    grant(s, 'node:' + action.eventId, { [node.material]: node.amount }, 1);
    s.world.nodeCooldownMs[marker.id] = node.ms;
  } else if (marker.id === 'woods-chest') {
    grant(s, 'chest:' + marker.id, { coin: 20, wood: 2 }, 5);
    addUnique(s.world.openedChests, marker.id);
  } else throw new RuleError('この場所では採集できません。');
}

export function update(previous: Save, action: Command): Save {
  const s = structuredClone(previous);
  switch (action.type) {
    case 'start': case 'discard': case 'resume': case 'suspend': case 'next':
    case 'gate': case 'answer': case 'hint': case 'guide':
      learn(s, action);
      break;
    case 'settings': s.settings = { ...action.settings }; break;
    case 'avatar': s.player.avatar = { ...action.avatar }; break;
    case 'moved': if (s.progress.tutorialStep === 'move') s.progress.tutorialStep = 'chest'; break;
    case 'open-home-chest':
      requireRule(s.progress.tutorialStep === 'chest' || s.progress.tutorialStep === 'move', '宝箱は開いています。');
      grant(s, 'chest:home-chest', {}, 5);
      addUnique(s.world.openedChests, 'home-chest');
      s.progress.tutorialStep = 'learn';
      break;
    case 'craft': case 'buy-building': {
      requireRule(action.type === 'craft' ? s.world.lastSafeWorldId === 'home' : s.world.lastSafeWorldId === 'hub', '作業台か中央広場のショップを使いましょう。');
      const id = action.buildingId;
      const def = catalog[id];
      requireRule(s.recipes.includes(id), 'このレシピはまだ使えません。');
      const tutorialCraft = action.type === 'craft' && id === 'house_small' && s.progress.tutorialStep === 'craft';
      requireRule(tutorialCraft || s.progress.firstPlacedBuildingIds.includes('house_small'), 'まず最初の家を作って置きましょう。');
      requireRule(!s.buildings.some(b => b.instanceId === action.instanceId), 'この建物は取得済みです。');
      const cost = action.type === 'craft' ? def.cost : { ...zeroBalance, coin: def.shopPrice };
      grant(s, 'acquire:' + action.instanceId, { coin: -cost.coin, wood: -cost.wood, stone: -cost.stone });
      s.buildings.push({ instanceId: action.instanceId, buildingId: id, placement: null });
      if (tutorialCraft) s.progress.tutorialStep = 'place';
      break;
    }
    case 'buy-material':
      requireRule(s.world.lastSafeWorldId === 'hub', '中央広場のショップを使いましょう。');
      requireRule(s.progress.firstPlacedBuildingIds.includes('house_small'), 'まず最初の家を置こう。');
      grant(s, 'purchase:' + action.eventId, { coin: -5, [action.resource]: 1 });
      break;
    case 'place': case 'undo': {
      requireRule(s.world.lastSafeWorldId === 'home', '建築はマイアイランドで行えます。');
      const edit = action.type === 'undo' ? s.undo : action;
      requireRule(edit, '取り消せる建築操作がありません。');
      const building = s.buildings.find(b => b.instanceId === edit.instanceId);
      requireRule(building, '持ち物から建物を選んでください。');
      if (edit.placement) {
        const error = placementError(s.buildings, building, edit.placement);
        requireRule(!error, error ?? '');
      }
      s.undo = action.type === 'undo' ? null : { instanceId: building.instanceId, placement: building.placement };
      building.placement = edit.placement;
      if (edit.placement && !s.progress.firstPlacedBuildingIds.includes(building.buildingId)) {
        grant(s, 'placed:' + building.buildingId, {}, 10);
        addUnique(s.progress.firstPlacedBuildingIds, building.buildingId);
        if (building.buildingId === 'house_small') {
          s.progress.tutorialStep = 'hub';
          addUnique(s.world.unlocked, 'hub');
          addUnique(s.progress.achievements, 'house');
        }
      }
      break;
    }
    case 'travel':
      requireRule(s.world.unlocked.includes(action.world) &&
        (action.world === 'home' || s.world.unlocked.includes('hub')), 'この島はまだ開放されていません。');
      s.world.lastSafeWorldId = action.world;
      if (action.world === 'hub') {
        addUnique(s.progress.achievements, 'hub');
        if (s.progress.tutorialStep === 'hub') s.progress.tutorialStep = 'done';
      }
      break;
    case 'hub-guide':
      requireRule(s.world.lastSafeWorldId === 'hub', '中央広場の案内係に会おう。');
      addUnique(s.world.unlocked, 'greenwood_mine');
      break;
    case 'repair-bridge':
      requireRule(s.world.lastSafeWorldId === 'greenwood_mine' && s.progress.completedQuestIds.includes('bridge-materials'), '先に資材の問題を解こう。');
      grant(s, 'quest:bridge', {}, 20);
      s.world.repairedBridge = true;
      addUnique(s.progress.completedQuestIds, 'bridge');
      addUnique(s.progress.achievements, 'bridge');
      break;
    case 'explore': explore(s, action); break;
    case 'cooldown':
      for (const id of Object.keys(s.world.nodeCooldownMs)) {
        const left = s.world.nodeCooldownMs[id] - Math.max(0, Math.min(30_000, action.ms));
        if (left > 0) s.world.nodeCooldownMs[id] = left;
        else delete s.world.nodeCooldownMs[id];
      }
      break;
  }
  if (s.progress.counters.resolved >= 5) {
    addUnique(s.recipes, 'flowerbed');
    addUnique(s.recipes, 'bench');
    if (s.progress.firstPlacedBuildingIds.includes('house_small') && s.progress.islandStage === 1) {
      s.progress.islandStage = 2;
      addUnique(s.recipes, 'warehouse');
      grant(s, 'stage:2', {}, 50);
    }
  }
  if (s.progress.counters.resolved >= 10) addUnique(s.progress.achievements, 'ten');
  if (s.progress.counters.integers >= 10) addUnique(s.progress.collectionIds, 'integers');
  if (s.progress.counters.decimals >= 10) addUnique(s.progress.collectionIds, 'decimals');
  return s;
}

export function nearestMarker(world: WorldId, at: Point, repaired: boolean) {
  const map = maps[world];
  const barriers = world === 'greenwood_mine' ? mineBarriers(repaired) : map.obstacles;
  return map.markers.filter(m => inReach(at, m, barriers)).sort((a, b) =>
    Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z))[0];
}
