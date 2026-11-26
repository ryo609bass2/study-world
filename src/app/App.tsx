import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { VisualBuilding } from '../engine/WorldView.tsx';
import { Store } from './store.ts';
import { createSave } from './state.ts';
import type { Save } from './state.ts';
import { defaultAvatar } from './avatar.ts';
import { defaults, support } from './settings.ts';
import { nearestMarker } from './domain.ts';
import type { Command } from './domain.ts';
import type { Point } from '../worlds/geometry.ts';
import { bridgePlatform, maps, mineBarriers } from '../worlds/maps.ts';
import type { Marker, WorldId } from '../worlds/maps.ts';
import type { Session, SessionOptions } from '../learning/session.ts';
import { catalog, footprint, placementError, resources } from '../building/catalog.ts';
import type { Building, BuildingId, Placement, Rotation } from '../building/catalog.ts';
import { makeObby } from '../minigames/obby.ts';
import { levelAt, maxLevel, xpAt } from '../progression/levels.ts';
import { downloadBackup, parseBackup, resetSave } from '../persistence/backup.ts';
import { Modal, ResourceBar } from '../ui/components.tsx';
import { MissionForm, QuestionView, Results, modeLabels, tutorialOptions } from '../ui/Mission.tsx';
import { BuildingControls, CraftPanel, Inventory } from '../ui/Building.tsx';
import { AvatarFields, CollectionPanel, ProfilePanel, RecordsPanel, SettingsPanel } from '../ui/SettingsPanel.tsx';
import { useGameAudio } from '../ui/audio.ts';
import { Title } from '../ui/Title.tsx';

const WorldView = lazy(() => import('../engine/WorldView.tsx'));
const store = new Store();
type Panel = 'profiles' | 'setup' | 'mission' | 'question' | 'results' | 'menu' | 'map' | 'build' | 'craft' |
  'shop' | 'settings' | 'profile' | 'records' | 'collection' | 'data' | 'dialogue' | 'exit' | null;
type Intent = 'island' | 'quick';
const uid = () => crypto.randomUUID();
const objectives = {
  move: ['島を歩いてみよう', 'WASD・矢印キー、または移動スティックを使おう。'],
  chest: ['宝箱を見つけよう', '金色の宝箱に近づいて開けよう。'],
  learn: ['算数を3問解こう', 'コインと木材・石材が手に入るよ。'],
  craft: ['小さな家を作ろう', '作業台か「クラフト」から家を作ろう。'],
  place: ['小さな家を置こう', '明るい緑の建築エリアに置けるよ。'],
  hub: ['中央広場に行こう', '島のゲートかマップから移動できるよ。'],
  done: ['島を探検しよう', 'マップで行き先を選べるよ。'],
};
const unlockText = { home: '', hub: '最初の家を置こう', greenwood_mine: '中央広場の案内係に話そう', sky_park: '島から学習ミッションを1回達成しよう' };

