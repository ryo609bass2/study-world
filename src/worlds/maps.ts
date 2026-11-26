import type { Platform, Point, Rect } from './geometry.ts';

export type WorldId = 'home' | 'hub' | 'greenwood_mine' | 'sky_park';
export type MarkerKind = 'chest' | 'portal' | 'npc' | 'node' | 'workbench' | 'mining' | 'bridge' | 'obby';

export interface Marker extends Point {
  id: string;
  label: string;
  kind: MarkerKind;
  target?: WorldId;
  depleted?: boolean;
}

export interface MapDef {
  id: WorldId | `obby-${string}`;
  name: string;
  spawn: Point;
  platforms: Platform[];
  obstacles: Rect[];
  markers: Marker[];
  discoveries: { id: string; label: string; point: Point; radius: number }[];
}

export const buildingArea: Rect = { x: -12, z: -12, width: 24, depth: 24 };
const ground = (width: number, depth: number, color: number): Platform => ({
  x: -width / 2, z: -depth / 2, width, depth, color, top: 0,
});

export const maps: Record<WorldId, MapDef> = {
  home: {
    id: 'home', name: 'マイアイランド', spawn: { x: 0, z: 18 },
    platforms: [ground(48, 48, 0x7eb565)], obstacles: [], discoveries: [],
    markers: [
      { id: 'home-chest', kind: 'chest', label: 'はじまりの宝箱', x: -3, z: 17 },
      { id: 'home-workbench', kind: 'workbench', label: '作業台', x: 8, z: 18 },
      { id: 'to-hub', kind: 'portal', label: '中央広場へ', target: 'hub', x: 0, z: 21 },
    ],
  },
  hub: {
    id: 'hub', name: '中央広場', spawn: { x: 0, z: 22 },
    platforms: [ground(64, 64, 0x83b36d)], obstacles: [{ x: -4, z: -4, width: 8, depth: 8 }],
    markers: [
      { id: 'hub-guide', kind: 'npc', label: '案内係', x: -20, z: -20 },
      { id: 'hub-shop', kind: 'npc', label: 'ショップ', x: 20, z: -20 },
      { id: 'hub-board', kind: 'npc', label: '掲示板', x: 0, z: -10 },
      { id: 'hub-home', kind: 'portal', label: 'マイアイランドへ', target: 'home', x: 0, z: -25 },
      { id: 'hub-green', kind: 'portal', label: '森林・鉱山へ', target: 'greenwood_mine', x: -25, z: 0 },
      { id: 'hub-sky', kind: 'portal', label: '挑戦の島へ', target: 'sky_park', x: 25, z: 0 },
    ],
    discoveries: [],
  },
  greenwood_mine: {
    id: 'greenwood_mine', name: '森林・鉱山', spawn: { x: 0, z: 52 },
    platforms: [
      { x: -64, z: 2, width: 128, depth: 62, color: 0x76aa64, top: 0 },
      { x: -64, z: -64, width: 76, depth: 66, color: 0x669c65, top: 0 },
      { x: 12, z: -64, width: 52, depth: 62, color: 0x8ba088, top: 0 },
    ],
    obstacles: [], markers: [
      { id: 'woods-camp', kind: 'npc', label: 'キャンプの案内係', x: 0, z: 42 },
      { id: 'woods-home', kind: 'portal', label: '中央広場へ', target: 'hub', x: 4, z: 53 },
      { id: 'woods-timber', kind: 'node', label: '木材を集める', x: -30, z: 15 },
      { id: 'woods-grove', kind: 'node', label: '大きな倒木', x: -37, z: 11 },
      { id: 'woods-chest', kind: 'chest', label: '遺跡の宝箱', x: -26, z: -21 },
      { id: 'woods-bridge', kind: 'bridge', label: '橋を修復する', x: 15, z: 3 },
      { id: 'woods-stone', kind: 'node', label: '石材を集める', x: 35, z: -25 },
      { id: 'woods-vein', kind: 'node', label: '大きな石材', x: 39, z: -29 },
      { id: 'woods-mining', kind: 'mining', label: '採掘クエスト', x: 40, z: -40 },
    ],
    discoveries: [
      { id: 'woods-ruins', label: '森の遺跡', point: { x: -25, z: -20 }, radius: 6 },
      { id: 'woods-waterfall', label: '青の滝', point: { x: 25, z: -55 }, radius: 7 },
    ],
  },
  sky_park: {
    id: 'sky_park', name: '挑戦の島', spawn: { x: -54, z: 0 },
    platforms: [ground(128, 64, 0x91bfc0)], obstacles: [], discoveries: [],
    markers: [
      { id: 'sky-hub', kind: 'portal', label: '中央広場へ', target: 'hub', x: -57, z: 4 },
      { id: 'sky-guide', kind: 'npc', label: '受付', x: -45, z: 0 },
      { id: 'sky-obby', kind: 'obby', label: 'オビーチャレンジ', x: -35, z: 0 },
    ],
  },
};

export const bridgePlatform: Platform = { x: 12, z: -2, width: 6, depth: 4, top: 0, color: 0xcaa676 };
export function mineBarriers(repaired: boolean): Rect[] {
  return [
    { x: 11.7, z: -64, width: 0.6, depth: 62 },
    ...(repaired ? [
      { x: 18, z: -2.3, width: 46, depth: 0.6 },
    ] : [{ x: 12, z: -2.3, width: 52, depth: 0.6 }]),
  ];
}
