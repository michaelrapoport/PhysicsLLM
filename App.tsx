import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, RotateCcw, Box, Terminal, Activity, FileJson, CheckCircle2, Cpu, Wand2, Sparkles, AlertCircle, Zap, BookOpen } from 'lucide-react';
import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { PhysicsEngine } from './services/physicsEngine';
import { PhysicsNemo } from './services/PhysicsNemo';
import SimulationViewer from './components/SimulationViewer';
import Editor from './components/Editor';
import DataLogs from './components/DataLogs';
import { DEFAULT_SCENARIO_CODE } from './constants';
import { SimulationState } from './types';

// Add window type definition for AI Studio
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}

// -- Tool Definition --
const toolExecutionPhysicsNemo: FunctionDeclaration = {
  name: "execute_physics_nemo",
  description: "Runs a high-fidelity physics simulation script (PhysLLM syntax). Returns NOT ONLY final state, but also TELEMETRY (Max Height, Max Velocity) and IMPACT LOGS. Use this to verify 'Will it fall?', 'How high does it go?', or 'How fast is it?'",
  parameters: {
    type: Type.OBJECT,
    properties: {
      code: {
        type: Type.STRING,
        description: "The JavaScript code for the simulation. Must use `env.add`, `env.connect`.",
      },
      duration: {
        type: Type.NUMBER,
        description: "Simulation duration in seconds. Default 2.0.",
      }
    },
    required: ["code"],
  },
};

const DEMOS = {
  basic: DEFAULT_SCENARIO_CODE,
  cloth: `// NVIDIA PhysicsNemo - Cloth Simulation
const env = new Lab.Environment();

// Add a cloth pinned at the top
// args: 'cloth', { x, y, width, height, segmentsX, segmentsY, pinTop }
env.add('cloth', { 
  x: 0, 
  y: 8, 
  width: 6, 
  height: 4, 
  segmentsX: 12, 
  segmentsY: 8,
  pinTop: true,
  color: '#e67e22'
});

// Add a sphere to interact with
env.add('circle', {
  x: 1, y: 5, radius: 1, mass: 20, color: '#3498db'
});

env.add('plane', { y: 0, material: 'concrete' });
env.run();`,
  fluid: `// NVIDIA PhysicsNemo - GPU Fluid Interaction
const env = new Lab.Environment();

// Add containers
env.add('box', { x: -4, y: 2, width: 1, height: 4, fixed: true });
env.add('box', { x: 4, y: 2, width: 1, height: 4, fixed: true });
env.add('plane', { y: 0, material: 'concrete' });

// Add a heavy object to splash
env.add('box', {
  x: 0, y: 8, width: 2, height: 2, mass: 50, material: 'steel'
});

env.run();`
};