export default function App() {
  const { save, busy, error, pending } = useSyncExternalStore(store.subscribe, store.snapshot);
  const [screen, setScreen] = useState<'title' | 'world'>('title');
  const [panel, setPanel] = useState<Panel>(null);
  const [intent, setIntent] = useState<Intent>('island');
  const [profiles, setProfiles] = useState<{ profileId: string; updatedAt: string }[]>([]);
  const [profilesReady, setProfilesReady] = useState(false);
  const [draftSettings, setDraftSettings] = useState(defaults);
  const [avatar, setAvatar] = useState(defaultAvatar);
  const [position, setPosition] = useState<Point>(maps.home.spawn);
  const [worldKey, setWorldKey] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const [slot, setSlot] = useState<'normal' | 'tutorial'>('normal');
  const [mode, setMode] = useState<'mining' | 'obby' | 'bridge'>();
  const [missionKey, setMissionKey] = useState(0);
  const [status, setStatus] = useState('');
  const [dialogue, setDialogue] = useState({ title: '', text: '' });
  const [build, setBuild] = useState<{ id: string; placement: Placement } | null>(null);
  const [confirm, setConfirm] = useState<{ text: string; run: () => Promise<void> } | null>(null);
  const [tracked, setTracked] = useState<string>();
  const [guide, setGuide] = useState(true);
  const [obby, setObby] = useState(false);
  const activeTime = useRef(0), nodeTime = useRef(0);
  const working = busy || !!pending;
  const settings = save?.settings ?? draftSettings;
  const playSound = useGameAudio(settings, screen === 'world');
  const worldId = save?.world.lastSafeWorldId ?? 'home';
  const step = save?.progress.tutorialStep ?? 'move';
  const normal = save?.learning.suspendedSession;
  const tutorial = save?.learning.tutorialSession;
  const session = slot === 'tutorial' ? tutorial : normal;
  const repaired = !!save?.world.repairedBridge;
  const world = useMemo(() => {
    const map = maps[worldId];
    return {
      ...map,
      platforms: worldId === 'greenwood_mine' && repaired ? [...map.platforms, bridgePlatform] : map.platforms,
      obstacles: worldId === 'greenwood_mine' ? mineBarriers(repaired) : map.obstacles,
      markers: map.markers.map(m => ({ ...m, depleted: !!save?.world.nodeCooldownMs[m.id] || !!save?.world.openedChests.includes(m.id) })),
    };
  }, [worldId, repaired, save?.world]);
  const course = useMemo(() => obby && session?.mode === 'obby' ? makeObby(session.checkpointId, session.actionDifficulty) : null,
    [obby, session?.mode, session?.checkpointId, session?.actionDifficulty]);
  const map = course?.map ?? world;
  const visibleBuildings = useMemo((): VisualBuilding[] => worldId === 'home' && !course && save
    ? save.buildings.flatMap(b => b.placement && b.instanceId !== build?.id
      ? [{ id: b.instanceId, type: b.buildingId, area: footprint(b.buildingId, b.placement), rotation: b.placement.rotation }] : [])
    : [], [worldId, save?.buildings, build?.id, !!course]);
  const building = save?.buildings.find(b => b.instanceId === build?.id);
  const buildError = build && building && save ? placementError(save.buildings, building, build.placement) : null;
  const preview = useMemo(() => build && building ? {
    id: build.id, type: building.buildingId, area: footprint(building.buildingId, build.placement), rotation: build.placement.rotation, valid: !buildError,
  } : undefined, [build, building?.buildingId, buildError]);
  const nearDef = !course && screen === 'world' ? nearestMarker(worldId, position, repaired) : undefined;
  const near = world.markers.find(m => m.id === nearDef?.id);
  const gate = !!course && Math.hypot(position.x - course.gate.x, position.z - course.gate.z) <= 2.3;
  const showUnavailable = useCallback(() => setUnavailable(true), []);
  const notify = (text: string) => setStatus(text);
  const mission = (value?: typeof mode) => { setMode(value); setMissionKey(k => k + 1); setPanel('mission'); };

  useEffect(() => {
    let active = true;
    void store.profiles().then(list => { if (active) setProfiles(list); },
      () => { if (active) notify('保存済みのプロフィールを確認できません。'); }).finally(() => { if (active) setProfilesReady(true); });
    return () => { active = false; };
  }, [save?.profileId]);
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(''), 5000);
    return () => clearTimeout(timer);
  }, [status]);

  async function dispatch(command: Command) {
    const ok = await store.dispatch(command);
    if (!ok) return false;
    if (command.type === 'place' || command.type === 'craft') playSound('build');
    if (command.type === 'explore') playSound('gather');
    if (command.type === 'answer' || command.type === 'guide') {
      const value = store.snapshot().save;
      const active = [value?.learning.tutorialSession, value?.learning.suspendedSession].find(s => s?.id === command.sessionId);
      if (active?.attempts[active.questionIndex].resolved) playSound('learn');
    }
    return true;
  }

  useEffect(() => {
    if (screen !== 'world' || !save || working || panel || course) return;
    if (step === 'move' && Math.hypot(position.x, position.z - 18) > .8) void store.dispatch({ type: 'moved' });
    const d = world.discoveries.find(d => !save.world.discoveries.includes(d.id) &&
      (d.id !== 'woods-waterfall' || repaired) && Math.hypot(position.x - d.point.x, position.z - d.point.z) <= d.radius);
    if (d) void store.dispatch({ type: 'explore', world: worldId, marker: d.id, at: position, eventId: uid() })
      .then(ok => { if (ok) notify('発見　' + d.label + '　+15 XP'); });
  }, [position, save, screen, panel, !!course, working]);

  async function flushTime() {
    const value = Math.floor(nodeTime.current);
    if (!value || !Object.keys(store.snapshot().save?.world.nodeCooldownMs ?? {}).length) { nodeTime.current = 0; return true; }
    if (!await store.dispatch({ type: 'cooldown', ms: value })) return false;
    nodeTime.current = Math.max(0, nodeTime.current - value);
    return true;
  }
  useEffect(() => {
    let prior = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(), dt = Math.min(1000, now - prior);
      prior = now;
      if (document.hidden || (screen === 'title' && panel !== 'question' && !course)) return;
      activeTime.current += dt;
      if (settings.sessionReminderMinutes && activeTime.current >= settings.sessionReminderMinutes * 60_000) {
        activeTime.current = 0; notify('そろそろひと休み。続けることもできるよ。');
      }
      if (!course && !panel && Object.keys(store.snapshot().save?.world.nodeCooldownMs ?? {}).length) {
        nodeTime.current += dt;
        if (nodeTime.current >= 4000 && !store.snapshot().busy && !store.snapshot().pending) void flushTime();
      }
    }, 1000);
    const hide = () => { if (document.hidden && !store.snapshot().busy && !store.snapshot().pending) void flushTime(); };
    document.addEventListener('visibilitychange', hide);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', hide); };
  }, [screen, panel, !!course, settings.sessionReminderMinutes]);

  function openWorld(id: WorldId) {
    setObby(false); setScreen('world'); setPanel(null); setPosition(maps[id].spawn); setTracked(undefined); setGuide(true);
    setWorldKey(k => k + 1);
  }
  function enter(what: Intent, value: Save | null = save) {
    setIntent(what);
    if (!value) { setPanel(profiles.length ? 'profiles' : 'setup'); return; }
    if (what === 'quick') mission();
    else openWorld(value.world.lastSafeWorldId);
  }
  async function travel(id: WorldId) {
    if (id === worldId || await dispatch({ type: 'travel', world: id })) openWorld(id);
  }
  async function start(options: SessionOptions, replace = false) {
    if (options.mode === 'obby' && unavailable) { notify('この端末では採掘クエストを遊べます。'); return; }
    if (options.mode !== 'tutorial' && normal && normal.status !== 'completed' && !replace) {
      setConfirm({ text: '中断中のミッションを終了して新しく始めますか？獲得した報酬は残ります。', run: () => start(options, true) });
      return;
    }
    if (!await dispatch({ type: 'start', id: uid(), options, replace })) return;
    setConfirm(null);
    openSession(options.mode === 'tutorial' ? store.snapshot().save!.learning.tutorialSession! : store.snapshot().save!.learning.suspendedSession!);
  }
  function openSession(s: Session) {
    setSlot(s.mode === 'tutorial' ? 'tutorial' : 'normal');
    const runningObby = s.mode === 'obby' && s.status !== 'completed';
    setObby(runningObby);
    if (runningObby) setPosition({ x: 0, z: 1 });
    setPanel(s.status === 'completed' ? 'results' : runningObby && !s.gateReady ? null : 'question');
  }
  async function resume(s: Session) {
    if (s.mode === 'obby' && unavailable) { notify('オビーには3D表示が必要です。'); return; }
    if (await dispatch({ type: 'resume', sessionId: s.id, instanceId: s.questions[s.questionIndex].instanceId })) openSession(s);
  }
  function startTutorial() {
    if (tutorial) void resume(tutorial);
    else void start(tutorialOptions);
  }
  async function suspend() {
    if (!session || busy || pending) return;
    if (session.status === 'completed' || await dispatch({ type: 'suspend', sessionId: session.id, instanceId: session.questions[session.questionIndex].instanceId })) {
      setPanel(null); setObby(false);
    }
  }
  async function repair() {
    if (await dispatch({ type: 'repair-bridge' })) { setPanel(null); notify('橋が開通！　鉱山区画に行けるようになったよ。'); }
  }
  function interact(marker: Marker) {
    if (marker.depleted) { notify(marker.kind === 'chest' ? 'この宝箱は開けたよ。' : '資源が戻るまで少し待とう。'); return; }
    switch (marker.kind) {
      case 'chest': case 'node':
        void dispatch(marker.id === 'home-chest' ? { type: 'open-home-chest' } :
          { type: 'explore', world: worldId, marker: marker.id, at: position, eventId: uid() }).then(ok => {
          if (ok) notify(marker.kind === 'chest' ? '宝箱を発見！' : '資源を集めたよ。持ち物で確認しよう。');
        }); break;
      case 'portal': if (marker.target) void travel(marker.target); break;
      case 'workbench': setPanel('craft'); break;
      case 'mining': mission('mining'); break;
      case 'obby': mission('obby'); break;
      case 'bridge':
        if (repaired) notify('橋は通れるよ。');
        else if (save?.progress.completedQuestIds.includes('bridge-materials')) void repair();
        else mission('bridge');
        break;
      case 'npc':
        if (marker.id === 'hub-shop') { setPanel('shop'); return; }
        if (marker.id === 'hub-guide') {
          void dispatch({ type: 'hub-guide' }).then(ok => {
            if (ok) { setDialogue({ title: marker.label, text: '森林・鉱山が開いたよ。西のゲートやマップから行けるよ。' }); setPanel('dialogue'); }
          });
        } else {
          setDialogue({ title: marker.label, text: marker.id === 'woods-camp' ? '西で木材を集められるよ。北東の鉱山へは橋を修復して進もう。'
            : marker.id === 'sky-guide' ? '足場を渡って算数ゲートへ進もう。落ちてもチェックポイントに戻れるよ。'
            : '学習で素材を集めて、マイアイランドに建物を増やそう。' });
          setPanel('dialogue');
        } break;
    }
  }
  async function gateAction() {
    if (session && gate && !session.gateReady && await dispatch({ type: 'gate', sessionId: session.id, instanceId: session.questions[session.questionIndex].instanceId })) setPanel('question');
  }

  function edit(b: Building) {
    setPanel(null); setBuild({ id: b.instanceId, placement: b.placement ?? { x: -2, y: 0, z: 4, rotation: 0 } });
  }
  async function craft(id: BuildingId) {
    const instanceId = uid();
    if (await dispatch({ type: 'craft', buildingId: id, instanceId })) {
      notify(catalog[id].name + 'を作ったよ。');
      if (id === 'house_small' && step === 'craft') edit({ buildingId: id, instanceId, placement: null });
    }
  }
  const rotate = () => setBuild(b => b && ({ ...b, placement: { ...b.placement, rotation: (b.placement.rotation + 90) % 360 as Rotation } }));
  const shift = (x: number, z: number) => setBuild(b => b && ({ ...b, placement: { ...b.placement, x: b.placement.x + x, z: b.placement.z + z } }));
  async function applyPlacement() {
    if (build && !buildError && await dispatch({ type: 'place', instanceId: build.id, placement: build.placement })) {
      setBuild(null); notify('建物を置いたよ！');
    }
  }

  useEffect(() => {
    if ((screen !== 'world' && !course) || panel || confirm || working) return;
    const handle = (e: KeyboardEvent) => {
      if (e.repeat || e.target instanceof HTMLElement && e.target.closest('input,select,textarea,[contenteditable]')) return;
      if (build) {
        if (e.code === 'KeyR') rotate();
        if (e.code === 'Enter' && !(e.target instanceof HTMLButtonElement)) void applyPlacement();
        if (e.code === 'Escape') { setBuild(null); setPanel('build'); }
        return;
      }
      if (e.code === 'Escape') { if (course) void suspend(); else setPanel('menu'); }
      if (e.code === 'KeyE' || e.code === 'KeyF') {
        if (course) void gateAction(); else if (near) interact(near);
      }
      if (course) return;
      if (e.code === 'KeyB' || e.code === 'KeyI') setPanel('build');
      if (e.code === 'KeyM') setPanel('map');
      if (e.code === 'KeyL') step === 'learn' && worldId === 'home' ? startTutorial() : mission('mining');
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  });

  function close() {
    if (panel === 'question') {
      if (session?.status === 'completed') setPanel('results');
      else void suspend();
    } else { if (panel === 'results' || panel === 'exit') setObby(false); setPanel(null); }
  }
  function title() { setConfirm(null); setObby(false); setBuild(null); setPanel(null); setScreen('title'); }
  async function exit() { if (await flushTime()) title(); }

  async function importFile(file: File) {
    try {
      if (file.size >= 25_000_000) throw new Error('ファイルが大きすぎます。');
      const value = parseBackup(await file.text());
      if (save) setConfirm({ text: 'このプロフィールを選んだデータで上書きしますか？以前のセーブは端末に保存されます。',
        run: async () => { if (await store.commit({ ...value, profileId: save.profileId })) title(); } });
    } catch (e) { notify(e instanceof Error ? e.message : 'ファイルを読み込めません。'); }
  }

  const resumeButtons = <>
    {normal && normal.status !== 'completed' && <button disabled={working} onClick={() => void resume(normal)}>{modeLabels[normal.mode]}を再開</button>}
    {tutorial && tutorial.status !== 'completed' && <button disabled={working} onClick={() => void resume(tutorial)}>最初の3問を再開</button>}
  </>;
  const recovery = pending && <div className="save-error" role="alert">
    <b>保存できませんでした</b><p>{error}</p><div className="button-row">
      <button disabled={busy} onClick={async () => {
        if (!await store.retry()) return;
        const current = store.snapshot().save?.learning.suspendedSession;
        if (panel === 'question' && current?.mode === 'obby' && !current.gateReady) setPanel(null);
      }}>保存を再試行</button>
      <button onClick={() => downloadBackup(pending)}>確定待ちデータを書き出す</button>
      {save && <button onClick={() => setConfirm({ text: '確定待ちの変更を取り消し、最新の保存を開きますか？',
        run: async () => { if (await store.load(save.profileId)) title(); } })}>最新データを読み直す</button>}
      <button onClick={() => setConfirm({ text: '未保存の変更を残したままタイトルに戻りますか？',
        run: async () => { title(); } })}>未保存でタイトルへ</button>
    </div></div>;

  let modal: { label: string; body: ReactNode; wide?: boolean } | undefined;
  const makeModal = (label: string, body: ReactNode, wide = false) => ({ label, body, wide });
  switch (panel) {
    case 'setup':
      modal = makeModal('冒険の準備', <div className="form-stack">
        <p>名前の登録は不要。学習記録はこの端末に保存されるよ。</p>
        <AvatarFields avatar={avatar} onChange={setAvatar} />
        <div className="button-row"><button aria-pressed={draftSettings === defaults} onClick={() => setDraftSettings(defaults)}>標準</button>
          <button aria-pressed={draftSettings === support} onClick={() => setDraftSettings(support)}>サポート</button></div>
        <button className="primary" disabled={working} onClick={async () => {
          if (await store.commit(createSave(uid(), draftSettings, avatar), null)) enter(intent, store.snapshot().save);
        }}>プロフィールを作る</button>
      </div>); break;
    case 'profiles':
      modal = makeModal('プロフィールを選ぶ', <div className="form-stack">
        {profiles.map(p => <button key={p.profileId} disabled={working} onClick={async () => {
          if (await store.load(p.profileId)) { nodeTime.current = 0; enter(intent, store.snapshot().save); }
        }}>プロフィール {p.profileId.slice(-6).toUpperCase()}　{new Date(p.updatedAt).toLocaleDateString('ja-JP')}</button>)}
        <button className="primary" disabled={working} onClick={() => setPanel('setup')}>新しく作る</button>
      </div>); break;
    case 'mission':
      modal = makeModal(mode === 'bridge' ? '橋の修復' : '学習ミッション', <>
        <div className="button-row resume-row">{resumeButtons}</div>
        {unavailable && <p>3Dを表示できません。採掘クエストはこの画面から遊べます。</p>}
        <MissionForm key={missionKey} settings={settings} last={screen === 'title' && mode !== 'bridge' ? save?.learning.lastMission ?? null : null} origin={screen} initialMode={mode}
          start={options => void start(options)} busy={working} />
      </>); break;
    case 'question':
      if (session) modal = makeModal(modeLabels[session.mode], <>
        <QuestionView key={session.questions[session.questionIndex].instanceId} session={session} settings={settings} busy={working}
          dispatch={async action => {
            const ok = await dispatch(action);
            if (ok && session.mode === 'obby' && action.type === 'next') { setPosition({ x: 0, z: 1 }); setPanel(null); }
            return ok;
          }} close={() => setPanel('results')} />
        {session.status !== 'completed' && <button className="subtle suspend" disabled={working} onClick={() => void suspend()}>セーブして中断</button>}
      </>); break;
    case 'results':
      if (session) modal = makeModal('リザルト', <><Results session={session} /><div className="button-row">
        {session.mode === 'bridge' && <button className="primary" disabled={working} onClick={() => void repair()}>橋を修復する</button>}
        {session.mode === 'tutorial' && <button className="primary" onClick={() => setPanel('craft')}>家を作る</button>}
        {(session.mode === 'mining' || session.mode === 'obby') && <button onClick={() => { setObby(false); mission(session.mode as 'mining' | 'obby'); }}>もう一度遊ぶ</button>}
        {!unavailable && <button onClick={() => void travel('home')}>マイアイランドへ</button>}
        {screen === 'world' && <button onClick={close}>探索に戻る</button>}
        <button onClick={() => setPanel('exit')}>タイトルへ</button>
      </div></>); break;
    case 'build':
      if (save) modal = makeModal('建築・持ち物', <Inventory save={save} busy={working} isHome={worldId === 'home' && !unavailable}
        choose={edit} craft={() => setPanel('craft')} store={instanceId => void dispatch({ type: 'place', instanceId, placement: null })}
        undo={() => void dispatch({ type: 'undo' })} />); break;
    case 'craft': case 'shop':
      if (save) modal = makeModal(panel === 'shop' ? 'ショップ' : 'クラフト', worldId !== 'home' && panel === 'craft'
        ? <><p>クラフトはマイアイランドでできるよ。</p><button onClick={() => void travel('home')}>マイアイランドへ</button></>
        : <CraftPanel save={save} busy={working} shop={panel === 'shop'} craft={id => void craft(id)}
          buy={id => setConfirm({ text: catalog[id].name + 'を ' + catalog[id].shopPrice + 'コインで買う？',
            run: async () => { if (await dispatch({ type: 'buy-building', buildingId: id, instanceId: uid() })) setConfirm(null); } })}
          buyMaterial={resource => setConfirm({ text: resources[resource] + 'を5コインで1個買う？',
            run: async () => { if (await dispatch({ type: 'buy-material', resource, eventId: uid() })) setConfirm(null); } })} />);
      break;
    case 'map':
      if (save) modal = makeModal('ワールドマップ', <><ul className="map-list">{(Object.keys(maps) as WorldId[]).map(id =>
        <li key={id}><div><b>{maps[id].name}</b><small>{id === worldId ? '現在地' : save.world.unlocked.includes(id) ? '移動できます' : unlockText[id]}</small></div>
          <button disabled={working || unavailable || worldId === id || !save.world.unlocked.includes(id)} onClick={() => void travel(id)}>移動</button></li>)}</ul>
        <h3>目標を追いかける</h3><div className="button-row">{world.markers.filter(m => !m.depleted).map(m =>
          <button key={m.id} aria-pressed={tracked === m.id} onClick={() => { setTracked(m.id); setGuide(true); setPanel(null); }}>{m.label}</button>)}</div>
      </>); break;
    case 'settings':
      modal = makeModal('設定', <SettingsPanel settings={settings} busy={working} data={save ? () => setPanel('data') : undefined}
        apply={value => { if (save) void dispatch({ type: 'settings', settings: value }).then(ok => { if (ok) setPanel(null); });
          else { setDraftSettings(value); setPanel(null); } }} />); break;
    case 'profile':
      if (save) modal = makeModal('プロフィール', <ProfilePanel save={save} busy={working}
        apply={value => void dispatch({ type: 'avatar', avatar: value }).then(ok => { if (ok) notify('外見を保存したよ。'); })} />); break;
    case 'records': if (save) modal = makeModal('学習記録', <RecordsPanel save={save} />, true); break;
    case 'collection': if (save) modal = makeModal('図鑑・実績', <CollectionPanel save={save} />); break;
    case 'data':
      if (save) modal = makeModal('セーブデータ', <div className="form-stack">
        <p>セーブはこの端末と公開先に保存されます。端末の設定で消えることがあります。</p>
        <button onClick={() => downloadBackup(save)}>JSONを書き出す</button>
        <label className="file-label">JSONを読み込む<input type="file" disabled={working} accept=".json,application/json"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} /></label>
        <button disabled={working} onClick={() => setConfirm({ text: 'このプロフィールを初期化しますか？',
          run: async () => { if (await store.commit(resetSave(save))) { nodeTime.current = 0; title(); } } })}>進み具合を初期化</button>
      </div>); break;
    case 'menu':
      modal = makeModal('メニュー', <div className="menu-grid">
        {([['mission','学習'],['build','建築・持ち物'],['map','マップ'],['profile','プロフィール'],['collection','図鑑・実績'],
          ['records','学習記録'],['settings','設定'],['data','セーブデータ'],['exit','セーブして終了']] as [Panel, string][]).map(([id, label]) =>
          <button key={id} onClick={() => id === 'mission' ? mission('mining') : setPanel(id)}>{label}</button>)}{resumeButtons}
      </div>); break;
    case 'dialogue': modal = makeModal(dialogue.title, <><p>{dialogue.text}</p><button onClick={close}>わかった</button></>); break;
    case 'exit':
      modal = makeModal('セーブして終了', <div className="form-stack">
        <p>{working ? '保存状態を確認してください。' : 'ここまでの進み具合は保存されているよ。'}</p>
        {save && <button onClick={() => downloadBackup(save)}>セーブを書き出す</button>}
        <button className="primary" disabled={working} onClick={() => void exit()}>タイトルへ戻る</button>
      </div>); break;
  }

  const guideMark = tracked ?? ({ move: 'home-chest', chest: 'home-chest', craft: 'home-workbench', hub: 'to-hub' } as Partial<Record<typeof step, string>>)[step];
  const target = world.markers.find(m => m.id === (guideMark ??
    (worldId === 'hub' && !save?.world.unlocked.includes('greenwood_mine') ? 'hub-guide' : worldId === 'greenwood_mine' && !repaired ? 'woods-bridge' : '')));
  const level = levelAt(save?.player.totalXP ?? 0);
  const showObjective = settings.guidance !== 'free' || worldId === 'home' && step !== 'done';
  const showWorld = screen === 'world' || !!course;
  const learn = () => worldId === 'home' && step === 'learn' ? startTutorial() : mission('mining');

  return <div className={'app' + (settings.reducedMotion ? ' reduce-motion' : '')} style={{ '--text-scale': settings.textScale } as CSSProperties}>
    {!showWorld && <Title hasSave={!!save || profiles.length > 0} blocked={working || !profilesReady} unavailable={unavailable}
      island={() => enter('island')} quick={() => enter('quick')} settings={() => setPanel('settings')}
      profiles={() => { if (!profilesReady) return; setIntent('island'); setPanel(profiles.length ? 'profiles' : 'setup'); }} resume={resumeButtons} />}
    {showWorld && save && <main className="world-screen">
      {!unavailable && <Suspense fallback={<div className="world-loading" role="status">島を読み込み中…</div>}>
        <WorldView key={worldKey} world={map} spawn={map.spawn} avatar={save.player.avatar}
          settings={course ? { ...settings, actionDifficulty: session!.actionDifficulty, autoCamera: false } : settings}
          paused={!!panel || !!confirm || !!pending} building={!!build} buildings={visibleBuildings} preview={preview}
          onPoint={point => setBuild(b => b && ({ ...b, placement: { ...b.placement, ...point } }))}
          onPosition={setPosition} onFall={() => { if (course) notify('チェックポイントに戻ったよ。'); }} onUnavailable={showUnavailable} />
      </Suspense>}
      {unavailable ? <section className="world-loading"><div><h1>3Dを表示できません</h1><p>採掘クエストはこの端末でも遊べます。</p>
        <div className="button-row"><button className="primary" onClick={() => { setObby(false); mission('mining'); }}>採掘クエストへ</button>
          <button onClick={() => setPanel('exit')}>タイトルへ戻る</button></div></div></section> :
      <div className={'hud' + (settings.simpleHUD ? ' simple' : '')}>
        <div className="hud-top">
          <div className="world-label"><span className="brand-mark" aria-hidden="true">▰</span><div><small>{course ? 'OBBY CHALLENGE' : 'STUDY WORLD'}</small><strong>{map.name}</strong></div></div>
          {!settings.simpleHUD && !course && <><ResourceBar value={save.economy} /><div className="level-pill">
            <b>Lv. {level}</b><small>{save.player.totalXP} XP</small>
            {level < maxLevel && <progress max={xpAt(level + 1) - xpAt(level)} value={save.player.totalXP - xpAt(level)} aria-label="次のレベルまで" />}</div></>}
          {course ? <button onClick={() => void suspend()}>セーブして中断</button> : !settings.simpleHUD && <button onClick={() => setPanel('map')}>マップ</button>}
        </div>
        {!build && course && session && <aside className="objective"><small>チェックポイント {session.checkpointId + 1} / {session.questions.length}</small>
          <b>足場を渡って算数ゲートへ</b><p>{session.actionDifficulty === 'assist' ? 'つながった道をまっすぐ進もう。' : '走る＋ジャンプで足場を渡ろう。'}</p></aside>}
        {!build && !course && showObjective && <aside className="objective">
          <small>目標</small><b>{worldId === 'home' && step !== 'done' ? objectives[step][0] : target?.label ?? '島を探検しよう'}</b>
          {guide && settings.guidance !== 'free' && <>{worldId === 'home' && <p>{objectives[step][1]}</p>}
            {target && <p>{direction(position, target)}　{Math.ceil(Math.hypot(target.x - position.x, target.z - position.z))}m</p>}</>}
          {worldId === 'home' && step !== 'done' && <div className="objective-actions">
            {step === 'learn' && <button disabled={working} onClick={startTutorial}>はじめての3問</button>}
            {step === 'craft' && <button onClick={() => setPanel('craft')}>クラフト</button>}
            {step === 'place' && <button onClick={() => setPanel('build')}>建築をひらく</button>}
            {step === 'hub' && <button disabled={working} onClick={() => void travel('hub')}>中央広場へ</button>}
            {(step === 'move' || step === 'chest') && settings.guidance !== 'free' && <button className="subtle" onClick={() => setGuide(!guide)}>{guide ? '説明を閉じる' : '説明を読む'}</button>}
          </div>}
        </aside>}
        {!build && !panel && !course && near && <button className="context-button primary" disabled={working} onClick={() => interact(near)}><small>E ／ タップ</small>{near.label}</button>}
        {!build && !panel && course && gate && <button className="context-button primary" disabled={working} onClick={() => void gateAction()}><small>E ／ タップ</small>算数ゲートをひらく</button>}
        {!build && !course && <nav className="game-nav" aria-label="島の操作">
          <button disabled={working} onClick={() => void travel('home')}>ホーム</button><button onClick={learn}>学習</button>
          {!settings.simpleHUD && <><button onClick={() => setPanel('craft')}>クラフト</button><button onClick={() => setPanel('build')}>建築・持ち物</button></>}
          <button onClick={() => setPanel('menu')}>メニュー</button>
        </nav>}
        {build && building && <BuildingControls building={building} placement={build.placement} error={buildError} busy={working}
          rotate={rotate} move={shift} apply={() => void applyPlacement()} close={() => { setBuild(null); setPanel('build'); }} />}
      </div>}
    </main>}
    <div className="save-indicator" role="status">{pending ? '保存エラー' : busy ? '保存中…' : save ? '保存済み' : ''}</div>
    {!modal && !confirm && !pending && (status || error) && <div className="toast" role="status">{status || error}<button aria-label="お知らせを閉じる" onClick={() => { setStatus(''); store.clearError(); }}>×</button></div>}
    {!modal && !confirm && recovery && <Modal title="セーブの確認" close={() => setPanel('exit')}>{recovery}</Modal>}
    {modal && <Modal key={panel} title={modal.label} close={close} wide={modal.wide}>
      {recovery || (error && <p className="inline-error" role="alert">{error} <button className="subtle" onClick={() => store.clearError()}>閉じる</button></p>)}
      {status && <p className="inline-status" role="status">{status}</p>}{modal.body}
    </Modal>}
    {confirm && <Modal title="確認" close={() => setConfirm(null)}>
      <p>{confirm.text}</p>{error && <p role="alert">{error}</p>}
      <div className="button-row"><button onClick={() => setConfirm(null)}>戻る</button>
        <button className="primary" disabled={busy} onClick={() => void confirm.run()}>進む</button></div>
    </Modal>}
  </div>;
}

function direction(a: Point, b: Point) {
  const x = b.x - a.x, z = b.z - a.z;
  if (Math.hypot(x, z) < 1) return 'すぐ近く';
  return Math.abs(x) > Math.abs(z) ? (x > 0 ? '東' : '西') : (z > 0 ? '南' : '北');
}
