import * as React from 'react';
import { PGSLEngine } from '../services/cahEngine';
import { GeminiController } from '../services/geminiService';
import { Node, NodeType } from '../types';

const { useState, useEffect } = React;

interface ControlPanelProps {
  engine: PGSLEngine;
  nodes: any[];
  selectedNodeId: string | null;
}

const StageItem: React.FC<{ 
    item: string | number, 
    engine: PGSLEngine, 
    onDuplicate: () => void,
    onRemove: () => void 
}> = ({ item, engine, onDuplicate, onRemove }) => {
    const isURI = typeof item === 'string' && (item.includes('://') || item.startsWith('did:'));
    const isNodeKnown = isURI && engine.getNode(item as string);
    
    let content;
    if (isNodeKnown) {
        const node = engine.getNode(item as string)!;
        const isAtom = (node["@type"] as string[]).includes(NodeType.ATOM);
        const val = isAtom ? (node as any)["rdf:value"] : `L${(node as any)["pgsl:level"]} Frag`;
        content = (
            <span className="flex items-center gap-1 text-amber-200" title={item as string}>
                <span className={`w-2 h-2 rounded-full ${isAtom ? 'bg-blue-500' : 'bg-amber-500'}`}></span>
                {val}
            </span>
        );
    } else if (isURI) {
         content = <span className="text-emerald-300 font-mono text-[10px] truncate max-w-[80px]" title={item as string}>REF: {item}</span>;
    } else {
        content = <span className="text-white font-mono">"{item}"</span>;
    }

    return (
        <span className="group inline-flex items-center gap-2 bg-slate-800 border border-slate-700 px-2 py-1 rounded text-xs hover:border-slate-500 transition-colors">
             {content}
             <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1 border-l border-slate-600 pl-1">
                 <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="text-[10px] text-blue-400 hover:text-blue-300 font-bold" title="Duplicate">
                    x2
                 </button>
                 <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="text-[10px] text-red-400 hover:text-red-300 font-bold" title="Remove">
                    ×
                 </button>
             </div>
        </span>
    );
};

