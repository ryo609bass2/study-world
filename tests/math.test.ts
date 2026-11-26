import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAnswer, display, equal, makeQuestion, makeQuestions, parseNumber, skills, unitIds } from '../src/learning/math.ts';

const bounds = {
  'M01.add': [[1, 9, 1, 9], [10, 999, 10, 999], [100, 9999, 100, 9999]],
  'M01.sub': [[1, 20, 0, 20], [10, 999, 0, 999], [100, 9999, 0, 9999]],
  'M02.mul': [[1, 9, 1, 9], [10, 99, 2, 19], [10, 999, 10, 99]],
  'M02.div': [[2, 9, 1, 9], [2, 19, 2, 99], [10, 99, 10, 99]],
  'M03.add': [[.1, .9, .1, .9], [.1, 99.9, .1, 99.9], [.01, 99.99, .01, 99.99]],
  'M03.sub': [[.1, .9, .1, .9], [.1, 99.9, .1, 99.9], [.01, 99.99, .01, 99.99]],
  'M04.mul': [[.1, 9.9, 2, 9], [.1, 9.9, .1, 9.9], [.01, 9.99, .1, 9.9]],
  'M05.div': [[2, 9, .1, 9.9], [.1, 9.9, 1, 99], [.01, 9.99, .1, 9.9]],
};

test('P2: 全技能・難易度で各1000問の演算、選択肢一意性、ヒント', () => {
  for (const skill of Object.values(skills).flat()) for (const difficulty of ['basic', 'standard', 'advanced'] as const) {
    for (let n = 0; n < 1000; n++) {
      const q = makeQuestion('seed:' + n, 'test:' + n, skill, difficulty, 'choice', 'mining');
      const [a, op, b] = q.expression.split(' ');
      const x = Number(a), y = Number(b);
      const expected = op === '+' ? x + y : op === '−' ? x - y : op === '×' ? x * y : x / y;
      const [loA, hiA, loB, hiB] = bounds[skill][{ basic: 0, standard: 1, advanced: 2 }[difficulty]];
      const [testedA, testedB] = op === '÷' ? [y, Number(display(q.answer))] : [x, y];
      assert.ok(testedA >= loA && testedA <= hiA && testedB >= loB && testedB <= hiB, q.expression);
      assert.ok(Number.isFinite(expected) && expected >= 0);
      assert.ok(Math.abs(Number(display(q.answer)) - expected) < 1e-9, q.expression);
      assert.equal(q.choices!.length, difficulty === 'basic' ? 3 : 4);
      assert.equal(new Set(q.choices!.map(c => c.label)).size, q.choices!.length);
      assert.equal(q.choices!.filter(c => equal(c.value, q.answer)).length, 1);
      assert.ok(q.explanation.includes(display(q.answer)));
      assert.equal(q.hints.length, 2);
    }
  }
});

test('P2: 有限小数を厳密比較し、誤形式を区別する', () => {
  const q = { ...makeQuestion('s', 'i', 'M04.mul', 'basic', 'number', 'mining'), answer: parseNumber('8.4')! };
  for (const answer of ['8.40', '０８．４', ' 8.4 ']) assert.equal(checkAnswer(q, answer), 'correct');
  for (const answer of ['', '8.', '8e1', '-8', '+8', '1,000', 'Infinity', 'NaN', '1/2', '0000000000008']) assert.equal(checkAnswer(q, answer), 'format');
  assert.equal(checkAnswer(q, '.8'), 'wrong');
  assert.equal(display(parseNumber('.8')!), '0.8');
});

test('P2: 混合出題は均等、seedで固定、インスタンスIDは固有', () => {
  const generate = () => makeQuestions('fixture', unitIds, 10, 'standard', 'worldChoice', 'obby');
  const questions = generate();
  assert.deepEqual(questions, generate());
  for (const unit of unitIds) assert.equal(questions.filter(q => q.unitId === unit).length, 2);
  assert.equal(new Set(questions.map(q => q.instanceId)).size, 10);
  assert.ok(questions.every((q, i) => q.expression !== questions[i - 1]?.expression));
});
