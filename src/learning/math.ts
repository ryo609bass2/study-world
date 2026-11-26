import type { Difficulty } from '../app/settings.ts';

export const units = {
  M01: '整数のたし算・ひき算', M02: '整数のかけ算・わり算',
  M03: '小数のたし算・ひき算', M04: '小数のかけ算', M05: '小数のわり算',
} as const;
export type UnitId = keyof typeof units;
export const unitIds = Object.keys(units) as UnitId[];
export type AnswerMode = 'choice' | 'number' | 'worldChoice';
export type QuestionContext = 'practice' | 'mining' | 'obby' | 'bridge' | 'tutorial';
export interface ExactNumber { coefficient: string; scale: number }
export interface Choice { id: string; label: string; value: ExactNumber }
export interface Question {
  schemaVersion: 1;
  questionId: string; instanceId: string; subject: 'math'; grade: 5;
  unitId: UnitId; skillId: string; difficulty: Difficulty; answerMode: AnswerMode;
  prompt: string; expression: string; unitLabel?: string;
  answer: ExactNumber; choices?: Choice[];
  hints: string[]; guidedSteps: string[]; explanation: string;
  context: QuestionContext; rewardProfileId: 'standard'; seed: string;
}

export type Skill = 'M01.add' | 'M01.sub' | 'M02.mul' | 'M02.div' | 'M03.add' | 'M03.sub' | 'M04.mul' | 'M05.div';
export const skills: Record<UnitId, readonly Skill[]> = {
  M01: ['M01.add', 'M01.sub'], M02: ['M02.mul', 'M02.div'],
  M03: ['M03.add', 'M03.sub'], M04: ['M04.mul'], M05: ['M05.div'],
};

export function exact(coefficient: bigint | number | string, scale = 0): ExactNumber {
  let value = BigInt(coefficient);
  while (scale > 0 && value % 10n === 0n) {
    scale--;
    value /= 10n;
  }
  return { coefficient: value.toString(), scale };
}

export function display(value: ExactNumber): string {
  const text = value.coefficient.padStart(value.scale + 1, '0');
  return value.scale === 0 ? text : text.slice(0, -value.scale) + '.' + text.slice(-value.scale);
}

