import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

async function setup(page: Page, entry: 'island' | 'quick') {
  await page.goto('./');
  await page.getByRole('button', { name: entry === 'quick' ? '学習クイックスタート' : '島の冒険をはじめる' }).click();
  await page.getByRole('button', { name: 'プロフィールを作る' }).click();
}

async function readAnswer(page: Page) {
  const expression = (await page.locator('.equation').innerText()).split('＝')[0].trim().replace(/−/g, '-');
  const [rawA, op, rawB, , extra] = expression.split(' ');
  const a = Number(rawA), b = Number(rawB);
  const result = op === '+' ? a + b : op === '-' ? a - b : op === '÷' ? a / b : a * b;
  return String(Number((result + Number(extra ?? 0)).toFixed(6)));
}

async function correct(page: Page) {
  const submit = page.getByRole('button', { name: '答える', exact: true });
  await expect(submit).toBeVisible();
  await expect(submit).toBeEnabled();
  const answer = await readAnswer(page);
  const options = page.getByRole('group', { name: '答えの選択肢' });
  if (await options.count()) await options.locator('button').filter({ hasText: new RegExp('^[1-4]' + answer.replace('.', '\\.') + '$') }).click();
  else await page.getByRole('textbox', { name: '答え', exact: true }).fill(answer);
  await submit.click();
  await expect(page.getByText('正解！', { exact: false })).toBeVisible();
}

async function moveUntil(page: Page, key: string, target: Locator) {
  await page.keyboard.down(key);
  try {
    await expect(target).toBeVisible();
  } finally {
    await page.keyboard.up(key);
  }
}

test('T01/T05/T17 島で宝箱を開け、3問で家を作り、サブパスを再読込して復元', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await setup(page, 'island');
  await expect(page.locator('[data-world=home] canvas')).toBeVisible();
  const chest = page.getByRole('button', { name: /はじまりの宝箱/ });
  await moveUntil(page, 'a', chest);
  await chest.click();
  await page.getByRole('button', { name: 'はじめての3問' }).click();
  for (let i = 0; i < 3; i++) {
    await correct(page);
    await page.getByRole('button', { name: i < 2 ? '次の問題へ' : '結果を見る' }).click();
  }
  await expect(page.getByRole('dialog')).toContainText('40');
  await page.getByRole('button', { name: '家を作る' }).click();
  await page.getByRole('button', { name: '作る 小さな家' }).click();
  await page.getByRole('button', { name: 'ここに配置' }).click();
  await expect(page.getByText('中央広場に行こう')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '島の冒険を続ける' }).click();
  await page.getByRole('button', { name: /^プロフィール [A-Z0-9]/ }).click();
  await page.getByRole('button', { name: '建築・持ち物' }).click();
  await expect(page.getByRole('dialog')).toContainText('配置済み');
  expect(errors).toEqual([]);
});

test('T02/T04/T06 中断したクイックを復元し、ヒント後も同額の報酬', async ({ page }) => {
  await setup(page, 'quick');
  await page.getByLabel('問題数').selectOption('5');
  await page.getByLabel('答え方').selectOption('number');
  await page.getByRole('button', { name: 'ミッションをはじめる' }).click();
  await page.getByRole('button', { name: 'ヒント', exact: true }).click();
  await correct(page);
  await page.getByRole('button', { name: 'セーブして中断' }).click();
  await page.reload();
  await page.getByRole('button', { name: '学習クイックスタート' }).click();
  await page.getByRole('button', { name: /^プロフィール [A-Z0-9]/ }).click();
  await page.getByRole('button', { name: '採掘クエストを再開' }).last().click();
  await expect(page.getByText('正解！', { exact: false })).toBeVisible();
  for (let i = 1; i < 5; i++) {
    await page.getByRole('button', { name: '次の問題へ' }).click();
    await correct(page);
  }
  await page.getByRole('button', { name: '結果を見る' }).click();
  await expect(page.getByRole('dialog')).toContainText('+90');
  await expect(page.getByRole('dialog')).toContainText('+15');
  await expect(page.getByRole('dialog')).toContainText('+70 XP');
});

test('T11/T12 発展の算数とアシスト足場を組み合わせ、落下後にゲートをクリア', async ({ page }) => {
  await setup(page, 'quick');
  await page.getByRole('button', { name: /^オビーチャレンジ/ }).click();
  await page.getByLabel('学習の難しさ').selectOption('advanced');
  await page.getByLabel('操作の難しさ').selectOption('assist');
  await page.getByLabel('答え方').selectOption('number');
  await page.getByRole('button', { name: 'ミッションをはじめる' }).click();
  await expect(page.locator('[data-world^=obby] canvas')).toBeVisible();
  await moveUntil(page, 'd', page.getByText('チェックポイントに戻ったよ。'));
  const gate = page.getByRole('button', { name: /算数ゲートをひらく/ });
  await moveUntil(page, 'w', gate);
  await gate.click();
  await correct(page);
  await page.getByRole('button', { name: '次の足場へ' }).click();
  await expect(page.getByText('チェックポイント 2 / 3')).toBeVisible();
});

test('T13 800×600タッチ環境・1.5倍で学習画面のボタンが利用できる', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173/study-world/',
    viewport: { width: 800, height: 600 }, hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await setup(page, 'quick');
    await page.getByLabel('答え方').selectOption('number');
    await page.getByRole('button', { name: 'ミッションをはじめる' }).tap();
    await page.getByRole('button', { name: 'セーブして中断' }).tap();
    await page.getByRole('button', { name: '設定', exact: true }).tap();
    await page.getByLabel('文字の大きさ').selectOption('1.5');
    await page.getByRole('button', { name: '設定を保存' }).tap();
    await page.setViewportSize({ width: 600, height: 800 });
    await page.getByRole('button', { name: '採掘クエストを再開' }).tap();
    const flow = page.getByRole('dialog');
    expect(await flow.evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBe(true);
    await expect(page.getByRole('button', { name: 'ヒント', exact: true })).toBeEnabled();
  } finally { await context.close(); }
});

test('T16 WebGLを無効にしても採掘で保存できる', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    Reflect.set(HTMLCanvasElement.prototype, 'getContext',
      function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        return type.startsWith('webgl') ? null : Reflect.apply(getContext, this, [type, ...args]);
      });
  });
  await setup(page, 'island');
  await expect(page.getByRole('heading', { name: '3Dを表示できません' })).toBeVisible();
  await page.getByRole('button', { name: '採掘クエストへ' }).click();
  await page.getByLabel('問題数').selectOption('1');
  await page.getByRole('button', { name: 'ミッションをはじめる' }).click();
  await correct(page);
  await page.getByRole('button', { name: '結果を見る' }).click();
  await expect(page.getByRole('dialog')).toContainText('+30');
});
