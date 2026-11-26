export interface Point { x: number; z: number }
export interface Rect extends Point { width: number; depth: number }
export interface Platform extends Rect { top: number; color: number }

export function contains(area: Rect, point: Point, margin = 0): boolean {
  return point.x >= area.x - margin && point.x < area.x + area.width + margin &&
    point.z >= area.z - margin && point.z < area.z + area.depth + margin;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.z < b.z + b.depth && a.z + a.depth > b.z;
}

export function movement(x: number, z: number, yaw: number, speed: number, dt: number): Point {
  const length = Math.max(1, Math.hypot(x, z));
  const scale = speed * Math.min(dt, 0.05) / length;
  return { x: (x * Math.cos(yaw) + z * Math.sin(yaw)) * scale, z: (z * Math.cos(yaw) - x * Math.sin(yaw)) * scale };
}

export function stepAround(position: Point, delta: Point, obstacles: Rect[], radius = 0.3): Point {
  const canMove = (point: Point) => !obstacles.some(box => contains(box, point, radius));
  const next = { x: position.x + delta.x, z: position.z };
  if (!canMove(next)) next.x = position.x;
  next.z += delta.z;
  if (!canMove(next)) next.z = position.z;
  return next;
}

export function groundAt(point: Point, platforms: Platform[], feet: number): number {
  return Math.max(-Infinity, ...platforms.filter(p => p.top <= feet + 0.3 && contains(p, point)).map(p => p.top));
}
