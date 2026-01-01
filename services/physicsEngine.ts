import { SimObject, SimObjectConfig, ShapeType, SimulationState, Vector2, Constraint } from '../types';
import { GRAVITY, MATERIALS, DT } from '../constants';
import { Vec2 } from './physics/math';
import { CollisionSystem } from './physics/CollisionSystem';
import { ConstraintSystem } from './physics/ConstraintSystem';
import { FluidSystem } from './physics/FluidSystem';

// Helper for unique IDs
let idCounter = 0;
const generateId = () => `obj_${++idCounter}`;

export class PhysicsEngine {
  private objects: SimObject[] = [];
  private objectMap: Map<string, SimObject> = new Map();
  private constraints: Constraint[] = [];
  private time: number = 0;
  private logs: string[] = [];
  private subSteps: number = 8;
  private constraintIterations: number = 5; // New: Multiple passes for stability
  private draggedObj: SimObject | null = null;
  
  // -- Submodules --
  private fluidSystem: FluidSystem;

  constructor() {
    this.fluidSystem = new FluidSystem();
    this.reset();
  }

  public reset() {
    this.objects = [];
    this.objectMap.clear();
    this.constraints = [];
    this.time = 0;
    this.logs = [];
    idCounter = 0;
    this.draggedObj = null;
    // this.fluidSystem.reset(); // Optional
  }

  public add(type: ShapeType, config: SimObjectConfig): SimObject {
    if (type === 'cloth') {
        return this.addCloth(config);
    }

    const matProps = config.material ? MATERIALS[config.material] : MATERIALS.default;
    const pos = { x: config.x || 0, y: config.y || 0 };
    const vel = { x: config.vx || 0, y: config.vy || 0 };
    
    const width = config.width || (type === 'box' ? 1 : 0);
    const height = config.height || (type === 'box' ? 1 : 0);
    const radius = config.radius || (type === 'circle' ? 0.5 : 0);
    const angle = config.angle || 0;

    const mass = config.fixed ? 0 : (config.mass || 1);
    const invMass = mass === 0 ? 0 : 1 / mass;
    
    let inertia = 0;
    if (mass > 0) {
        if (type === 'box') {
            inertia = mass * (width * width + height * height) / 12;
        } else if (type === 'circle') {
            inertia = mass * radius * radius / 2;
        }
    }
    const invInertia = (inertia === 0 || config.fixed) ? 0 : 1 / inertia;

    const obj: SimObject = {
      id: generateId(),
      type,
      mass,
      invMass,
      inertia,
      invInertia,
      pos: pos,
      oldPos: Vec2.sub(pos, Vec2.mul(vel, DT)), 
      vel: vel,
      force: { x: 0, y: 0 },
      angle: angle,
      oldAngle: angle,
      restitution: matProps.restitution,
      friction: matProps.friction,
      width,
      height,
      radius,
      fixed: !!config.fixed,
      color: config.color || matProps.color,
      vertices: []
    };
    
    if (type === 'plane') {
        obj.type = 'box';
        obj.width = 1000;
        obj.height = 1;
        obj.fixed = true;
        obj.invMass = 0;
        obj.invInertia = 0;
        obj.pos.y -= 0.5; 
        obj.oldPos.y = obj.pos.y;
    }

    this.updateGeometry(obj);
    this.objects.push(obj);
    this.objectMap.set(obj.id, obj);
    this.log(`Added ${type} [${obj.id}]`);
    return obj;
  }

  // Soft Body / Cloth Generator
  private addCloth(config: SimObjectConfig): SimObject {
      const segX = config.segmentsX || 10;
      const segY = config.segmentsY || 10;
      const w = config.width || 4;
      const h = config.height || 4;
      const startX = (config.x || 0) - w/2;
      const startY = (config.y || 0) + h/2;
      const dx = w / segX;
      const dy = h / segY;
      
      const particleRadius = 0.1;
      const grid: string[][] = [];

      // Create Particles
      for(let y=0; y<=segY; y++) {
          const row: string[] = [];
          for(let x=0; x<=segX; x++) {
              const isFixed = config.pinTop && y === 0;
              const p = this.add('circle', {
                  x: startX + x * dx,
                  y: startY - y * dy,
                  radius: particleRadius,
                  mass: 0.1,
                  fixed: isFixed,
                  color: config.color || '#e67e22',
                  material: 'cloth'
              });
              row.push(p.id);
          }
          grid.push(row);
      }

      // Create Constraints (Structural)
      const stiffness = 0.8;
      for(let y=0; y<=segY; y++) {
          for(let x=0; x<=segX; x++) {
              if (x < segX) {
                  this.connect(grid[y][x], grid[y][x+1], { stiffness, color: '#d35400' });
              }
              if (y < segY) {
                  this.connect(grid[y][x], grid[y+1][x], { stiffness, color: '#d35400' });
              }
          }
      }

      // Return the first particle as a handle, though it's a composite object
      return this.objectMap.get(grid[0][0])!;
  }

  public connect(idA: string, idB: string, config: { length?: number, stiffness?: number, color?: string } = {}) {
     const objA = this.objectMap.get(idA);
     const objB = this.objectMap.get(idB);
     if (!objA || !objB) return;

     const dist = Vec2.dist(objA.pos, objB.pos);
     const constraint: Constraint = {
         id: `c_${generateId()}`,
         type: 'distance',
         bodyA: idA,
         bodyB: idB,
         length: config.length || dist,
         stiffness: config.stiffness || 0.5,
         color: config.color || '#3498db'
     };
     this.constraints.push(constraint);
  }

