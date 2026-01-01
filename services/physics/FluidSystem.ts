import { GPGPU } from '../gpu/GPGPU';

// 64x64 = 4096 particles
const TEX_WIDTH = 64; 
const TEX_HEIGHT = 64;

export class FluidSystem {
  gpu: GPGPU;
  posState: { in: WebGLTexture; out: WebGLTexture; fb: WebGLFramebuffer };
  velState: { in: WebGLTexture; out: WebGLTexture; fb: WebGLFramebuffer };
  
  updatePosKernel: WebGLProgram;
  updateVelKernel: WebGLProgram;

  constructor() {
    this.gpu = new GPGPU(TEX_WIDTH, TEX_HEIGHT);
    
    // Initialize State
    this.posState = this.gpu.createState();
    this.velState = this.gpu.createState();

    // Initial Data
    const posData = new Float32Array(TEX_WIDTH * TEX_HEIGHT * 4);
    const velData = new Float32Array(TEX_WIDTH * TEX_HEIGHT * 4);

    for (let i = 0; i < TEX_WIDTH * TEX_HEIGHT; i++) {
        // Random positions in a block
        posData[i * 4 + 0] = (Math.random() * 10) - 5; // x
        posData[i * 4 + 1] = (Math.random() * 10) + 5; // y
        posData[i * 4 + 2] = 0;
        posData[i * 4 + 3] = 1; // Alpha (Life)

        velData[i * 4 + 0] = (Math.random() - 0.5) * 2;
        velData[i * 4 + 1] = (Math.random() - 0.5) * 2;
    }

    this.gpu.writeData(this.posState.in, posData);
    this.gpu.writeData(this.velState.in, velData);

    // -- Shaders --

    const updateVelSource = `#version 300 es
    precision highp float;
    uniform sampler2D uInput0; // Pos
    uniform sampler2D uInput1; // Vel
    uniform float uDT;
    uniform float uGravity;
    out vec4 fragColor;

    void main() {
        ivec2 coord = ivec2(gl_FragCoord.xy);
        vec4 pos = texelFetch(uInput0, coord, 0);
        vec4 vel = texelFetch(uInput1, coord, 0);

        // Gravity
        vel.y -= uGravity * uDT;

        // Floor Collision
        if (pos.y < 0.0) {
            vel.y = abs(vel.y) * 0.6; // Bounce with damping
            vel.x *= 0.95; // Friction
        }
        
        // Wall Collision
        if (pos.x < -10.0 || pos.x > 10.0) {
            vel.x *= -0.8;
        }

        fragColor = vel;
    }
    `;

    const updatePosSource = `#version 300 es
    precision highp float;
    uniform sampler2D uInput0; // Pos
    uniform sampler2D uInput1; // Vel
    uniform float uDT;
    out vec4 fragColor;

    void main() {
        ivec2 coord = ivec2(gl_FragCoord.xy);
        vec4 pos = texelFetch(uInput0, coord, 0);
        vec4 vel = texelFetch(uInput1, coord, 0); // Actually getting 'new' vel from prev step? 
        // In this architecture, we pass the *old* vel to update pos, or updated. 
        // Let's assume input1 is the Updated Velocity.

        pos.xy += vel.xy * uDT;

        // Constraint to floor
        if (pos.y < 0.0) pos.y = 0.0;
        if (pos.x < -10.0) pos.x = -10.0;
        if (pos.x > 10.0) pos.x = 10.0;

        fragColor = pos;
    }
    `;

    this.updateVelKernel = this.gpu.createKernel(updateVelSource);
    this.updatePosKernel = this.gpu.createKernel(updatePosSource);
  }

  step(dt: number, gravity: number) {
    // 1. Update Velocity
    // Inputs: Pos(in), Vel(in) -> Output: Vel(out)
    this.gpu.run(this.updateVelKernel, [this.posState.in, this.velState.in], this.velState, { uDT: dt, uGravity: gravity });

    // 2. Update Position
    // Inputs: Pos(in), Vel(in) [Note: velState.in is now the NEW velocity because of swap] -> Output: Pos(out)
    this.gpu.run(this.updatePosKernel, [this.posState.in, this.velState.in], this.posState, { uDT: dt });
  }

  getParticles(): Float32Array {
    return this.gpu.readData(this.posState.in);
  }
  
  reset() {
      // Re-seed functionality can be added here
  }
}