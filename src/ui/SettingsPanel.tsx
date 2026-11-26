import { useState } from 'react';
import type { AvatarConfig } from '../app/avatar.ts';
import { defaults, difficulties, actionDifficulties, support } from '../app/settings.ts';
import type { Settings } from '../app/settings.ts';
import type { Save } from '../app/state.ts';
import { skills, unitIds, units } from '../learning/math.ts';
import { achievements, treasures, levelAt, maxLevel, xpAt } from '../progression/levels.ts';

export const avatarPresets: { name: string; avatar: AvatarConfig }[] = [
  { name: 'リーフ', avatar: { hair: 0, skin: 1, hairColor: 0, face: 0, outfit: 0, color: 0 } },
  { name: 'ブルー', avatar: { hair: 1, skin: 2, hairColor: 3, face: 1, outfit: 1, color: 1 } },
  { name: 'サン', avatar: { hair: 2, skin: 0, hairColor: 1, face: 2, outfit: 2, color: 3 } },
];

const avatarFields = { hair: ['髪型', 3], skin: ['肌の色', 4], hairColor: ['髪の色', 4],
  face: ['顔', 3], outfit: ['服', 3], color: ['服の色', 5] } as const;

export function AvatarFields({ avatar, onChange }: { avatar: AvatarConfig; onChange: (avatar: AvatarConfig) => void }) {
  return <>
    <div className="button-row">{avatarPresets.map(p => <button key={p.name} type="button" onClick={() => onChange(p.avatar)}>{p.name}</button>)}</div>
    <div className="form-grid">{(Object.keys(avatarFields) as (keyof AvatarConfig)[]).map(id => {
      const [label, count] = avatarFields[id];
      return <label key={id}>{label}<select value={avatar[id]} onChange={e => onChange({ ...avatar, [id]: Number(e.target.value) })}>
        {Array.from({ length: count }, (_, value) => <option key={value} value={value}>{value + 1}</option>)}
      </select></label>;
    })}</div>
  </>;
}

export function ProfilePanel({ save, busy, apply }: { save: Save; busy: boolean; apply: (a: AvatarConfig) => void }) {
  const [avatar, setAvatar] = useState(save.player.avatar);
  const level = levelAt(save.player.totalXP);
  return <div className="form-stack">
    <p><b>Lv. {level}</b>　{save.player.totalXP} XP　{level < maxLevel ? '次のLvまで ' + (xpAt(level + 1) - save.player.totalXP) + ' XP' : '最高レベル'}</p>
    <p>島の発展　ステージ {save.progress.islandStage}</p>
    <AvatarFields avatar={avatar} onChange={setAvatar} />
    <button className="primary" disabled={busy} onClick={() => apply(avatar)}>外見を保存</button>
  </div>;
}

