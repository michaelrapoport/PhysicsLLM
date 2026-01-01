import { Vector2 } from '../../types';

export const Vec2 = {
  add: (v1: Vector2, v2: Vector2): Vector2 => ({ x: v1.x + v2.x, y: v1.y + v2.y }),
  sub: (v1: Vector2, v2: Vector2): Vector2 => ({ x: v1.x - v2.x, y: v1.y - v2.y }),
  mul: (v: Vector2, s: number): Vector2 => ({ x: v.x * s, y: v.y * s }),
  div: (v: Vector2, s: number): Vector2 => ({ x: v.x / s, y: v.y / s }),
  dot: (v1: Vector2, v2: Vector2): number => v1.x * v2.x + v1.y * v2.y,
  len: (v: Vector2): number => Math.sqrt(v.x * v.x + v.y * v.y),
  lenSq: (v: Vector2): number => v.x * v.x + v.y * v.y,
  dist: (v1: Vector2, v2: Vector2): number => Math.sqrt(Math.pow(v1.x - v2.x, 2) + Math.pow(v1.y - v2.y, 2)),
  normalize: (v: Vector2): Vector2 => {
    const l = Math.sqrt(v.x * v.x + v.y * v.y);
    return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
  },
  cross: (v1: Vector2, v2: Vector2): number => v1.x * v2.y - v1.y * v2.x,
  rotate: (v: Vector2, angle: number): Vector2 => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
  },
  perp: (v: Vector2): Vector2 => ({ x: -v.y, y: v.x }), // Perpendicular vector (rotate 90 deg)
  clamp: (val: number, min: number, max: number): number => Math.max(min, Math.min(max, val)),
};