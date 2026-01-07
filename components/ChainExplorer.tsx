
import * as React from 'react';
import { PGSLEngine } from '../services/cahEngine';
import { Node, NodeType } from '../types';

const { useState, useEffect, useMemo } = React;

interface ChainExplorerProps {
    engine: PGSLEngine;
    startNodeId: string | null;
}

// Recursive Component for Nested Rectangles
const NestedNode: React.FC<{ uri: string, engine: PGSLEngine, depth?: number, isRoot?: boolean }> = ({ uri, engine, depth = 0, isRoot = false }) => {
    const node = engine.getNode(uri);
    if (!node) return <span className="text-xs text-red-500 font-mono">?</span>;
    
    const isAtom = (node["@type"] as string[]).includes(NodeType.ATOM);

    if (isAtom) {
        return (
            <div className="flex items-center justify-center bg-blue-950/80 border border-blue-500/50 text-blue-200 rounded px-1.5 py-0.5 text-[10px] font-mono shadow-sm min-w-[20px] select-none whitespace-nowrap">
                {(node as any)["rdf:value"]}
            </div>
        );
    }

    const content = (node as any)["pgsl:content"] || [];
    // Check if this is a wrapper (Level 1 with single content)
    const isWrapper = (node as any)["pgsl:level"] === 1 && content.length === 1;

    if (isWrapper) {
         // Render child directly, skipping the fragment box styling
         return <NestedNode uri={content[0]} engine={engine} depth={depth} />;
    }
    
    return (
        <div className={`
            flex items-center gap-1 p-1 rounded border shadow-sm transition-all
            ${depth === 0 ? 'bg-amber-900/10 border-amber-600/40' : ''}
            ${depth > 0 && depth % 2 !== 0 ? 'bg-slate-800/60 border-slate-600/40' : ''}
            ${depth > 0 && depth % 2 === 0 ? 'bg-slate-900/60 border-slate-700/40' : ''}
        `}>
            {content.map((c: string, i: number) => (
                <NestedNode key={`${c}-${i}`} uri={c} engine={engine} depth={depth + 1} />
            ))}
        </div>
    );
};

