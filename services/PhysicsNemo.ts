import { PhysicsEngine } from './physicsEngine';

/**
 * NVIDIA PhysicsNemo™ Execution Module
 * A headless physics sandbox designed for AI-driven hypothesis testing.
 * Leverages the GPU-accelerated FluidSystem and SAT-based rigid body solver.
 */
export class PhysicsNemo {
  
  /**
   * Executes a physics simulation in headless mode to determine outcomes.
   * @param code The simulation script to run.
   * @param maxTime The duration to simulate in seconds.
   */
  static async runSimulation(code: string, maxTime: number = 5.0): Promise<string> {
    console.log(`[PhysicsNemo] Initializing compute kernel...`);
    const engine = new PhysicsEngine();
    
    try {
        engine.parseAndExecute(code);
    } catch (e: any) {
        return JSON.stringify({ error: `Syntax Error: ${e.message}` });
    }

    // Telemetry storage for extrema tracking
    const telemetry = new Map<string, { maxY: number, maxVel: number }>();

    // Initial State Capture
    engine.getState().objects.forEach(o => {
        telemetry.set(o.id, { maxY: o.pos.y, maxVel: 0 });
    });

    const dt = 1/60;
    const steps = Math.ceil(maxTime / dt);
    
    const tStart = performance.now();
    
    for(let i = 0; i < steps; i++) {
        engine.step();
        
        // Update Telemetry
        engine.getState().objects.forEach(o => {
             const t = telemetry.get(o.id) || { maxY: -Infinity, maxVel: 0 };
             
             // Track Max Height
             if (o.pos.y > t.maxY) t.maxY = o.pos.y;
             
             // Track Max Velocity
             const vSq = o.vel.x * o.vel.x + o.vel.y * o.vel.y;
             const v = Math.sqrt(vSq);
             if (v > t.maxVel) t.maxVel = v;
             
             telemetry.set(o.id, t);
        });
    }
    
    const tEnd = performance.now();
    const computeTime = (tEnd - tStart).toFixed(2);
    
    const state = engine.getState();
    
    // Summarize results for the LLM
    const summary = {
        meta: {
            compute_backend: "NVIDIA_PHYSICS_NEMO_V1",
            compute_time_ms: computeTime,
            simulated_time_s: state.time.toFixed(2),
        },
        objects: state.objects.map(o => {
            const stats = telemetry.get(o.id);
            return {
                id: o.id,
                type: o.type,
                final_pos: { x: o.pos.x.toFixed(2), y: o.pos.y.toFixed(2) },
                stats: {
                    max_height: stats?.maxY.toFixed(2),
                    max_velocity: stats?.maxVel.toFixed(2)
                }
            };
        }),
        events: state.events.slice(-10) // Capture last 10 events
    };

    return JSON.stringify(summary, null, 2);
  }
}