export function SettingsPanel({ settings, busy, apply, data }: { settings: Settings; busy: boolean; apply: (s: Settings) => void; data?: () => void }) {
  const [value, setValue] = useState(settings);
  const change = <K extends keyof Settings,>(id: K, v: Settings[K]) => setValue(s => ({ ...s, [id]: v }));
  const toggles = {
    simpleHUD: 'シンプル表示', autoHint: 'ヒントの提案', reducedMotion: '演出を控えめにする',
    autoCamera: 'カメラ補助', fallProtection: '落下時に早く戻る', slowMove: 'ゆっくり移動', leftHanded: '左利き用タッチ配置',
  } as const;
  return <form className="form-stack" onSubmit={e => { e.preventDefault(); apply(value); }}>
    <div className="button-row"><button type="button" onClick={() => setValue({ ...defaults })}>標準プリセット</button>
      <button type="button" onClick={() => setValue({ ...support })}>サポートプリセット</button></div>
    <div className="form-grid">
      <label>学習の難しさ<select value={value.learningDifficulty} onChange={e => change('learningDifficulty', e.target.value as Settings['learningDifficulty'])}>
        {Object.entries(difficulties).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>操作の難しさ<select value={value.actionDifficulty} onChange={e => change('actionDifficulty', e.target.value as Settings['actionDifficulty'])}>
        {Object.entries(actionDifficulties).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>道案内<select value={value.guidance} onChange={e => change('guidance', e.target.value as Settings['guidance'])}>
        <option value="free">自由探索</option><option value="standard">標準</option><option value="support">ルート案内</option></select></label>
      <label>文字の大きさ<select value={value.textScale} onChange={e => change('textScale', Number(e.target.value) as Settings['textScale'])}>
        {[1, 1.25, 1.5].map(n => <option key={n} value={n}>{n * 100}%</option>)}</select></label>
      <label>画質<select value={value.graphics} onChange={e => change('graphics', e.target.value as Settings['graphics'])}>
        <option value="low">軽量</option><option value="standard">標準</option><option value="high">高画質</option></select></label>
      <label>カメラ感度<select value={value.cameraSensitivity} onChange={e => change('cameraSensitivity', e.target.value as Settings['cameraSensitivity'])}>
        <option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
      <label>プレイ時間のお知らせ<select value={value.sessionReminderMinutes} onChange={e => change('sessionReminderMinutes', Number(e.target.value) as Settings['sessionReminderMinutes'])}>
        <option value={0}>オフ</option>{[5, 10, 15].map(n => <option key={n} value={n}>{n}分</option>)}</select></label>
      {(['bgmVolume', 'seVolume'] as const).map(id => <label key={id}>{id === 'bgmVolume' ? '音楽' : '効果音'} {value[id]}%
        <input type="range" min={0} max={100} value={value[id]} onChange={e => change(id, Number(e.target.value))} /></label>)}
    </div>
    <div className="checks">{(Object.keys(toggles) as (keyof typeof toggles)[]).map(id =>
      <label key={id}><input type="checkbox" checked={value[id]} onChange={e => change(id, e.target.checked)} />{toggles[id]}</label>)}</div>
    <div className="button-row"><button className="primary" disabled={busy}>設定を保存</button>{data && <button type="button" onClick={data}>セーブデータ</button>}</div>
  </form>;
}

export function RecordsPanel({ save }: { save: Save }) {
  const attempts = save.learning.attempts;
  return <>
    <p>初回正答率は、最初の回答をした問題で集計します。「一緒に解く」だけで完了した問題は、回答数に含みません。</p>
    <div className="table-scroll"><table>
      <thead><tr>{['単元・技能','出題','解決','初回回答','初回正答','ヒントなし正答','支援'].map(s => <th key={s}>{s}</th>)}</tr></thead>
      <tbody>{unitIds.flatMap(id => skills[id].map(skill => {
        const a = attempts.filter(a => a.skillId === skill);
        const skillName: Record<string, string> = { add: 'たし算', sub: 'ひき算', mul: 'かけ算', div: 'わり算' };
        const submitted = a.filter(x => x.attemptCount > 0).length;
        const rate = (n: number) => submitted ? n + '（' + Math.round(n * 100 / submitted) + '%）' : '—';
        const label = skills[id].length === 1 ? units[id] : units[id].split('の')[0] + 'の' + skillName[skill.split('.')[1]];
        return <tr key={skill}><th scope="row">{label}</th>
          <td>{a.length}</td><td>{a.filter(x => x.resolved).length}</td><td>{submitted}</td>
          <td>{rate(a.filter(x => x.firstSubmittedCorrect).length)}</td><td>{rate(a.filter(x => x.firstSubmittedCorrect && !x.hintBeforeFirst && !x.guidedUsed).length)}</td>
          <td>{a.filter(x => x.resolvedWithHelp).length}</td></tr>;
      }))}</tbody>
    </table></div>
  </>;
}

export function CollectionPanel({ save }: { save: Save }) {
  return <>
    <h3>称号　{save.progress.achievements.includes('ten') ? '島の学び手' : '島の探検家'}</h3>
    <h3>実績</h3><ul className="collection-list">{Object.entries(achievements).map(([id, label]) =>
      <li key={id}>{save.progress.achievements.includes(id as keyof typeof achievements) ? '達成' : '未達成'}　{label}</li>)}</ul>
    <h3>学びの宝物</h3><ul className="collection-list">{Object.entries(treasures).map(([id, label]) =>
      <li key={id}>{save.progress.collectionIds.includes(id as keyof typeof treasures) ? '登録済み' : '累計10問で登録'}　{label}</li>)}</ul>
    <h3>発見した場所</h3><p>{save.world.discoveries.map(d => ({ 'woods-ruins': '森の遺跡', 'woods-waterfall': '青の滝' })[d] || d).join('・') || 'まだ発見した場所はありません。'}</p>
  </>;
}