  public step(): void {
    const subDt = DT / this.subSteps;
    this.time += DT;

    // Step 1: GPU Fluid Simulation (Parallel)
    this.fluidSystem.step(DT, GRAVITY);

    // Step 2: CPU Rigid Body Simulation (Serial / sub-stepped)
    for (let s = 0; s < this.subSteps; s++) {
        this.applyForces();
        this.integrate(subDt);
        this.objects.forEach(o => this.updateGeometry(o));
        
        // Iterative Constraint Solver for Stability (Cloth needs this)
        for(let i=0; i<this.constraintIterations; i++) {
            ConstraintSystem.solve(this.constraints, this.objectMap);
        }
        
        // Pass logging callback to Collision System
        CollisionSystem.resolve(this.objects, (A, B) => {
             // Deduplicate log logic can be added here
             // this.log(`Impact: ${A.type} hit ${B.type}`);
        });
    }
  }

  private applyForces() {
    this.objects.forEach(obj => {
      if (obj.fixed || obj === this.draggedObj) return;
      obj.force.y = -GRAVITY * obj.mass; 
      
      // Air drag (Simple)
      obj.force.x -= obj.vel.x * 0.01;
      obj.force.y -= obj.vel.y * 0.01;
    });
  }

  private integrate(dt: number) {
      this.objects.forEach(obj => {
          if (obj.fixed) return;
          if (obj === this.draggedObj) {
               obj.oldPos = { ...obj.pos };
               obj.oldAngle = obj.angle;
               return;
          }

          // Linear Verlet
          const vel = Vec2.sub(obj.pos, obj.oldPos);
          const tempPos = { ...obj.pos };
          const acc = Vec2.mul(obj.force, obj.invMass);
          
          // Verlet Integration: pos = 2*pos - oldPos + a*dt*dt
          // Implemented as: pos = pos + (pos - oldPos) + a*dt*dt
          const delta = Vec2.add(vel, Vec2.mul(acc, dt * dt));
          obj.pos = Vec2.add(obj.pos, delta);
          obj.oldPos = tempPos;
          
          // Estimate velocity for next step / collisions
          obj.vel = Vec2.div(Vec2.sub(obj.pos, obj.oldPos), dt);
          obj.force = { x: 0, y: 0 };

          // Angular Verlet
          const angVel = obj.angle - obj.oldAngle;
          const tempAngle = obj.angle;
          obj.angle += angVel; 
          obj.oldAngle = tempAngle;
      });
  }

  private updateGeometry(obj: SimObject) {
      if (obj.type === 'box') {
          const hw = obj.width / 2;
          const hh = obj.height / 2;
          const locals = [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }];
          obj.vertices = locals.map(p => {
              const rotated = Vec2.rotate(p, obj.angle);
              return Vec2.add(obj.pos, rotated);
          });
      }
  }

  public startDrag(x: number, y: number) {
      for (let i = this.objects.length - 1; i >= 0; i--) {
          const obj = this.objects[i];
          if (obj.fixed) continue; 
          const r = obj.type === 'circle' ? obj.radius : Math.max(obj.width, obj.height) / 2;
          // Simple hit test
          if (Vec2.dist({x,y}, obj.pos) < r + 0.5) {
              this.draggedObj = obj;
              return;
          }
      }
  }

  public updateDrag(x: number, y: number) {
      if (this.draggedObj) {
          // Move object but keep momentum zero for stability during drag
          const dx = x - this.draggedObj.pos.x;
          const dy = y - this.draggedObj.pos.y;
          this.draggedObj.pos.x = x;
          this.draggedObj.pos.y = y;
          // Hack: update oldPos so it doesn't shoot off when released
          this.draggedObj.oldPos.x = x - dx * 0.1;
          this.draggedObj.oldPos.y = y - dy * 0.1;
      }
  }

  public endDrag() {
      this.draggedObj = null;
  }

  public log(msg: string) {
    this.logs.push(`[${this.time.toFixed(2)}s] ${msg}`);
    if (this.logs.length > 50) this.logs.shift();
  }

  public getState(): SimulationState {
    const particleData = this.fluidSystem.getParticles();
      
    return {
      time: this.time,
      objects: JSON.parse(JSON.stringify(this.objects)), 
      constraints: JSON.parse(JSON.stringify(this.constraints)),
      particles: particleData,
      events: [...this.logs]
    };
  }

  public parseAndExecute(code: string) {
    this.reset();
    try {
        const proxyEnv = {
            add: (type: ShapeType, config: SimObjectConfig) => this.add(type, config),
            connect: (objA: any, objB: any, config: any) => {
                const idA = objA?.id || objA;
                const idB = objB?.id || objB;
                if(idA && idB) this.connect(idA, idB, config);
            },
            run: () => {},
        };
        const Lab = { Environment: class { constructor() { return proxyEnv; } } };
        const fn = new Function('Lab', code);
        fn(Lab);
    } catch(e) {
        console.error("Script Error", e);
        this.log("Error: " + e);
    }
  }
}