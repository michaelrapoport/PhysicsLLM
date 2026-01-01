import { SimObject, Constraint } from '../../types';
import { Vec2 } from './math';

export class ConstraintSystem {
  static solve(constraints: Constraint[], objects: Map<string, SimObject>) {
    // Solver iterations usually happen multiple times per frame
    // We'll do a simple single pass for performance in JS
    
    constraints.forEach(c => {
        const bodyA = objects.get(c.bodyA);
        const bodyB = objects.get(c.bodyB);

        if (!bodyA || !bodyB) return;
        if (bodyA.fixed && bodyB.fixed) return;

        const currentDist = Vec2.dist(bodyA.pos, bodyB.pos);
        if (currentDist === 0) return; // Prevent div by zero

        const delta = currentDist - c.length;
        const correction = delta / currentDist; // Normalized scalar
        const vec = Vec2.sub(bodyB.pos, bodyA.pos); // Vector from A to B
        
        // Stiffness (0..1)
        // For rigid rods, stiffness ~ 1. For springs < 0.1
        const force = c.stiffness * 0.5; // Shared between two bodies

        const nudge = Vec2.mul(vec, correction * force);

        if (!bodyA.fixed) {
            bodyA.pos = Vec2.add(bodyA.pos, nudge);
        }
        if (!bodyB.fixed) {
            bodyB.pos = Vec2.sub(bodyB.pos, nudge);
        }
    });
  }
}