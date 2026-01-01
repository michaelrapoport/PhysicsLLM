export const GRAVITY = 9.81; // m/s^2
export const PIXELS_PER_METER = 50; // Visualization scale
export const DT = 1 / 60; // Fixed timestep

export const MATERIALS = {
  steel: { density: 7850, restitution: 0.5, friction: 0.4, color: '#95a5a6' },
  wood: { density: 700, restitution: 0.2, friction: 0.6, color: '#d35400' },
  rubber: { density: 1100, restitution: 0.8, friction: 0.9, color: '#e74c3c' },
  concrete: { density: 2400, restitution: 0.1, friction: 0.8, color: '#7f8c8d' },
  cloth: { density: 500, restitution: 0.1, friction: 0.9, color: '#e67e22' },
  default: { density: 1000, restitution: 0.5, friction: 0.5, color: '#3498db' },
};

export const DEFAULT_SCENARIO_CODE = `// Initialize Environment
const env = new Lab.Environment({ gravity: 9.81, seed: 42 });

// Add a 10kg steel box 5 meters in the air
// Try changing 'steel' to 'rubber' or 'wood'
const box = env.add('box', { 
  mass: 10, 
  material: 'steel', 
  y: 5, 
  x: 4 
});

// Add a floor
const floor = env.add('plane', { 
  material: 'concrete', 
  fixed: true, 
  y: 0 
});

// Run simulation
env.run();`;