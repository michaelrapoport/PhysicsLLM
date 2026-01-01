export type MaterialType = 'steel' | 'wood' | 'rubber' | 'concrete' | 'cloth';
export type ShapeType = 'box' | 'circle' | 'plane' | 'cloth';

export interface Vector2 {
  x: number;
  y: number;
}

export interface SimObjectConfig {
  mass?: number;
  material?: MaterialType;
  x?: number;
  y?: number;
  width?: number; // for box or cloth width
  height?: number; // for box or cloth height
  radius?: number; // for circle
  fixed?: boolean;
  color?: string;
  vx?: number;
  vy?: number;
  angle?: number; // Initial rotation
  segmentsX?: number; // For cloth
  segmentsY?: number; // For cloth
  pinTop?: boolean; // For cloth
}

export interface SimObject {
  id: string;
  type: ShapeType;
  mass: number;
  invMass: number;
  inertia: number;    // Moment of inertia
  invInertia: number; // 1 / inertia
  pos: Vector2;
  oldPos: Vector2;
  vel: Vector2;       // Derived
  force: Vector2;
  angle: number;      // Current rotation in radians
  oldAngle: number;   // For Angular Verlet
  restitution: number;
  friction: number;
  width: number;
  height: number;
  radius: number;
  fixed: boolean;
  color: string;
  vertices?: Vector2[]; // Cached vertices for Polygon collision
}

export interface Constraint {
  id: string;
  type: 'distance';
  bodyA: string;
  bodyB: string;
  length: number;
  stiffness: number;
  color: string;
}

export interface SimulationState {
  time: number;
  objects: SimObject[];
  constraints: Constraint[];
  particles: Float32Array | null; // GPU Particle Data (x, y, vx, vy)
  events: string[];
}

export interface Manifold {
  bodyA: SimObject;
  bodyB: SimObject;
  normal: Vector2;
  depth: number;
  hasCollision: boolean;
}

// -- GPU Architecture Types --

export interface GPUComputeKernel {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

export interface GPUState {
  textureIn: WebGLTexture;
  textureOut: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}