
import * as React from 'react';
import { PGSLEngine } from '../services/cahEngine';
import { Node, NodeType } from '../types';

const { useEffect, useState } = React;

interface InspectorProps {
  engine: PGSLEngine;
  nodeId: string | null;
}

const Inspector: React.FC<InspectorProps> = ({ engine, nodeId }) => {
  const [node, setNode] = useState<Node | null>(null);
  const [contentValues, setContentValues] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'visual' | 'jsonld'>('visual');

  useEffect(() => {
    // Recursive helper to resolve content
    const resolveDeepContent = (id: string): string => {
        const n = engine.getNode(id);
        if (!n) return `REF<${id.split('/').pop()}>`; // Handle external or missing gracefully
        
        if ((n["@type"] as string[]).includes(NodeType.ATOM)) {
            return String((n as any)["rdf:value"]);
        }
        
        // It's a fragment. Recurse into its content.
        const contentIds = (n as any)["pgsl:content"] || [];
        const inner = contentIds.map((c: string) => resolveDeepContent(c)).join(', ');
        
        return contentIds.length > 1 ? `(${inner})` : inner;
    };

    const updateInspector = () => {
        if (nodeId) {
            const n = engine.getNode(nodeId);
            setNode(n || null);
            if (n && (n["@type"] as string[]).includes(NodeType.FRAGMENT)) {
                const values = (n as any)["pgsl:content"].map((id: string) => resolveDeepContent(id));
                setContentValues(values);
            }
        } else {
            setNode(null);
            setContentValues([]);
        }
    };

    updateInspector();
    
    const unsub = engine.subscribe(updateInspector);
    return unsub;
  }, [engine, nodeId]);

  const handleDelete = () => {
      if (nodeId && window.confirm("Are you sure you want to delete this node?")) {
          engine.deleteNode(nodeId);
          // Selection clearing happens automatically via engine update if the node is gone,
          // but we can force it null in parent if needed. For now, this component just reflects state.
      }
  };

  if (!node) {
    return (
      <div className="p-6 text-slate-500 text-center text-sm italic">
        Select a resource to inspect RDF data.
      </div>
    );
  }

  const isAtom = (node["@type"] as string[]).includes(NodeType.ATOM);
  const constituents = !isAtom ? (node as any)["pgsl:constituents"] : null;

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-700 pb-4 relative">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          {isAtom ? (
            <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded font-mono">pgsl:Atom</span>
          ) : (
             <span className="bg-amber-600 text-white text-xs px-2 py-1 rounded font-mono">pgsl:Fragment</span>
          )}
           <span className="bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded">H:{(node as any)["pgsl:height"]}</span>
        </h2>
        <div className="text-[10px] font-mono text-emerald-400 mt-2 break-all select-all hover:text-emerald-300 cursor-pointer" title="Resource URI">
            <a href={node["@id"]} onClick={e => e.preventDefault()} className="hover:underline">{node["@id"]}</a>
        </div>
        
        <button 
            onClick={handleDelete}
            className="absolute top-6 right-6 text-slate-600 hover:text-red-500 transition-colors"
            title="Delete Node"
        >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
        </button>
      </div>

      <div className="flex border-b border-slate-800 bg-slate-900">
          <button 
            onClick={() => setActiveTab('visual')}
            className={`flex-1 py-2 text-xs font-bold ${activeTab === 'visual' ? 'text-white border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Visual
          </button>
          <button 
            onClick={() => setActiveTab('jsonld')}
            className={`flex-1 py-2 text-xs font-bold ${activeTab === 'jsonld' ? 'text-white border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-300'}`}
          >
            JSON-LD
          </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {activeTab === 'visual' && (
            <>
                {/* PROV-O Info */}
                <div className="bg-slate-800/50 rounded p-3 border border-slate-800 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-500 uppercase font-bold">prov:wasAttributedTo</span>
                        <span className="text-[10px] font-mono text-purple-400 truncate max-w-[150px]" title={node["prov:wasAttributedTo"]}>{node["prov:wasAttributedTo"]}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-500 uppercase font-bold">prov:generatedAtTime</span>
                        <span className="text-[10px] font-mono text-slate-400">{new Date(node["prov:generatedAtTime"]).toLocaleTimeString()}</span>
                    </div>
                </div>

                {/* Value / Content */}
                <div className="bg-slate-800 rounded p-4 border border-slate-700">
                <label className="block text-xs uppercase font-bold text-slate-400 mb-2">
                    {isAtom ? 'rdf:value' : `pgsl:content (L=${(node as any)["pgsl:level"]})`}
                </label>
                <div className="text-white text-lg font-mono">
                    {isAtom ? (
                    <span className="text-blue-300">{(node as any)["rdf:value"]}</span>
                    ) : (
                    <div className="flex flex-wrap gap-1">
                        {contentValues.map((v, i) => (
                        <span key={i} className="bg-slate-900 px-2 py-1 rounded text-sm text-emerald-300 border border-slate-700 whitespace-pre">
                            {v}
                        </span>
                        ))}
                    </div>
                    )}
                </div>
                </div>

                {/* Constituents */}
                {constituents && (
                <div className="bg-slate-800 rounded p-4 border border-slate-700">
                    <label className="block text-xs uppercase font-bold text-slate-400 mb-3">pgsl:constituents (Overlap)</label>
                    <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <div className="text-[10px] text-slate-500">Left (N-1)</div>
                        <a href={constituents[0]} onClick={e => e.preventDefault()} className="block bg-slate-900 p-2 rounded text-[10px] text-amber-300 font-mono border border-slate-700 truncate hover:border-amber-500 transition-colors" title={constituents[0]}>
                            {constituents[0]}
                        </a>
                    </div>
                    <div className="space-y-1">
                        <div className="text-[10px] text-slate-500">Right (N-1)</div>
                        <a href={constituents[1]} onClick={e => e.preventDefault()} className="block bg-slate-900 p-2 rounded text-[10px] text-amber-300 font-mono border border-slate-700 truncate hover:border-amber-500 transition-colors" title={constituents[1]}>
                            {constituents[1]}
                        </a>
                    </div>
                    </div>
                </div>
                )}
            </>
        )}

        {activeTab === 'jsonld' && (
            <pre className="bg-slate-950 p-4 rounded border border-slate-800 text-[10px] text-emerald-400 font-mono whitespace-pre-wrap overflow-x-hidden">
                {JSON.stringify(node, null, 2)}
            </pre>
        )}

      </div>
    </div>
  );
};

export default Inspector;
