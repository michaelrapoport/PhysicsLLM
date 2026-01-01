import React, { useEffect, useRef } from 'react';
import { SimulationState, SimObject, Constraint } from '../types';
import { PIXELS_PER_METER } from '../constants';

interface SimulationViewerProps {
  state: SimulationState;
  isRunning: boolean;
  onInteract?: (type: 'mousedown' | 'mouseup' | 'mousemove', x: number, y: number) => void;
}

const SimulationViewer: React.FC<SimulationViewerProps> = ({ state, isRunning, onInteract }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getPhysicsCoords = (clientX: number, clientY: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    const originX = canvas.width / 2;
    const originY = canvas.height - 50;
    
    const physX = (x - originX) / PIXELS_PER_METER;
    const physY = (originY - y) / PIXELS_PER_METER;
    
    return { x: physX, y: physY };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      if(!canvasRef.current || !onInteract) return;
      const { x, y } = getPhysicsCoords(e.clientX, e.clientY, canvasRef.current);
      onInteract('mousedown', x, y);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if(!canvasRef.current || !onInteract) return;
      if (e.buttons === 1) {
        const { x, y } = getPhysicsCoords(e.clientX, e.clientY, canvasRef.current);
        onInteract('mousemove', x, y);
      }
  };

  const handleMouseUp = () => {
      if(!onInteract) return;
      onInteract('mouseup', 0, 0);
  };

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.fillStyle = '#f0f9ff';
    ctx.fillRect(0, 0, width, height);

    // Draw Grid
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = (width/2) % PIXELS_PER_METER; x < width; x += PIXELS_PER_METER) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    const groundY = height - 50;
    for (let y = groundY; y > 0; y -= PIXELS_PER_METER) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    const originX = width / 2;
    const originY = height - 50;

    ctx.save();
    ctx.translate(originX, originY);
    ctx.scale(1, -1); 

    // 0. Draw GPU Particles (Fluid System)
    if (state.particles) {
        ctx.fillStyle = 'rgba(52, 152, 219, 0.6)';
        const pData = state.particles;
        for(let i=0; i < pData.length; i+=4) {
            const x = pData[i];
            const y = pData[i+1];
            // Render as small rects for speed
            const size = 3; // pixels
            const pxX = x * PIXELS_PER_METER;
            const pxY = y * PIXELS_PER_METER;
            // Manual fillRect calc because of scale(1, -1)
            ctx.fillRect(pxX - 1.5, pxY - 1.5, 3, 3);
        }
    }

    // 1. Draw Constraints
    if (state.constraints) {
        state.constraints.forEach((c: Constraint) => {
            const objA = state.objects.find(o => o.id === c.bodyA);
            const objB = state.objects.find(o => o.id === c.bodyB);
            if (objA && objB) {
                ctx.beginPath();
                ctx.strokeStyle = c.color;
                ctx.lineWidth = 2;
                ctx.moveTo(objA.pos.x * PIXELS_PER_METER, objA.pos.y * PIXELS_PER_METER);
                ctx.lineTo(objB.pos.x * PIXELS_PER_METER, objB.pos.y * PIXELS_PER_METER);
                ctx.stroke();
            }
        });
    }

    // 2. Draw Objects
    state.objects.forEach((obj: SimObject) => {
      ctx.save();
      const pxX = obj.pos.x * PIXELS_PER_METER;
      const pxY = obj.pos.y * PIXELS_PER_METER;
      ctx.translate(pxX, pxY);
      ctx.rotate(obj.angle); 

      ctx.fillStyle = obj.color;
      ctx.strokeStyle = '#2c3e50';
      ctx.lineWidth = 2;

      ctx.beginPath();
      if (obj.type === 'box') {
        const w = obj.width * PIXELS_PER_METER;
        const h = obj.height * PIXELS_PER_METER;
        ctx.rect(-w / 2, -h / 2, w, h);
      } else if (obj.type === 'circle') {
        const r = obj.radius * PIXELS_PER_METER;
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.moveTo(0, 0);
        ctx.lineTo(r, 0);
      } else if (obj.type === 'plane') {
        ctx.strokeStyle = obj.color;
        ctx.lineWidth = 4;
        ctx.moveTo(-1000, 0); 
        ctx.lineTo(1000, 0);
        ctx.stroke();
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    ctx.restore();

    // UI Overlays
    ctx.fillStyle = '#2c3e50';
    ctx.font = '12px monospace';
    ctx.fillText(`Time: ${state.time.toFixed(2)}s`, 10, 20);
    ctx.fillText(`SAT Solver: Active`, 10, 35);
    ctx.fillText(`GPU Particles: ${state.particles ? state.particles.length / 4 : 0}`, 10, 50);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeObserver = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) draw(ctx, canvas.width, canvas.height);
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []); 

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) draw(ctx, canvas.width, canvas.height);
  }, [state, isRunning]);

  return (
    <div ref={containerRef} className="w-full h-full bg-white rounded-lg shadow-inner overflow-hidden relative">
        <canvas 
            ref={canvasRef} 
            className="block w-full h-full touch-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        />
        <div className="absolute bottom-2 right-2 text-xs text-slate-400 pointer-events-none select-none">
            Scale: {PIXELS_PER_METER}px = 1m
        </div>
    </div>
  );
};

export default SimulationViewer;