const ChainExplorer: React.FC<ChainExplorerProps> = ({ engine, startNodeId }) => {
    const [chain, setChain] = useState<string[]>([]);
    
    // Linear Options (Connected to Head/Tail Atoms)
    const [leftOptions, setLeftOptions] = useState<string[]>([]);
    const [rightOptions, setRightOptions] = useState<string[]>([]);

    // Structural Options (Connected to the Chain as a Unit)
    const [structuralLeft, setStructuralLeft] = useState<string[]>([]);
    const [structuralRight, setStructuralRight] = useState<string[]>([]);
    const [chainIsComposite, setChainIsComposite] = useState<string | null>(null);

    // Manual Add State
    const [addMode, setAddMode] = useState<'left' | 'right' | null>(null);
    const [inputValue, setInputValue] = useState('');
    
    // Autocomplete Data
    const [allNodes, setAllNodes] = useState<Node[]>([]);
    
    // Debug Mode
    const [debugMode, setDebugMode] = useState(false);
    const [debugInfo, setDebugInfo] = useState<any>({});
    
    // Subscription tick
    const [tick, setTick] = useState(0);

    // Dynamic Labels for UI Clarity
    const [headLabel, setHeadLabel] = useState("Head");
    const [tailLabel, setTailLabel] = useState("Tail");

    useEffect(() => {
        const sync = () => {
             setTick(t => t + 1);
             setAllNodes(engine.getAllNodes());
        };
        const unsub = engine.subscribe(sync);
        setAllNodes(engine.getAllNodes()); // Initial fetch
        return unsub;
    }, [engine]);

    useEffect(() => {
        if (startNodeId) {
            setChain([startNodeId]);
        }
    }, [startNodeId]);

    // Suggestions Logic for Autocomplete
    const suggestions = useMemo(() => {
        let candidates = allNodes;
        // Hide L1 Wrappers from suggestions to avoid noise
        candidates = candidates.filter(n => {
            if ((n["@type"] as string[]).includes(NodeType.FRAGMENT)) {
                if ((n as any)["pgsl:level"] === 1 && (n as any)["pgsl:content"]?.length === 1) return false;
            }
            return true;
        });

        if (!inputValue) {
             return [...candidates].reverse().slice(0, 6);
        }
        
        const lower = inputValue.toLowerCase();
        return candidates.filter(n => {
            const preview = engine.resolveContentString(n["@id"]);
            const idMatch = n["@id"].toLowerCase().includes(lower);
            return preview.toLowerCase().includes(lower) || idMatch;
        }).slice(0, 6);
    }, [allNodes, inputValue, engine]);

    // --- Main Logic for Neighbors (Linear & Structural) ---
    useEffect(() => {
        if (chain.length === 0) {
            setLeftOptions([]);
            setRightOptions([]);
            setStructuralLeft([]);
            setStructuralRight([]);
            setChainIsComposite(null);
            setDebugInfo({});
            setHeadLabel("Head");
            setTailLabel("Tail");
            return;
        }

        // 1. Structural Composite Check
        const compositeUri = engine.getFragmentUri(chain);
        setChainIsComposite(compositeUri || null);

        let sLeft: string[] = [];
        let sRight: string[] = [];

        if (compositeUri) {
            sLeft = engine.findNeighbors(compositeUri, 'left').map(n => n.neighbor);
            sRight = engine.findNeighbors(compositeUri, 'right').map(n => n.neighbor);
        }
        setStructuralLeft(sLeft);
        setStructuralRight(sRight);

        // 2. Linear Neighbors
        const head = chain[0];
        const tail = chain[chain.length - 1];
        
        setHeadLabel(engine.resolveContentString(head));
        setTailLabel(engine.resolveContentString(tail));
        
        // Only look for simple "Sequence" neighbors.
        // We do NOT want to show structural parents as sequence neighbors if we are already in a composite.
        // However, user might want to extend the sequence linearly even if it forms a group.
        
        const rawLeft = engine.findNeighbors(head, 'left').map(n => n.neighbor);
        const rawRight = engine.findNeighbors(tail, 'right').map(n => n.neighbor);

        // Filter: If a Linear neighbor is ALSO a Structural neighbor, rely on the Structural section to show it.
        // This reduces duplication and encourages correct semantic wrapping.
        setLeftOptions(rawLeft.filter(u => !sLeft.includes(u)));
        setRightOptions(rawRight.filter(u => !sRight.includes(u)));

        // Debug Info Gathering
        if (debugMode) {
            setDebugInfo({
                chain,
                compositeUri,
                headNeighborsRaw: engine.getDebugNeighbors(head),
                tailNeighborsRaw: engine.getDebugNeighbors(tail),
                compositeNeighborsRaw: compositeUri ? engine.getDebugNeighbors(compositeUri) : null
            });
        }

    }, [chain, engine, tick, debugMode]); 

    // --- Actions ---

    // Standard add: appends to list
    const smartAddToChain = (uri: string, direction: 'left' | 'right') => {
        let nodeToAdd = uri;
        
        // Double check for clean UI: If it's a L1 wrapper, unwrap it.
        const node = engine.getNode(uri);
        if (node && (node as any)['pgsl:level'] === 1 && (node as any)['pgsl:content']?.length === 1) {
             const innerUri = (node as any)['pgsl:content'][0];
             const innerNode = engine.getNode(innerUri);
             if (innerNode && (innerNode["@type"] as string[]).includes(NodeType.ATOM)) {
                 nodeToAdd = innerUri;
             }
        }

        setChain(prev => direction === 'left' ? [nodeToAdd, ...prev] : [...prev, nodeToAdd]);
    };

    const addToLeft = (uri: string) => smartAddToChain(uri, 'left');
    const addToRight = (uri: string) => smartAddToChain(uri, 'right');

    // Structural add: Collapse chain to composite, then add neighbor
    const addStructural = (uri: string, direction: 'left' | 'right') => {
        if (!chainIsComposite) return;
        
        let neighborToAdd = uri;
        // Unwrap neighbor if simple
        const nNode = engine.getNode(uri);
        if (nNode && (nNode as any)['pgsl:level'] === 1 && (nNode as any)['pgsl:content']?.length === 1) {
            const inner = (nNode as any)['pgsl:content'][0];
            const iNode = engine.getNode(inner);
            if(iNode && (iNode["@type"] as string[]).includes(NodeType.ATOM)) {
                neighborToAdd = inner;
            }
        }

        const newChain = direction === 'left' 
            ? [neighborToAdd, chainIsComposite] 
            : [chainIsComposite, neighborToAdd];
            
        setChain(newChain);
    };

    const reset = () => setChain(startNodeId ? [startNodeId] : []);
    const collapseToComposite = () => {
        if(chainIsComposite) setChain([chainIsComposite]);
    }

    const contractLeft = () => {
        if (chain.length === 0) return;
        setChain(prev => prev.slice(1));
    };

    const contractRight = () => {
        if (chain.length === 0) return;
        setChain(prev => prev.slice(0, -1));
    };
    
    const removeNodeAtIndex = (index: number) => {
        setChain(prev => prev.filter((_, i) => i !== index));
    };

    const handleManualSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputValue) {
            setAddMode(null);
            return;
        }
        let uri = inputValue;
        if (!inputValue.includes('://') && !inputValue.startsWith('did:')) {
            const exactMatch = suggestions.find(s => engine.resolveContentString(s["@id"]) === inputValue);
            if (exactMatch) {
                uri = exactMatch["@id"];
            } else {
                uri = engine.getCanonicalAtom(inputValue);
            }
        }
        if (addMode === 'left') addToLeft(uri);
        if (addMode === 'right') addToRight(uri);
        setAddMode(null);
        setInputValue('');
    };

    const selectNode = (uri: string) => {
        if (addMode === 'left') addToLeft(uri);
        if (addMode === 'right') addToRight(uri);
        setAddMode(null);
        setInputValue('');
    };

    const handleMintChain = () => {
        if (chain.length < 2) return;
        try {
            engine.ingestSequence(chain);
        } catch (e) {
            console.error(e);
        }
    };

    // --- Rendering Helpers ---

    const renderNodeButton = (uri: string, index: number, onClick?: () => void) => {
        return (
            <div className="group relative">
                <button 
                    onClick={onClick}
                    className={`
                        relative rounded flex items-center justify-center transition-transform active:scale-95
                        ${onClick ? 'cursor-pointer hover:scale-105' : 'cursor-default'}
                    `}
                    title={uri}
                >
                    <NestedNode uri={uri} engine={engine} isRoot={true} />
                </button>
                {!onClick && (
                    <button 
                        onClick={() => removeNodeAtIndex(index)}
                        className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-20"
                        title="Remove from chain"
                    >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>
        );
    };

    const renderSuggestionButton = (uri: string, onClick: () => void, isStructural = false) => {
        const node = engine.getNode(uri);
        if(!node) return null;
        
        const isAtom = (node["@type"] as string[]).includes(NodeType.ATOM);
        const resolvedText = engine.resolveContentString(uri);

        return (
            <button
                onClick={onClick}
                className={`
                    w-full text-left px-2 py-1.5 rounded flex items-center gap-2 group transition-all
                    ${isStructural ? 'bg-indigo-900/30 hover:bg-indigo-900/50 border border-indigo-500/30' : 'bg-slate-800 hover:bg-slate-700 border border-transparent'}
                `}
            >
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isAtom ? 'bg-blue-500' : 'bg-amber-500'} ${isStructural ? 'ring-2 ring-indigo-500 ring-opacity-50' : ''}`}></div>
                <div className="flex flex-col min-w-0">
                    <span className={`text-[10px] font-mono truncate ${isStructural ? 'text-indigo-200' : 'text-slate-300'}`}>
                        {resolvedText}
                    </span>
                </div>
            </button>
        );
    };

    const renderDropdown = () => {
        if (suggestions.length === 0) return null;
        return (
             <div className="absolute top-full left-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded shadow-2xl z-50 max-h-56 overflow-y-auto overflow-x-hidden">
                <div className="text-[9px] uppercase font-bold text-slate-500 px-3 py-1.5 bg-slate-950/90 sticky top-0 backdrop-blur-sm border-b border-slate-800">
                    Suggestions
                </div>
                {suggestions.map(node => {
                    const isAtom = (node["@type"] as string[]).includes(NodeType.ATOM);
                    const preview = engine.resolveContentString(node["@id"]);
                    const meta = isAtom ? "Atom" : `L${(node as any)["pgsl:level"]}`;
                    
                    return (
                        <div 
                            key={node["@id"]}
                            onMouseDown={(e) => { e.preventDefault(); selectNode(node["@id"]); }}
                            className="px-3 py-2 hover:bg-slate-800 cursor-pointer border-b border-slate-800/50 last:border-0 group"
                        >
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isAtom ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"}`}></span>
                                <span className="font-mono text-xs text-slate-200 truncate group-hover:text-white transition-colors">{preview}</span>
                            </div>
                            <div className="flex items-center justify-between text-[9px] text-slate-600 font-mono pl-3.5">
                                <span>{meta}</span>
                                <span className="truncate max-w-[100px] opacity-50">{node["@id"].split('/').pop()?.slice(0, 8)}...</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="flex flex-col relative z-30 bg-slate-950 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] border-t border-slate-800 h-[320px]">
            {/* Toolbar */}
            <div className="bg-slate-900 px-4 py-1.5 border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                    <span>Semantic Chain Explorer</span>
                    <button 
                        onClick={() => setDebugMode(!debugMode)} 
                        className={`px-2 py-0.5 rounded border transition-colors ${debugMode ? 'bg-red-900/50 text-red-400 border-red-900' : 'bg-slate-800 text-slate-600 border-slate-700 hover:text-slate-400'}`}
                    >
                        DEBUG
                    </button>
                </div>
                <div className="flex gap-2">
                    {chain.length >= 2 && (
                        <button 
                            onClick={handleMintChain} 
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-0.5 rounded text-[10px] font-bold transition-colors shadow-lg shadow-emerald-500/20"
                        >
                            Mint Chain
                        </button>
                    )}
                    {chain.length > 0 && <button onClick={reset} className="text-slate-400 hover:text-white transition-colors">Reset</button>}
                </div>
            </div>
            
            {chain.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                     <div className="text-sm font-bold opacity-50 mb-1">No Active Context</div>
                     <div className="text-xs">Select a node in the graph above to begin exploring connections.</div>
                </div>
            ) : (
                <div className="flex-1 flex overflow-hidden">
                    
                    {/* Left Options (Source) */}
                    <div className="w-64 border-r border-slate-800 bg-slate-900/30 flex flex-col">
                        
                        {/* Structural Header */}
                        {structuralLeft.length > 0 && (
                            <div className="shrink-0 border-b border-indigo-900/30 flex-1 overflow-y-auto">
                                <div className="px-3 py-1.5 text-[9px] text-indigo-400 font-bold bg-indigo-900/10 uppercase tracking-wider flex justify-between sticky top-0 backdrop-blur-sm z-10">
                                    <span>Left of Group</span>
                                    <span className="opacity-50">{structuralLeft.length}</span>
                                </div>
                                <div className="p-2 space-y-1">
                                    {structuralLeft.map(uri => (
                                        <div key={uri}>
                                            {renderSuggestionButton(uri, () => addStructural(uri, 'left'), true)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto border-t border-slate-800/50">
                            <div className="px-3 py-1.5 text-[9px] text-slate-500 text-center font-bold bg-slate-900/50 border-b border-slate-800/50 uppercase tracking-wider sticky top-0 backdrop-blur-sm z-10 truncate" title={`Items connecting to ${headLabel}`}>
                                Left of "{headLabel}"
                            </div>
                            <div className="p-3 flex flex-col gap-2 items-end">
                                {leftOptions.length === 0 && <div className="text-slate-700 text-center italic text-[10px] w-full py-2">No item matches</div>}
                                {leftOptions.map((uri) => (
                                    <div key={uri} className="w-full">
                                        {renderSuggestionButton(uri, () => addToLeft(uri))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Active Chain + Controls */}
                    <div className="flex-1 flex flex-col min-w-0 bg-slate-950 relative">
                        {/* Chain Visualization Area */}
                        <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-hidden relative">
                            
                            <div className="flex items-center gap-4 w-full justify-center overflow-x-auto p-4">
                                {/* Left Controls Group */}
                                <div className="flex items-center gap-2 shrink-0 relative">
                                    {addMode === 'left' ? (
                                        <form onSubmit={handleManualSubmit} className="flex items-center gap-1 bg-slate-800 p-1 rounded border border-slate-700 animate-in fade-in slide-in-from-right-2 relative z-50">
                                            <input 
                                                autoFocus
                                                type="text" 
                                                value={inputValue} 
                                                onChange={e => setInputValue(e.target.value)}
                                                placeholder="Find or add..."
                                                className="w-32 bg-slate-900 text-xs text-white px-2 py-1 rounded border border-slate-700 focus:outline-none focus:border-blue-500"
                                                onBlur={() => {
                                                    setTimeout(() => {
                                                        if(!inputValue) setAddMode(null);
                                                    }, 300);
                                                }}
                                            />
                                            {renderDropdown()}
                                        </form>
                                    ) : (
                                        <div className="flex flex-col gap-1 items-end">
                                            <div className="flex items-center gap-1">
                                                <button 
                                                    onClick={() => setAddMode('left')}
                                                    className="h-6 px-2 rounded-l bg-slate-800 hover:bg-emerald-900/50 border border-slate-700 hover:border-emerald-500/50 text-slate-400 hover:text-emerald-400 flex items-center justify-center transition-all text-[10px] font-bold"
                                                    title="Expand Left (Add New Node)"
                                                >
                                                    &lt; +
                                                </button>
                                                {chain.length > 0 && (
                                                    <button 
                                                        onClick={contractLeft}
                                                        className="w-6 h-6 rounded-r bg-slate-800 hover:bg-amber-900/50 border border-slate-700 hover:border-amber-500/50 text-slate-400 hover:text-amber-400 flex items-center justify-center transition-all"
                                                        title="Contract Left (Remove First)"
                                                    >
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* The Chain */}
                                <div className={`
                                    flex items-center gap-2 p-3 rounded-lg border transition-colors duration-500
                                    ${chainIsComposite ? 'border-indigo-500/30 bg-indigo-900/10' : 'border-transparent'}
                                `}>
                                    {chain.map((uri, idx) => (
                                        <React.Fragment key={`${uri}-${idx}`}>
                                            {idx > 0 && <div className="w-4 h-0.5 bg-slate-800 shrink-0 rounded-full"></div>}
                                            {renderNodeButton(uri, idx)}
                                        </React.Fragment>
                                    ))}
                                </div>

                                {/* Right Controls Group */}
                                <div className="flex items-center gap-2 shrink-0 relative">
                                    {addMode === 'right' ? (
                                        <form onSubmit={handleManualSubmit} className="flex items-center gap-1 bg-slate-800 p-1 rounded border border-slate-700 animate-in fade-in slide-in-from-left-2 relative z-50">
                                            <input 
                                                autoFocus
                                                type="text" 
                                                value={inputValue} 
                                                onChange={e => setInputValue(e.target.value)}
                                                placeholder="Find or add..."
                                                className="w-32 bg-slate-900 text-xs text-white px-2 py-1 rounded border border-slate-700 focus:outline-none focus:border-blue-500"
                                                onBlur={() => {
                                                    setTimeout(() => {
                                                        if(!inputValue) setAddMode(null);
                                                    }, 300);
                                                }}
                                            />
                                            {renderDropdown()}
                                        </form>
                                    ) : (
                                        <div className="flex flex-col gap-1 items-start">
                                            <div className="flex items-center gap-1">
                                                {chain.length > 0 && (
                                                    <button 
                                                        onClick={contractRight}
                                                        className="w-6 h-6 rounded-l bg-slate-800 hover:bg-amber-900/50 border border-slate-700 hover:border-amber-500/50 text-slate-400 hover:text-amber-400 flex items-center justify-center transition-all"
                                                        title="Contract Right (Remove Last)"
                                                    >
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => setAddMode('right')}
                                                    className="h-6 px-2 rounded-r bg-slate-800 hover:bg-emerald-900/50 border border-slate-700 hover:border-emerald-500/50 text-slate-400 hover:text-emerald-400 flex items-center justify-center transition-all text-[10px] font-bold"
                                                    title="Expand Right (Add New Node)"
                                                >
                                                    + &gt;
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Composite Indicator */}
                            {chainIsComposite && (
                                <div className="mt-4 flex flex-col items-center animate-in fade-in zoom-in duration-300">
                                    <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mb-1">
                                        Valid Group Structure
                                    </div>
                                    <button 
                                        onClick={collapseToComposite}
                                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded shadow-lg shadow-indigo-500/20 transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        <span>Collapse to Single Node</span>
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                    </button>
                                </div>
                            )}

                        </div>
                    </div>

                    {/* Right Options (Target) */}
                    <div className="w-64 border-l border-slate-800 bg-slate-900/30 flex flex-col">
                        
                        {/* Structural Header */}
                        {structuralRight.length > 0 && (
                            <div className="shrink-0 border-b border-indigo-900/30 flex-1 overflow-y-auto">
                                <div className="px-3 py-1.5 text-[9px] text-indigo-400 font-bold bg-indigo-900/10 uppercase tracking-wider flex justify-between sticky top-0 backdrop-blur-sm z-10">
                                    <span>Right of Group</span>
                                    <span className="opacity-50">{structuralRight.length}</span>
                                </div>
                                <div className="p-2 space-y-1">
                                    {structuralRight.map(uri => (
                                        <div key={uri}>
                                            {renderSuggestionButton(uri, () => addStructural(uri, 'right'), true)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto border-t border-slate-800/50">
                            <div className="px-3 py-1.5 text-[9px] text-slate-500 text-center font-bold bg-slate-900/50 border-b border-slate-800/50 uppercase tracking-wider sticky top-0 backdrop-blur-sm z-10 truncate" title={`Items connecting to ${tailLabel}`}>
                                Right of "{tailLabel}"
                            </div>
                             <div className="p-3 flex flex-col gap-2 items-start">
                                {rightOptions.length === 0 && <div className="text-slate-700 text-center italic text-[10px] w-full py-2">No item matches</div>}
                                {rightOptions.map((uri) => (
                                    <div key={uri} className="w-full">
                                        {renderSuggestionButton(uri, () => addToRight(uri))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>
            )}
             
            {/* DEBUG PANEL OVERLAY */}
            {debugMode && (
                <div className="absolute inset-0 bg-black/90 text-green-400 font-mono text-[10px] p-4 overflow-auto z-50">
                    <button onClick={() => setDebugMode(false)} className="absolute top-2 right-2 text-red-500 font-bold border border-red-900 px-2 py-1 rounded hover:bg-red-900/20">CLOSE</button>
                    <h3 className="font-bold text-white mb-2 underline">DIAGNOSTICS</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-slate-500 mb-1">CHAIN STATE</div>
                            <pre className="whitespace-pre-wrap">{JSON.stringify({
                                length: chain.length,
                                isComposite: !!chainIsComposite,
                                compositeUri: chainIsComposite,
                                ids: chain
                            }, null, 2)}</pre>
                        </div>
                        <div>
                            <div className="text-slate-500 mb-1">RAW NEIGHBORS (Head/Tail)</div>
                            <pre className="whitespace-pre-wrap">{JSON.stringify({
                                head: debugInfo.headNeighborsRaw,
                                tail: debugInfo.tailNeighborsRaw,
                            }, null, 2)}</pre>
                        </div>
                         <div>
                            <div className="text-slate-500 mb-1">RAW NEIGHBORS (Composite)</div>
                            <pre className="whitespace-pre-wrap">{JSON.stringify({
                                composite: debugInfo.compositeNeighborsRaw
                            }, null, 2)}</pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChainExplorer;
