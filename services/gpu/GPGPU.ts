/**
 * GPGPU.ts
 * A lightweight, high-performance WebGL2 abstraction for GPGPU operations.
 * Designed to mimic gpu-io's ping-pong architecture while being adaptable
 * for future WebGPU or Cloud Compute backends.
 */

export class GPGPU {
  gl: WebGL2RenderingContext;
  quadVBO: WebGLBuffer;
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    // Enable floating point textures
    if (!gl.getExtension('EXT_color_buffer_float')) {
        console.warn('EXT_color_buffer_float not supported');
    }

    // Fullscreen Quad
    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    this.quadVBO = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  }

  createState(): { in: WebGLTexture; out: WebGLTexture; fb: WebGLFramebuffer } {
    const gl = this.gl;
    const t1 = this.createTexture();
    const t2 = this.createTexture();
    const fb = gl.createFramebuffer()!;
    return { in: t1, out: t2, fb };
  }

  private createTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.width, this.height, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  writeData(texture: WebGLTexture, data: Float32Array) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RGBA, gl.FLOAT, data);
  }

  readData(texture: WebGLTexture): Float32Array {
    const gl = this.gl;
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    
    const data = new Float32Array(this.width * this.height * 4);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.FLOAT, data);
    gl.deleteFramebuffer(fb);
    return data;
  }

  createKernel(fragmentSource: string): WebGLProgram {
    const gl = this.gl;
    const vsSource = `#version 300 es
      in vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const program = gl.createProgram()!;
    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program)!);
    }
    return program;
  }

  run(program: WebGLProgram, inputs: WebGLTexture[], output: { in: WebGLTexture, out: WebGLTexture, fb: WebGLFramebuffer }, uniforms: any = {}) {
    const gl = this.gl;
    gl.useProgram(program);

    // Bind Quad
    const posLoc = gl.getAttribLocation(program, 'position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Bind Inputs
    inputs.forEach((tex, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      const loc = gl.getUniformLocation(program, `uInput${i}`);
      gl.uniform1i(loc, i);
    });

    // Set Uniforms
    for (const key in uniforms) {
      const loc = gl.getUniformLocation(program, key);
      if (loc) gl.uniform1f(loc, uniforms[key]);
    }

    // Bind Output Framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, output.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output.out, 0);
    gl.viewport(0, 0, this.width, this.height);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Swap buffers (Ping Pong)
    const temp = output.in;
    output.in = output.out;
    output.out = temp;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader)!);
    }
    return shader;
  }
}