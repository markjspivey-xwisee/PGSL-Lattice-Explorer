import * as React from 'react';
import { pgslEngine } from './services/cahEngine';
import GraphVisualizer from './components/GraphVisualizer';
import ControlPanel from './components/ControlPanel';
import Inspector from './components/Inspector';
import ChainExplorer from './components/ChainExplorer';
import { Node } from './types';

const { useEffect, useState } = React;

function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Sync state with engine
  useEffect(() => {
    const sync = () => {
      setNodes(pgslEngine.getAllNodes());
    };
    const unsub = pgslEngine.subscribe(sync);
    sync(); // Initial load
    return unsub;
  }, []);

  const handleReset = () => {
      if(window.confirm("Reset entire semantic hypergraph?")) {
          pgslEngine.reset();
          setSelectedNodeId(null);
      }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-200 font-sans">
      {/* Header */}
      <header className="h-14 border-b border-slate-800 bg-slate-900 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
                P
            </div>
            <h1 className="font-semibold text-lg text-white tracking-tight">PGSL Semantic Explorer</h1>
        </div>
        <div className="flex gap-4 text-sm text-slate-400">
            <button onClick={handleReset} className="hover:text-red-400 transition-colors">Reset Graph</button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left: Controls */}
        <div className="w-80 border-r border-slate-800 bg-slate-900 flex flex-col z-20 shadow-xl">
          <ControlPanel 
              engine={pgslEngine} 
              nodes={nodes} 
              selectedNodeId={selectedNodeId} 
          />
        </div>

        {/* Center: Graph & Chain Explorer */}
        <div className="flex-1 flex flex-col bg-slate-950 relative min-w-0">
          <div className="flex-1 relative">
              {nodes.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-slate-600 flex-col gap-4">
                    <div className="text-6xl opacity-20">🕸️</div>
                    <p className="text-slate-500">Semantic Graph is empty. Mint URIs to begin.</p>
                </div>
              ) : (
                <GraphVisualizer 
                    engine={pgslEngine} 
                    onNodeSelect={setSelectedNodeId} 
                    selectedNodeId={selectedNodeId}
                />
              )}
          </div>
          {/* Chain Explorer attached to bottom of center panel */}
          <ChainExplorer engine={pgslEngine} startNodeId={selectedNodeId} />
        </div>

        {/* Right: Inspector */}
        <div className="w-80 border-l border-slate-800 bg-slate-900 z-20 shadow-xl overflow-y-auto">
          <Inspector engine={pgslEngine} nodeId={selectedNodeId} />
        </div>

      </div>
    </div>
  );
}

export default App;