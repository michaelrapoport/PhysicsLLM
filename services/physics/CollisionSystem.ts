import { SimObject, Manifold, Vector2 } from '../../types';
import { Vec2 } from './math';

export class CollisionSystem {
  
  // -- Main Resolver --
  static resolve(objects: SimObject[], onCollision?: (a: SimObject, b: SimObject) => void) {
    // 1. Broad Phase (Naive O(N^2) for now, manageable for <100 objs)
    for (let i = 0; i < objects.length; i++) {
      for (let j = i + 1; j < objects.length; j++) {
        const A = objects[i];
        const B = objects[j];
        if (A.fixed && B.fixed) continue; // Skip two static objects

        // 2. Narrow Phase (SAT)
        const manifold = this.detectCollision(A, B);
        
        if (manifold && manifold.hasCollision) {
          this.applyResolution(manifold);
          if (onCollision) {
             // Simple impact filter: only log if relative velocity is significant
             const relVel = Vec2.sub(A.vel, B.vel);
             if (Vec2.lenSq(relVel) > 0.5) {
                onCollision(A, B);
             }
          }
        }
      }
    }
  }

  // -- Detection (SAT) --
  static detectCollision(A: SimObject, B: SimObject): Manifold | null {
    // Dispatch based on types
    if (A.type === 'circle' && B.type === 'circle') return this.circleVsCircle(A, B);
    if (A.type === 'box' && B.type === 'box') return this.polygonVsPolygon(A, B);
    if (A.type === 'circle' && B.type === 'box') return this.circleVsPolygon(A, B);
    if (A.type === 'box' && B.type === 'circle') return this.circleVsPolygon(B, A); // Flip
    
    // Treat planes as large static boxes (handled in initialization/update of vertices)
    if (A.type === 'plane' && B.type === 'box') return this.polygonVsPolygon(B, A); // Flip
    if (A.type === 'box' && B.type === 'plane') return this.polygonVsPolygon(A, B);
    if (A.type === 'plane' && B.type === 'circle') return this.circleVsPolygon(B, A); // Flip
    if (A.type === 'circle' && B.type === 'plane') return this.circleVsPolygon(A, B);

    return null;
  }

  // Circle vs Circle
  static circleVsCircle(A: SimObject, B: SimObject): Manifold {
    const n = Vec2.sub(B.pos, A.pos);
    const distSq = Vec2.lenSq(n);
    const radiusSum = A.radius + B.radius;

    if (distSq > radiusSum * radiusSum) return { bodyA: A, bodyB: B, normal: {x:0,y:0}, depth: 0, hasCollision: false };

    const dist = Math.sqrt(distSq);
    
    // Handle concentric circles
    if (dist === 0) {
      return { bodyA: A, bodyB: B, normal: { x: 1, y: 0 }, depth: radiusSum, hasCollision: true };
    }

    return {
      bodyA: A,
      bodyB: B,
      normal: Vec2.div(n, dist),
      depth: radiusSum - dist,
      hasCollision: true
    };
  }

  // Polygon vs Polygon (Box vs Box)
  static polygonVsPolygon(A: SimObject, B: SimObject): Manifold | null {
    if (!A.vertices || !B.vertices) return null;

    let normal = { x: 0, y: 0 };
    let depth = Infinity;

    // Check axes of A
    for (let i = 0; i < A.vertices.length; i++) {
      const v1 = A.vertices[i];
      const v2 = A.vertices[(i + 1) % A.vertices.length];
      const edge = Vec2.sub(v2, v1);
      const axis = Vec2.normalize(Vec2.perp(edge));

      const [minA, maxA] = this.projectVertices(A.vertices, axis);
      const [minB, maxB] = this.projectVertices(B.vertices, axis);

      if (minA >= maxB || minB >= maxA) return null; // No overlap

      const axisDepth = Math.min(maxB - minA, maxA - minB);
      if (axisDepth < depth) {
        depth = axisDepth;
        normal = axis;
      }
    }

    // Check axes of B
    for (let i = 0; i < B.vertices.length; i++) {
      const v1 = B.vertices[i];
      const v2 = B.vertices[(i + 1) % B.vertices.length];
      const edge = Vec2.sub(v2, v1);
      const axis = Vec2.normalize(Vec2.perp(edge));

      const [minA, maxA] = this.projectVertices(A.vertices, axis);
      const [minB, maxB] = this.projectVertices(B.vertices, axis);

      if (minA >= maxB || minB >= maxA) return null;

      const axisDepth = Math.min(maxB - minA, maxA - minB);
      if (axisDepth < depth) {
        depth = axisDepth;
        normal = axis;
      }
    }

    // Ensure normal points from A to B
    const direction = Vec2.sub(B.pos, A.pos);
    if (Vec2.dot(direction, normal) < 0) {
      normal = Vec2.mul(normal, -1);
    }

    return { bodyA: A, bodyB: B, normal, depth, hasCollision: true };
  }