const ControlPanel: React.FC<ControlPanelProps> = ({ engine, selectedNodeId }) => {
  const [textInput, setTextInput] = useState<string>('');
  const [stage, setStage] = useState<(string | number)[]>([]);
  
  // Federation State
  const [hostUri, setHostUri] = useState('http://localhost:3000');
  const [userDid, setUserDid] = useState('did:web:alice');
  
  // Gemini State
  const [geminiPrompt, setGeminiPrompt] = useState('');
  const [isGeminiLoading, setIsGeminiLoading] = useState(false);
  const [geminiResponse, setGeminiResponse] = useState('');
  
  const gemini = new GeminiController(engine);

  useEffect(() => {
    engine.setFederationConfig(hostUri, userDid);
  }, [hostUri, userDid, engine]);

  // --- Staging Actions ---

  const addToStageAsChars = () => {
    if (!textInput) return;
    const chars = textInput.split('');
    setStage(prev => [...prev, ...chars]);
    setTextInput('');
  };

  const addToStageAsAtom = () => {
      if (!textInput) return;
      setStage(prev => [...prev, textInput]);
      setTextInput('');
  };

  const addSelectedNodeToStage = () => {
      if (selectedNodeId) {
          setStage(prev => [...prev, selectedNodeId]);
      }
  };

  const clearStage = () => setStage([]);

  const removeItem = (index: number) => {
      setStage(prev => prev.filter((_, i) => i !== index));
  };

  const duplicateItem = (index: number) => {
      setStage(prev => {
          const newItem = prev[index];
          const newArr = [...prev];
          newArr.splice(index + 1, 0, newItem);
          return newArr;
      });
  };

  const handleIngestStage = () => {
    if (stage.length === 0) return;
    try {
        engine.ingestSequence(stage);
        setStage([]);
    } catch (err) {
        alert("Error ingesting sequence: " + (err as Error).message);
    }
  };

  const handleCombineAndRestage = () => {
    if (stage.length === 0) return;
    try {
        const newId = engine.ingestSequence(stage);
        setStage([newId]);
    } catch (err) {
        alert("Error combining: " + (err as Error).message);
    }
  };

  const handleGeminiSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!geminiPrompt) return;
      setIsGeminiLoading(true);
      setGeminiResponse('');
      try {
          const result = await gemini.interpretAndExecute(geminiPrompt);
          setGeminiResponse(result);
      } catch (err) {
          setGeminiResponse("Error: " + (err as Error).message);
      } finally {
          setIsGeminiLoading(false);
      }
  };

  return (
    <div className="h-full flex flex-col divide-y divide-slate-800 bg-slate-900">
      
      {/* --- Federation Settings --- */}
      <div className="p-4 bg-slate-950">
        <h3 className="text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-wider">Federation Identity</h3>
        <div className="space-y-2">
            <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">Host Authority (URI)</label>
                <input 
                    type="text" 
                    value={hostUri}
                    onChange={e => setHostUri(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-emerald-400 text-xs px-2 py-1 rounded font-mono focus:border-emerald-500 focus:outline-none"
                />
            </div>
            <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">User Agent (DID)</label>
                <input 
                    type="text" 
                    value={userDid}
                    onChange={e => setUserDid(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-purple-400 text-xs px-2 py-1 rounded font-mono focus:border-purple-500 focus:outline-none"
                />
            </div>
        </div>
      </div>

      {/* --- Sequence Builder --- */}
      <div className="p-4 flex flex-col gap-4">
        
        <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            Semantic Builder
            </h3>
        </div>

        <div className="space-y-2">
            <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type data..."
                className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-emerald-500"
            />
            <div className="grid grid-cols-2 gap-2">
                <button onClick={addToStageAsChars} disabled={!textInput} className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs py-2 rounded border border-slate-700 transition-colors">
                    Add Chars
                </button>
                <button onClick={addToStageAsAtom} disabled={!textInput} className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs py-2 rounded border border-slate-700 transition-colors">
                    Add Atom
                </button>
            </div>
            
            <button 
                onClick={addSelectedNodeToStage} 
                disabled={!selectedNodeId}
                className="w-full flex items-center justify-center gap-2 bg-amber-900/30 hover:bg-amber-900/50 disabled:opacity-50 text-amber-500 border border-amber-900/50 text-xs py-2 rounded transition-colors"
            >
                Add Selected URI to Stage
            </button>
        </div>

        <div className="bg-slate-950 rounded border border-slate-800 p-3 min-h-[80px] flex flex-col">
            <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] uppercase font-bold text-slate-500">Staging ({stage.length})</span>
                {stage.length > 0 && (
                    <button onClick={clearStage} className="text-[10px] text-red-400 hover:text-red-300">Clear</button>
                )}
            </div>
            
            <div className="flex flex-wrap gap-2 flex-1 content-start">
                {stage.length === 0 ? (
                    <span className="text-slate-600 text-xs italic">Empty...</span>
                ) : (
                    stage.map((item, idx) => (
                        <StageItem 
                            key={idx} 
                            item={item} 
                            engine={engine} 
                            onDuplicate={() => duplicateItem(idx)}
                            onRemove={() => removeItem(idx)}
                        />
                    ))
                )}
            </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
             <button 
                onClick={handleCombineAndRestage} 
                disabled={stage.length === 0}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-2 py-3 rounded shadow-lg shadow-amber-900/20 transition-all active:scale-95 flex flex-col items-center justify-center"
            >
                <span>Combine &</span>
                <span>Restage URI</span>
            </button>
            <button 
                onClick={handleIngestStage} 
                disabled={stage.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-2 py-3 rounded shadow-lg shadow-emerald-900/20 transition-all active:scale-95 flex flex-col items-center justify-center"
            >
                <span>Mint &</span>
                <span>Clear</span>
            </button>
        </div>

      </div>

       {/* --- Gemini AI Assistant --- */}
       <div className="p-4 bg-indigo-950/20 flex-1 border-t border-slate-800 overflow-hidden flex flex-col">
         <h3 className="text-sm font-bold text-indigo-400 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
             PGSL Architect AI
         </h3>
         {!process.env.API_KEY ? (
             <p className="text-xs text-slate-500">API Key missing.</p>
         ) : (
            <form onSubmit={handleGeminiSubmit} className="space-y-2 flex-1 flex flex-col">
                <textarea
                    value={geminiPrompt}
                    onChange={(e) => setGeminiPrompt(e.target.value)}
                    placeholder='Describe structure...'
                    className="w-full h-20 bg-slate-900/50 border border-slate-700 text-white text-xs rounded p-2 focus:border-indigo-500 focus:outline-none resize-none"
                />
                <button 
                    type="submit" 
                    disabled={isGeminiLoading || !geminiPrompt}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs py-2 rounded font-medium"
                >
                    {isGeminiLoading ? 'Architecting...' : 'Generate Plan'}
                </button>
                {geminiResponse && (
                    <div className="flex-1 text-xs text-indigo-300 mt-2 bg-indigo-900/20 p-2 rounded overflow-y-auto border border-indigo-900/50 whitespace-pre-wrap min-h-0">
                        {geminiResponse}
                    </div>
                )}
            </form>
         )}
       </div>
    </div>
  );
};

export default ControlPanel;