export function parseNumber(input: string): ExactNumber | null {
  const text = input.trim().replace(/[０-９．]/g, value => String.fromCharCode(value.charCodeAt(0) - 0xfee0));
  if (text.length > 12 || !/^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return exact(whole + fraction, fraction.length);
}

function align(value: ExactNumber, scale: number) {
  return BigInt(value.coefficient) * 10n ** BigInt(scale - value.scale);
}

export function equal(a: ExactNumber, b: ExactNumber): boolean {
  const scale = Math.max(a.scale, b.scale);
  return align(a, scale) === align(b, scale);
}

export function checkAnswer(question: Question, input: string): 'correct' | 'wrong' | 'format' {
  const value = question.answerMode === 'number' ? parseNumber(input) : question.choices?.find(c => c.id === input)?.value;
  if (!value) return 'format';
  return equal(value, question.answer) ? 'correct' : 'wrong';
}

function random(seed: string) {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return (min: number, max: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return min + Math.floor(state / 4294967296 * (max - min + 1));
  };
}

function shuffled<T>(values: readonly T[], rand: ReturnType<typeof random>): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rand(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

type Operation = '+' | '−' | '×' | '÷';
type Expression = { left: ExactNumber; right: ExactNumber; result: ExactNumber; operation: Operation };

function arithmetic(left: ExactNumber, right: ExactNumber, operation: Exclude<Operation, '÷'>): Expression {
  const scale = Math.max(left.scale, right.scale);
  const a = align(left, scale), b = align(right, scale);
  const result = operation === '×'
    ? exact(BigInt(left.coefficient) * BigInt(right.coefficient), left.scale + right.scale)
    : exact(operation === '+' ? a + b : a - b, scale);
  return { left, right, result, operation };
}

function division(right: ExactNumber, result: ExactNumber): Expression {
  return { left: arithmetic(right, result, '×').result, right, result, operation: '÷' };
}

function generate(seed: string, skill: Skill, difficulty: Difficulty): Expression {
  const roll = random(seed);
  const rank = { basic: 0, standard: 1, advanced: 2 }[difficulty];
  const min = (bounds: number[]) => bounds[rank];
  const n = (a: number, b: number, s = 0) => exact(roll(a, b), s);
  switch (skill) {
    case 'M01.add': {
      const a = min([1, 10, 100]), b = min([9, 999, 9999]);
      return arithmetic(n(a, b), n(a, b), '+');
    }
    case 'M01.sub': {
      const left = n(min([1, 10, 100]), min([20, 999, 9999]));
      return arithmetic(left, n(0, Number(left.coefficient)), '−');
    }
    case 'M02.mul':
      return arithmetic(n(min([1, 10, 10]), min([9, 99, 999])), n(min([1, 2, 10]), min([9, 19, 99])), '×');
    case 'M02.div':
      return division(n(min([2, 2, 10]), min([9, 19, 99])), n(min([1, 2, 10]), min([9, 99, 99])));
    case 'M03.add':
    case 'M03.sub': {
      const scale = min([1, 1, 2]), max = min([9, 999, 9999]), a = roll(1, max);
      return arithmetic(exact(a, scale), n(1, skill === 'M03.sub' ? a : max, scale), skill === 'M03.add' ? '+' : '−');
    }
    case 'M04.mul':
      return arithmetic(n(1, min([99, 99, 999]), min([1, 1, 2])), n(rank ? 1 : 2, rank ? 99 : 9, rank ? 1 : 0), '×');
    case 'M05.div':
      return division(n(min([2, 1, 1]), min([9, 99, 999]), rank), n(1, 99, rank === 1 ? 0 : 1));
  }
}

function steps(expression: Expression): { hints: string[]; guidedSteps: string[]; explanation: string } {
  const { left, right, result, operation } = expression;
  const a = display(left), b = display(right), c = display(result);
  const leftInt = left.coefficient, rightInt = right.coefficient;
  const scale = Math.max(left.scale, right.scale);
  const power = 10 ** scale;
  const integerEquation = align(left, scale) + ' ' + operation + ' ' + align(right, scale);
  let hints: string[];
  let guidedSteps: string[];
  if (operation === '÷') {
    hints = [`「${b} × □ = ${a}」と考えよう。`, scale ? `わられる数とわる数を両方 ${power} 倍しても、答えは同じだよ。` : 'かけ算を使って、□に入る数を探そう。'];
    guidedSteps = [`わる数は ${b}。これを何倍すると ${a} になるか考える。`, `${b} × ${c} = ${a} だから、答えは ${c}。`];
  } else if (operation === '×' && left.scale + right.scale > 0) {
    const product = BigInt(leftInt) * BigInt(rightInt);
    hints = [`小数点を外して ${leftInt} × ${rightInt} を計算しよう。`, `小数点以下の桁数は、合わせて ${left.scale + right.scale} 桁だよ。`];
    guidedSteps = [`${leftInt} × ${rightInt} = ${product}`, `小数点を ${left.scale + right.scale} 桁戻すと ${c}。`];
  } else if (scale) {
    hints = ['小数点の位置をそろえよう。', `両方を ${power} 倍した ${integerEquation} を使えるよ。`];
    guidedSteps = [`${integerEquation} = ${align(result, scale)}`, `${power} でわって戻すと ${c}。`];
  } else {
    hints = [operation === '×' ? `${a} の ${b} 個分を考えよう。` : '一の位から、同じ位の数どうしを計算しよう。', `式は ${a} ${operation} ${b} だよ。`];
    guidedSteps = [operation === '×' ? `${b} を位ごとに分けて ${a} をかける。` : `${a} と ${b} の位をそろえる。`, `${a} ${operation} ${b} = ${c}`];
  }
  return { hints, guidedSteps, explanation: guidedSteps.join(' ') };
}

export function makeQuestion(seed: string, instanceId: string, skill: Skill, difficulty: Difficulty,
  answerMode: AnswerMode, context: QuestionContext, fixed?: Expression): Question {
  const data = fixed ?? generate(seed, skill, difficulty);
  const { left, right, result, operation } = data;
  let choices: Choice[] | undefined;
  if (answerMode !== 'number') {
    const values: ExactNumber[] = [result];
    const count = difficulty === 'basic' ? 3 : 4;
    const take = (value: ExactNumber) => {
      if (values.length < count && !values.some(a => equal(a, value))) values.push(value);
    };
    const coefficient = BigInt(result.coefficient);
    if (result.scale > 0) {
      take(exact(coefficient, result.scale - 1));
      take(exact(coefficient, result.scale + 1));
    }
    take(arithmetic(left, right, operation === '+' ? '×' : '+').result);
    for (let i = 1n; values.length < count; i++) take(exact(coefficient + i, result.scale));
    choices = shuffled(values, random(seed + ':choices')).map((value, index) => ({ id: 'abcd'[index], label: display(value), value }));
  }
  return {
    schemaVersion: 1, questionId: fixed ? context + ':' + skill + ':fixed' : skill,
    instanceId, subject: 'math', grade: 5, unitId: skill.split('.')[0] as UnitId,
    skillId: skill, difficulty, answerMode, context, rewardProfileId: 'standard', seed,
    prompt: '次の計算をしよう。', expression: `${display(left)} ${operation} ${display(right)}`,
    answer: result, ...(choices ? { choices } : {}), ...steps(data),
  };
}

export function makeQuestions(sessionId: string, selected: UnitId[], count: number, difficulty: Difficulty,
  mode: AnswerMode, context: QuestionContext): Question[] {
  const rand = random(sessionId);
  const order = shuffled(selected, rand);
  const cursors = Object.fromEntries(order.map(id => [id, rand(0, skills[id].length - 1)])) as Record<UnitId, number>;
  const questions: Question[] = [];
  for (let index = 0; index < count; index++) {
    const unit = order[index % order.length];
    let skill = skills[unit][cursors[unit]++ % skills[unit].length];
    let seed = sessionId + ':' + index;
    const instanceId = sessionId + ':q' + index;
    let fixed: Expression | undefined;
    if (context === 'tutorial') {
      skill = 'M01.add';
      fixed = arithmetic(exact(3 + index), exact(2 + index), '+');
    }
    if (context === 'bridge' && unit === 'M01' && difficulty === 'basic') {
      skill = 'M01.add';
      fixed = arithmetic(exact(3), exact(2), '+');
    }
    if (context === 'bridge' && unit === 'M02' && difficulty === 'standard') {
      skill = 'M02.mul';
      fixed = arithmetic(exact(6), exact(4), '×');
    }
    let question = makeQuestion(seed, instanceId, skill, difficulty, mode, context, fixed);
    for (let retry = 0; question.expression === questions.at(-1)?.expression && retry < 30; retry++) {
      seed += '.';
      question = makeQuestion(seed, instanceId, skill, difficulty, mode, context);
    }
    if (context === 'bridge') {
      question.unitLabel = unit === 'M01' || unit === 'M02' ? '個' : 'm';
      question.prompt = skill === 'M02.mul' && fixed
        ? '橋の板が6枚あります。板1枚に木材が4個いります。木材はぜんぶで何個？'
        : question.unitLabel === 'm' ? '橋に使う板の長さを、式から求めよう。' : '修復に使う資材の数を、式から求めよう。';
      if (unit === 'M02' && difficulty === 'advanced') {
        const intermediate = arithmetic(exact(6), exact(4), '×');
        const total = arithmetic(intermediate.result, exact(8), '+');
        question = {
          ...makeQuestion(seed, instanceId, 'M02.mul', difficulty, mode, context, total),
          unitLabel: '個', expression: '6 × 4 + 8',
          prompt: '橋の板は6枚。板1枚に使う木材は4個。予備8個も入れると何個必要？',
          hints: ['先に6 × 4を計算しよう。', '板に使う24個に、予備8個をたそう。'],
          guidedSteps: ['6 × 4 = 24', '24 + 8 = 32'],
          explanation: '板に使う木材は6 × 4 = 24個。予備8個をたすと32個だよ。',
        };
      }
    }
    questions.push(question);
  }
  return questions;
}