  // Circle vs Polygon
  static circleVsPolygon(circle: SimObject, polygon: SimObject): Manifold | null {
    if (!polygon.vertices) return null;

    let normal = { x: 0, y: 0 };
    let depth = Infinity;

    // 1. Check Polygon Axes
    for (let i = 0; i < polygon.vertices.length; i++) {
      const v1 = polygon.vertices[i];
      const v2 = polygon.vertices[(i + 1) % polygon.vertices.length];
      const edge = Vec2.sub(v2, v1);
      const axis = Vec2.normalize(Vec2.perp(edge));

      const [minA, maxA] = this.projectCircle(circle, axis);
      const [minB, maxB] = this.projectVertices(polygon.vertices, axis);

      if (minA >= maxB || minB >= maxA) return null;

      const axisDepth = Math.min(maxB - minA, maxA - minB);
      if (axisDepth < depth) {
        depth = axisDepth;
        normal = axis;
      }
    }

    // 2. Check Circle Axis (Closest Vertex)
    let closestVertex = polygon.vertices[0];
    let minDistSq = Infinity;
    
    for (const v of polygon.vertices) {
        const distSq = Vec2.lenSq(Vec2.sub(circle.pos, v));
        if (distSq < minDistSq) {
            minDistSq = distSq;
            closestVertex = v;
        }
    }
    
    const axis = Vec2.normalize(Vec2.sub(closestVertex, circle.pos)); // Axis from circle to closest vertex
    const [minA, maxA] = this.projectCircle(circle, axis);
    const [minB, maxB] = this.projectVertices(polygon.vertices, axis);

    if (minA >= maxB || minB >= maxA) return null;

    const axisDepth = Math.min(maxB - minA, maxA - minB);
    if (axisDepth < depth) {
      depth = axisDepth;
      normal = axis;
    }

    // Ensure normal points from Circle to Polygon
    const direction = Vec2.sub(polygon.pos, circle.pos);
    if (Vec2.dot(direction, normal) < 0) {
      normal = Vec2.mul(normal, -1);
    }

    return { bodyA: circle, bodyB: polygon, normal, depth, hasCollision: true };
  }

  // -- Helpers --
  static projectVertices(vertices: Vector2[], axis: Vector2): [number, number] {
    let min = Infinity;
    let max = -Infinity;
    for (const v of vertices) {
      const proj = Vec2.dot(v, axis);
      if (proj < min) min = proj;
      if (proj > max) max = proj;
    }
    return [min, max];
  }

  static projectCircle(circle: SimObject, axis: Vector2): [number, number] {
    const centerProj = Vec2.dot(circle.pos, axis);
    return [centerProj - circle.radius, centerProj + circle.radius];
  }

  // -- Resolution --
  static applyResolution(m: Manifold) {
    const { bodyA, bodyB, normal, depth } = m;
    
    // Move bodies apart (Position Correction)
    const invMassA = bodyA.invMass;
    const invMassB = bodyB.invMass;
    const invMassSum = invMassA + invMassB;

    if (invMassSum === 0) return;

    const separation = Vec2.mul(normal, depth);
    const moveA = Vec2.mul(separation, -invMassA / invMassSum);
    const moveB = Vec2.mul(separation, invMassB / invMassSum);

    if (!bodyA.fixed) {
        bodyA.pos = Vec2.add(bodyA.pos, moveA);
    }
    if (!bodyB.fixed) {
        bodyB.pos = Vec2.add(bodyB.pos, moveB);
    }

    // Friction & Impulse (Simplified for Verlet)
    // In strict Verlet, we modify oldPos to change velocity.
    // Tangent vector
    const tangent = Vec2.normalize(Vec2.perp(normal));
    
    // Relative velocity
    const velA = Vec2.sub(bodyA.pos, bodyA.oldPos);
    const velB = Vec2.sub(bodyB.pos, bodyB.oldPos);
    const relVel = Vec2.sub(velB, velA);
    
    // Project relVel onto tangent
    const tanVel = Vec2.dot(relVel, tangent);
    
    // Friction factor
    const mu = Math.min(bodyA.friction, bodyB.friction);
    const frictionImpulse = Vec2.mul(tangent, tanVel * mu);

    // Apply Friction to "Old Positions" to dampen tangential velocity
    if (!bodyA.fixed) {
        bodyA.oldPos = Vec2.add(bodyA.oldPos, Vec2.mul(frictionImpulse, 0.5));
    }
    if (!bodyB.fixed) {
        bodyB.oldPos = Vec2.sub(bodyB.oldPos, Vec2.mul(frictionImpulse, 0.5));
    }

    if (!bodyA.fixed) {
       // Angular damping simulation
    }
  }
}