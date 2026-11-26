export const maxLevel = 10;
export function xpAt(level: number) { return 10 * (level - 1) * (level + 4); }
export function levelAt(xp: number) {
  let level = 1;
  while (level < maxLevel && xp >= xpAt(level + 1)) level++;
  return level;
}

export const achievements = {
  hub: '中央広場に到着', house: 'はじめての家', learning: 'はじめての学習',
  ten: '10問解決', retry: 'もう一度チャレンジ', bridge: '橋の修復',
  mining: '採掘クエスト達成', obby: 'オビーチャレンジ達成',
} as const;
export const treasures = { integers: '整数の記念石', decimals: '小数の記念石' } as const;