function App() {
  const engineRef = useRef<PhysicsEngine>(new PhysicsEngine());
  const [code, setCode] = useState(DEFAULT_SCENARIO_CODE);
  const [simState, setSimState] = useState<SimulationState>(engineRef.current.getState());
  const [isRunning, setIsRunning] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  
  const requestRef = useRef<number>();

  // Initialize engine with current code on mount
  useEffect(() => {
    engineRef.current.parseAndExecute(code);
    setSimState(engineRef.current.getState());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runLoop = useCallback(() => {
    if (!isRunning) return;
    
    engineRef.current.step();
    setSimState(engineRef.current.getState());
    
    requestRef.current = requestAnimationFrame(runLoop);
  }, [isRunning]);

  useEffect(() => {
    if (isRunning) {
      requestRef.current = requestAnimationFrame(runLoop);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isRunning, runLoop]);

  const handleRun = () => {
    if (!isRunning) {
        engineRef.current.parseAndExecute(code); 
        setIsRunning(true);
    } else {
        setIsRunning(false);
    }
  };

  const handleReset = () => {
    setIsRunning(false);
    engineRef.current.reset();
    engineRef.current.parseAndExecute(code);
    setSimState(engineRef.current.getState());
    setToolStatus(null);
  };

  const loadDemo = (type: keyof typeof DEMOS) => {
      setIsRunning(false);
      const demoCode = DEMOS[type];
      setCode(demoCode);
      engineRef.current.reset();
      engineRef.current.parseAndExecute(demoCode);
      setSimState(engineRef.current.getState());
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setAiError(null);
    setToolStatus(null);

    try {
        if (window.aistudio) {
            const hasKey = await window.aistudio.hasSelectedApiKey();
            if (!hasKey) await window.aistudio.openSelectKey();
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const systemInstruction = `
        You are PhysLLM, an AI physics engineer powered by NVIDIA PhysicsNemo.
        
        YOUR GOAL:
        1. If the user asks for a simulation setup (e.g., "create a scene with..."), generate the code directly.
        2. If the user asks a PREDICTIVE question (e.g., "will it fall?", "how high will it go?"), you MUST use the 'execute_physics_nemo' tool to run a simulation first. Analyze the tool output to answer the user.
        
        API SYNTAX (Lab.Environment):
        - env.add(type, { x, y, mass, width, height, radius, material, fixed, color, vx, vy })
        - env.add('cloth', { x, y, width, height, segmentsX, segmentsY, pinTop })
        - env.connect(idA, idB, { stiffness, length })
        - Always start with: const env = new Lab.Environment({ gravity: 9.81 });
        - Always end with: env.run();
        `;

        // 1. Initial Prompt
        let response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.2,
                tools: [{ functionDeclarations: [toolExecutionPhysicsNemo] }]
            }
        });

        // 2. Handle Tool Calls (Multi-turn loop)
        const functionCalls = response.candidates?.[0]?.content?.parts?.filter(p => p.functionCall).map(p => p.functionCall);
        
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            if (call.name === 'execute_physics_nemo' && call.args) {
                setToolStatus("Running NVIDIA PhysicsNemo kernel...");
                
                const simCode = call.args['code'] as string;
                const duration = (call.args['duration'] as number) || 2.0;
                
                // Execute Tool
                const toolResult = await PhysicsNemo.runSimulation(simCode, duration);
                setToolStatus("PhysicsNemo analysis complete.");

                // Also update the UI editor so the user sees what was run
                setCode(simCode);
                engineRef.current.reset();
                engineRef.current.parseAndExecute(simCode);
                setSimState(engineRef.current.getState());

                // 3. Send Tool Result back to Model
                const toolResponseParts = [{
                    functionResponse: {
                        name: 'execute_physics_nemo',
                        response: { result: toolResult }
                    }
                }];

                // Follow-up generation
                const finalResponse = await ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: [
                        { role: 'user', parts: [{ text: prompt }] },
                        { role: 'model', parts: response.candidates?.[0]?.content?.parts || [] },
                        { role: 'function', parts: toolResponseParts }
                    ],
                    config: { systemInstruction }
                });
                
                // If the model generated a text explanation, we're done. 
                // It might also generate code *again* to show the user. 
                // We'll prioritize the code if it exists in the final response text block.
                const finalText = finalResponse.text || "";
                const codeMatch = finalText.match(/```javascript([\s\S]*?)```/) || finalText.match(/```([\s\S]*?)```/);
                
                if (codeMatch) {
                   // If final response contains code, update it
                   setCode(codeMatch[1].trim());
                } else {
                   // Otherwise, the tool ran the code (which we already set), 
                   // and the text is just the explanation. 
                   // We might want to show the explanation in logs.
                   engineRef.current['log'](`AI Analysis: ${finalText}`);
                }
                
                // Auto-run visuals after tool use
                setIsRunning(true);
            }
        } else {
            // No tool call, just standard generation
            const generatedCode = response.text?.replace(/```javascript|```/g, '').trim();
            if (generatedCode) {
                setCode(generatedCode);
                setIsRunning(false);
                engineRef.current.reset();
                engineRef.current.parseAndExecute(generatedCode);
                setSimState(engineRef.current.getState());
            } else {
                setAiError("No code generated.");
            }
        }

    } catch (e: any) {
        console.error(e);
        setAiError(e.message || "Failed to generate simulation.");
        setToolStatus(null);
    } finally {
        setIsGenerating(false);
    }
  };

  const handleCanvasInteract = (type: string, x: number, y: number) => {
    if (type === 'mousedown') {
        engineRef.current.startDrag(x, y);
    } else if (type === 'mousemove') {
        engineRef.current.updateDrag(x, y);
    } else if (type === 'mouseup') {
        engineRef.current.endDrag();
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans text-brand-dark bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-brand-dark p-2 rounded-lg">
                <Box className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-brand-dark">PhysLLM.js</span>
            <span className="bg-brand-blue/10 text-brand-blue text-xs font-semibold px-2 py-0.5 rounded border border-brand-blue/20">v2.1 NEMO</span>
          </div>
          <div className="hidden md:flex items-center space-x-6 text-sm font-medium text-gray-500">
             {toolStatus && (
                 <div className="flex items-center text-green-600 animate-pulse bg-green-50 px-2 py-1 rounded">
                     <Cpu className="w-4 h-4 mr-2" />
                     {toolStatus}
                 </div>
             )}
            <a href="https://github.com/google/genai" target="_blank" rel="noreferrer" className="text-gray-900 hover:text-brand-blue">GitHub</a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-brand-bg to-white py-12 border-b border-gray-100">
        <div className="max-w-4xl mx-auto text-center px-4">
          <h1 className="text-4xl md:text-5xl font-bold text-brand-dark mb-4 tracking-tight">
            Give your LLM a <span className="text-brand-blue">Physics Degree</span>
          </h1>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto leading-relaxed">
             Powered by <strong className="text-green-700">NVIDIA PhysicsNemo</strong> for agentic verification.
             Ask predictive questions like <em>"Will the tower fall?"</em> and watch the AI test it first.
          </p>
          
          {/* AI Input Box */}
          <div className="max-w-xl mx-auto relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-teal-500 rounded-lg blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
            <div className="relative flex items-center bg-white rounded-lg shadow-xl p-2 border border-gray-200">
                <Wand2 className="w-6 h-6 text-brand-blue ml-3 animate-pulse" />
                <input 
                    type="text" 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                    placeholder="Try: 'Will a 5kg box crush a glass table?'" 
                    className="flex-grow px-4 py-3 outline-none text-gray-700 placeholder-gray-400 font-medium"
                />
                <button 
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="bg-brand-dark hover:bg-gray-800 text-white px-6 py-2 rounded-md font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                    {isGenerating ? <Activity className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    {isGenerating ? 'Thinking...' : 'Generate'}
                </button>
            </div>
          </div>
          {aiError && (
              <div className="max-w-xl mx-auto mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  {aiError}
              </div>
          )}

        </div>
      </section>

      {/* Main Interactive Demo Area */}
      <section id="demo" className="py-8 px-4 bg-gray-50 border-b border-gray-200 flex-grow">
        <div className="max-w-7xl mx-auto h-full">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
                <div>
                    <h2 className="text-xl font-bold text-brand-dark flex items-center">
                        <Activity className="w-5 h-5 mr-2 text-brand-red" />
                        Interactive Playground
                    </h2>
                    <p className="text-gray-500 text-xs mt-0.5">
                        Agentic Mode: AI may execute code in the background before showing results.
                    </p>
                </div>
                
                {/* Getting Started / Demos Menu */}
                <div className="relative group z-10">
                   <button className="flex items-center px-3 py-1.5 bg-brand-blue/10 text-brand-blue border border-brand-blue/20 rounded-md text-sm font-medium hover:bg-brand-blue/20 transition-colors">
                     <BookOpen className="w-4 h-4 mr-2" />
                     Load Demo
                   </button>
                   <div className="absolute left-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-left">
                     <div className="py-1">
                       <button onClick={() => loadDemo('basic')} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Basic Rigid Body</button>
                       <button onClick={() => loadDemo('cloth')} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 font-bold text-brand-blue">Soft Body (Cloth)</button>
                       <button onClick={() => loadDemo('fluid')} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">GPU Fluid</button>
                     </div>
                   </div>
                </div>
            </div>
            
            <div className="flex space-x-2">
                <button 
                    onClick={handleReset}
                    className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50 text-gray-700 transition-colors"
                >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset
                </button>
                <button 
                    onClick={handleRun}
                    className={`flex items-center px-6 py-2 rounded-md text-sm font-bold shadow-sm transition-colors ${
                        isRunning 
                        ? 'bg-amber-500 hover:bg-amber-600 text-white' 
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                >
                    <Play className="w-4 h-4 mr-2 fill-current" />
                    {isRunning ? 'Pause' : 'Run'}
                </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[600px]">
            
            {/* Left Col: Code Editor */}
            <div className="lg:col-span-4 h-full flex flex-col rounded-xl overflow-hidden shadow-xl border border-gray-700">
                <Editor code={code} onChange={(val) => {
                    setCode(val);
                    if (!isRunning) {
                        engineRef.current.parseAndExecute(val);
                        setSimState(engineRef.current.getState());
                    }
                }} />
            </div>

            {/* Right Col: Visuals & Data */}
            <div className="lg:col-span-8 h-full flex flex-col gap-6">
                
                {/* Visualizer */}
                <div className="flex-grow bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden relative group">
                    <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex justify-between items-center">
                        <span className="text-xs font-semibold uppercase text-gray-500 flex items-center">
                            <Cpu className="w-4 h-4 mr-2" />
                            Render View (Interactive)
                        </span>
                        <div className="flex items-center space-x-2">
                            {toolStatus && <span className="text-[10px] text-green-600 font-bold mr-2 uppercase tracking-wider animate-pulse">NVIDIA KERNEL ACTIVE</span>}
                            <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></span>
                            <span className="text-xs text-gray-600 font-medium">{isRunning ? 'Running' : 'Ready'}</span>
                        </div>
                    </div>
                    <div className="h-[350px] relative cursor-crosshair">
                        <SimulationViewer 
                            state={simState} 
                            isRunning={isRunning} 
                            onInteract={handleCanvasInteract}
                        />
                    </div>
                </div>

                {/* Data Panel */}
                <div className="h-[200px] bg-gray-900 rounded-xl shadow-lg border border-gray-800 overflow-hidden flex flex-col">
                    <div className="bg-gray-800 px-4 py-1.5 flex justify-between items-center border-b border-gray-700">
                        <span className="text-xs font-semibold text-gray-400 flex items-center">
                            <FileJson className="w-3 h-3 mr-2" />
                            Data Stream
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono">JSON / CSV Output</span>
                    </div>
                    <DataLogs logs={simState.events} />
                </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-brand-dark text-white py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
                <h5 className="font-bold text-lg">PhysLLM.js</h5>
                <p className="text-gray-400 text-sm">Powered by Google Gemini 3.0 & NVIDIA PhysicsNemo™</p>
            </div>
            <div className="flex space-x-6 text-sm text-gray-400">
                <a href="#" className="hover:text-white">Privacy</a>
                <a href="#" className="hover:text-white">Terms</a>
            </div>
        </div>
      </footer>
    </div>
  );
}

export default App;