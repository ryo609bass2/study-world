import { buildingArea } from '../worlds/maps.ts';
import { overlaps } from '../worlds/geometry.ts';
import type { Rect } from '../worlds/geometry.ts';

export const resources = { coin: 'コイン', wood: '木材', stone: '石材' } as const;
export type Resource = keyof typeof resources;
export type Balance = Record<Resource, number>;
export const resourceIds = Object.keys(resources) as Resource[];
export const balanceCap = 999_999_999;
export const zeroBalance: Balance = { coin: 0, wood: 0, stone: 0 };

export const catalog = {
  house_small: { name: '小さな家', width: 4, depth: 4, cost: { coin: 30, wood: 10, stone: 4 }, shopPrice: 90 },
  warehouse: { name: '倉庫', width: 4, depth: 3, cost: { coin: 80, wood: 15, stone: 8 }, shopPrice: 180 },
  flowerbed: { name: '花壇', width: 2, depth: 2, cost: { coin: 20, wood: 2, stone: 0 }, shopPrice: 35 },
  bench: { name: 'ベンチ', width: 2, depth: 1, cost: { coin: 15, wood: 3, stone: 0 }, shopPrice: 30 },
  stone_path: { name: '石畳', width: 1, depth: 1, cost: { coin: 3, wood: 0, stone: 1 }, shopPrice: 8 },
} as const;

export type BuildingId = keyof typeof catalog;
export const buildingIds = Object.keys(catalog) as BuildingId[];
export type Rotation = 0 | 90 | 180 | 270;
export interface Placement { x: number; y: 0; z: number; rotation: Rotation }
export interface Building { instanceId: string; buildingId: BuildingId; placement: Placement | null }

export function footprint(id: BuildingId, p: Placement): Rect {
  const { width, depth } = catalog[id];
  return p.rotation % 180 === 0
    ? { x: p.x, z: p.z, width, depth } : { x: p.x, z: p.z, width: depth, depth: width };
}

export function placementError(buildings: Building[], building: Building, p: Placement, protectedAreas: Rect[] = []): string | null {
  if (p.y !== 0 || !Number.isInteger(p.x) || !Number.isInteger(p.z) || ![0, 90, 180, 270].includes(p.rotation)) return 'グリッドの位置または向きが無効です。';
  const box = footprint(building.buildingId, p);
  if (box.x < buildingArea.x || box.z < buildingArea.z ||
      box.x + box.width > buildingArea.x + buildingArea.width ||
      box.z + box.depth > buildingArea.z + buildingArea.depth) return '明るい緑の建築エリア内を選んでください。';
  if (protectedAreas.some(area => overlaps(box, area))) return 'この場所は建築できません。';
  if (buildings.some(b => b.instanceId !== building.instanceId && b.placement && overlaps(box, footprint(b.buildingId, b.placement)))) return 'ほかの建物と重なっています。';
  if (buildings.filter(b => b.placement && b.instanceId !== building.instanceId).length >= 60) return '島に置けるのは60個までです。';
  return null;
}
