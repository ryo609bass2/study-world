import type { ActionDifficulty } from '../app/settings.ts';
import type { MapDef } from '../worlds/maps.ts';
import type { Point } from '../worlds/geometry.ts';

export interface ObbyCourse { map: MapDef; gate: Point }
export function makeObby(index: number, difficulty: ActionDifficulty): ObbyCourse {
  const offset = [-1.15, .65, 0][index % 3];
  const finish = difficulty === 'advanced' ? -14.2 : -12.5;
  return {
    gate: { x: 0, z: finish - 1.8 },
    map: {
      id: `obby-${index}-${difficulty}`, name: 'オビーコース', spawn: { x: 0, z: 1 },
      obstacles: [], markers: [{ id: 'math-gate', kind: 'portal', x: 0, z: finish - 1.8, label: '算数ゲート' }], discoveries: [],
      platforms: [
        { x: -3, z: -2, width: 6, depth: 6, top: 0, color: 0x80b8b0 },
        ...(difficulty === 'assist' ? [{ x: -2.2, z: finish, width: 4.4, depth: -finish - 2, top: 0, color: 0xe1bc72 }]
          : difficulty === 'standard' ? [
            { x: -1.6 + offset / 2, z: -6.25, width: 3.2, depth: 3.0, top: 0, color: 0xe1bc72 },
            { x: -1.6 - offset / 2, z: -11, width: 3.2, depth: 3.2, top: 0, color: 0xc9916d },
          ] : [
            { x: -1.12 + offset, z: -6, width: 2.24, depth: 2.35, top: 0, color: 0xe1bc72 },
            { x: -.95, z: -9.65, width: 1.9, depth: 2.0, top: 0, color: 0xc9916d },
            { x: -.91 - offset, z: -13.0, width: 1.82, depth: 1.85, top: 0, color: 0xdca981 },
          ]),
        { x: -3.1, z: finish - 4, width: 6.2, depth: 4, top: 0, color: 0x80b8b0 },
      ],
    },
  };
}
