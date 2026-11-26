import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groundAt, movement, stepAround } from '../src/worlds/geometry.ts';
import { maps } from '../src/worlds/maps.ts';

test('P1: 斜め移動とフレーム差を制限し建築をすり抜けない', () => {
  const d = movement(1, 1, 0, 4, 1);
  assert.ok(Math.abs(Math.hypot(d.x, d.z) - .2) < 1e-8);
  assert.deepEqual(stepAround({ x: -.4, z: 0 }, { x: .2, z: .1 }, [{ x: 0, z: 0, width: 2, depth: 2 }]), { x: -.4, z: .1 });
});
test('P1: 島の外縁に着地面がなく安全スポーンに着地面がある', () => {
  const { platforms, spawn } = maps.home;
  assert.equal(groundAt({ x: 24, z: 0 }, platforms, 0), -Infinity);
  assert.equal(groundAt(spawn, platforms, 0), 0);
});
