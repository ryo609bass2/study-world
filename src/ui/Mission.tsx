import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { actionDifficulties, difficulties } from '../app/settings.ts';
import type { Settings } from '../app/settings.ts';
import type { Command } from '../app/domain.ts';
import { checkAnswer, display, unitIds, units } from '../learning/math.ts';
import type { UnitId } from '../learning/math.ts';
import type { Session, SessionOptions } from '../learning/session.ts';
import { ResourceBar, buttonClass } from './components.tsx';

export const modeLabels = { mining: '採掘クエスト', obby: 'オビーチャレンジ', bridge: '橋の修復', tutorial: 'はじめての学習' } as const;
export const tutorialOptions: SessionOptions = {
  mode: 'tutorial', unitIds: ['M01'], difficulty: 'basic', actionDifficulty: 'assist', count: 3,
  answerMode: 'choice', rewardMaterial: 'wood', originScreen: 'world',
};

export function MissionForm({ settings, last, origin, initialMode, start, busy }: {
  settings: Settings; last: SessionOptions | null; origin: 'title' | 'world';
  initialMode?: 'mining' | 'obby' | 'bridge'; start: (options: SessionOptions) => void; busy: boolean;
}) {
  const initial = initialMode ?? (last?.mode === 'obby' ? 'obby' : 'mining');
  const modeStart = initial === 'bridge' ? 'bridge' : initial;
  const [options, setOptions] = useState<SessionOptions>({
    mode: modeStart, unitIds: modeStart === 'bridge' ? ['M02'] : last?.unitIds ?? ['M01'], difficulty: last?.difficulty ?? settings.learningDifficulty,
    actionDifficulty: last?.actionDifficulty ?? settings.actionDifficulty,
    count: modeStart === 'bridge' ? 1 : last?.count === 1 && modeStart === 'obby' ? 3 : last?.count ?? 3,
    answerMode: last?.answerMode === 'number' ? 'number' : modeStart === 'obby' ? 'worldChoice' : 'choice',
    rewardMaterial: modeStart === 'bridge' ? 'wood' : modeStart === 'mining' ? 'stone' : last?.rewardMaterial ?? 'wood', originScreen: origin,
  });
  const change = <K extends keyof SessionOptions,>(field: K, value: SessionOptions[K]) => setOptions(previous => ({ ...previous, [field]: value }));
  const selectMode = (mode: 'mining' | 'obby') => setOptions(old => ({
    ...old, mode, rewardMaterial: mode === 'mining' ? 'stone' : 'wood',
    answerMode: mode === 'obby' ? 'worldChoice' : old.answerMode === 'worldChoice' ? 'choice' : old.answerMode,
    count: mode === 'obby' && old.count === 1 ? 3 : old.count,
  }));
  const toggle = (unit: UnitId) => change('unitIds', options.unitIds.includes(unit)
    ? options.unitIds.filter(value => value !== unit) : [...options.unitIds, unit]);
  return <form className="form-stack" onSubmit={e => { e.preventDefault(); start(options); }}>
    {options.mode !== 'bridge' && <div className="activity-picker">
      <button type="button" className="activity-card" aria-pressed={options.mode === 'mining'} onClick={() => selectMode('mining')}>
        <span className="activity-icon mining-icon" aria-hidden="true">◆</span><span><b>採掘クエスト</b><small>算数を解いて石材を集めよう</small></span>
      </button>
      <button type="button" className="activity-card" aria-pressed={options.mode === 'obby'} onClick={() => selectMode('obby')}>
        <span className="activity-icon obby-icon" aria-hidden="true">▰</span><span><b>オビーチャレンジ</b><small>足場を渡って算数ゲートに挑戦</small></span>
      </button>
    </div>}
    {options.mode === 'mining' && <div className="mining-seam"><span aria-hidden="true">◆</span><div><b>石材の鉱床</b><small>1問解決するごとに石材を2個採掘できます。</small></div></div>}
    <fieldset><legend>算数の単元</legend><div className="unit-list">
      {unitIds.map(id => <label className="chip" key={id}><input type="checkbox" checked={options.unitIds.includes(id)} onChange={() => toggle(id)} /><span>{units[id]}</span></label>)}
    </div></fieldset>
    <div className="form-grid">
      <label>学習の難しさ<select value={options.difficulty} onChange={e => change('difficulty', e.target.value as Settings['learningDifficulty'])}>
        {Object.entries(difficulties).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
      </select></label>
      {options.mode === 'obby' && <label>操作の難しさ<select value={options.actionDifficulty} onChange={e => change('actionDifficulty', e.target.value as Settings['actionDifficulty'])}>
        {Object.entries(actionDifficulties).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
      </select></label>}
      {options.mode !== 'bridge' && <label>問題数<select value={options.count} onChange={e => change('count', Number(e.target.value) as SessionOptions['count'])}>
        {(options.mode === 'mining' ? [1, 3, 5, 10] : [3, 5, 10]).map(n => <option key={n} value={n}>{n}問</option>)}
      </select></label>}
      <label>答え方<select value={options.answerMode} onChange={e => change('answerMode', e.target.value as SessionOptions['answerMode'])}>
        <option value={options.mode === 'obby' ? 'worldChoice' : 'choice'}>{options.mode === 'obby' ? '足場パネル' : '選択式'}</option>
        <option value="number">数字を入力</option>
      </select></label>
      {options.mode === 'obby' && <label>報酬の素材<select value={options.rewardMaterial} onChange={e => change('rewardMaterial', e.target.value as SessionOptions['rewardMaterial'])}>
        <option value="wood">木材</option><option value="stone">石材</option>
      </select></label>}
    </div>
    <button className={buttonClass} type="submit" disabled={busy || options.unitIds.length === 0}>ミッションをはじめる</button>
  </form>;
}

export function QuestionView({ session, settings, busy, dispatch, close }: {
  session: Session; settings: Settings; busy: boolean; dispatch: (action: Command) => Promise<boolean>; close: () => void;
}) {
  const question = session.questions[session.questionIndex];
  const attempt = session.attempts[session.questionIndex];
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [guide, setGuide] = useState(false);
  const timer = useRef({ since: 0, total: 0 });
  useEffect(() => {
    const change = () => {
      const now = performance.now();
      if (timer.current.since) timer.current.total += now - timer.current.since;
      timer.current.since = document.hidden ? 0 : now;
    };
    change();
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  const key = { sessionId: session.id, instanceId: question.instanceId };
  const duration = () => timer.current.total + (timer.current.since ? performance.now() - timer.current.since : 0);
  const restart = () => { timer.current = { since: document.hidden ? 0 : performance.now(), total: 0 }; };
  const execute = async (value: Command) => {
    const result = await dispatch(value);
    if (result) restart();
    return result;
  };
  const answer = async (event: FormEvent) => {
    event.preventDefault();
    const verdict = checkAnswer(question, input);
    if (verdict === 'format') {
      setMessage(question.choices ? '答えを選んでから「答える」を押そう。' : '数字で答えを入力しよう。例 8.4');
      return;
    }
    if (await execute({ type: 'answer', ...key, input, ms: duration() })) {
      setMessage(verdict === 'wrong' ? 'もう一度考えてみよう。' : '');
      if (verdict === 'wrong') setInput('');
    }
  };
  return <div className="question-view">
    <div className="question-meta"><span>{units[question.unitId]}</span><b>{session.questionIndex + 1} / {session.questions.length} 問</b></div>
    <progress max={session.questions.length} value={session.clearedInstanceIds.length} aria-label="解決した問題数" />
    <p className="question-prompt">{question.prompt}</p>
    <p className="equation">{question.expression}<span> ＝ ？</span>{question.unitLabel && <small> {question.unitLabel}</small>}</p>
    {attempt.resolved ? <>
      {session.mode === 'mining' && <div className="mining-seam excavated" aria-hidden="true"><span>◆</span><b>石材 +2</b></div>}
      <div className="answer-feedback" role="status"><strong>{attempt.guidedUsed ? '手順を確認できた！' : '正解！'}　{display(question.answer)}</strong><p>{question.explanation}</p><small>+10 コイン　+2 {session.rewardMaterial === 'wood' ? '木材' : '石材'}　+10 XP</small></div>
      <button className={buttonClass} disabled={busy} onClick={() => session.status === 'completed' ? close() : void dispatch({ type: 'next', ...key })}>
        {session.status === 'completed' ? '結果を見る' : session.mode === 'obby' ? '次の足場へ' : '次の問題へ'}
      </button>
    </> : <>
      <form className="form-stack" onSubmit={answer}>
        {question.choices ? <div className={'answer-options ' + (question.answerMode === 'worldChoice' ? 'platform-options' : '')} role="group" aria-label="答えの選択肢">
          {question.choices.map((choice, i) => <button type="button" aria-pressed={choice.id === input} key={choice.id}
            onClick={() => { setInput(choice.id); setMessage(''); }}><span>{i + 1}</span>{choice.label}</button>)}
        </div> : <>
          <label className="number-label">答え<input autoComplete="off" inputMode="decimal" maxLength={12} value={input}
            onChange={e => { setInput(e.target.value); setMessage(''); }} /></label>
          <div className="keypad" aria-label="画面テンキー">{['1','2','3','4','5','6','7','8','9','.','0','削除'].map(value =>
            <button key={value} type="button" onClick={() => setInput(old => value === '削除' ? old.slice(0, -1) : (old + value).slice(0, 12))}>{value}</button>)}</div>
        </>}
        <div className="answer-buttons">
          <button className={buttonClass} type="submit" disabled={busy}>答える</button>
          <button type="button" disabled={busy || attempt.hintCount >= question.hints.length} onClick={() => void execute({ type: 'hint', ...key, ms: duration() })}>ヒント</button>
        </div>
      </form>
      <p className="feedback-line" role="status">{message || (attempt.wrongCount ? 'もう一度考えてみよう。' : '')}
        {settings.autoHint && attempt.wrongCount >= 2 && !attempt.hintCount ? ' ヒントも使えるよ。' : ''}</p>
      {!!attempt.hintCount && <ol className="hint-card">{question.hints.slice(0, attempt.hintCount).map(hint => <li key={hint}>{hint}</li>)}</ol>}
      <button className="subtle" aria-expanded={guide} onClick={() => setGuide(!guide)}>{attempt.wrongCount >= 3 ? '手順を見て一緒に解こう' : '一緒に解く'}</button>
      {guide && <div className="hint-card"><ol>{question.guidedSteps.map(step => <li key={step}>{step}</li>)}</ol>
        <button disabled={busy} onClick={() => void execute({ type: 'guide', ...key, ms: duration() })}>手順を確認した</button></div>}
    </>}
  </div>;
}

export function Results({ session }: { session: Session }) {
  const first = session.attempts.filter(a => a.firstSubmittedCorrect).length;
  const support = session.attempts.filter(a => a.resolvedWithHelp).length;
  const { coin, wood, stone, xp } = session.earned;
  return <div className="results">
    <p className="eyebrow">{session.mode === 'bridge' ? 'REPAIR KIT' : 'MISSION COMPLETE'}</p>
    <h3>{session.mode === 'bridge' ? '修復用の資材がそろった！' : 'ミッション達成！'}</h3>
    <dl className="result-stats"><div><dt>解決</dt><dd>{session.clearedInstanceIds.length}</dd></div><div><dt>初回正答</dt><dd>{first}</dd></div><div><dt>支援を使って解決</dt><dd>{support}</dd></div></dl>
    <ResourceBar value={{ coin, ...(wood ? { wood } : {}), ...(stone ? { stone } : {}) }} positive />
    <p>活動経験値　+{xp} XP</p>
  </div>;
}
