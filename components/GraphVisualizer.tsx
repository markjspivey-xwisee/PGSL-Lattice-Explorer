import * as React from 'react';
import * as d3 from 'd3';
import { PGSLEngine } from '../services/cahEngine';
import { Node, NodeType, FragmentNode } from '../types';

const { useEffect, useRef, useState } = React;

interface GraphVisualizerProps {
  engine: PGSLEngine;
  onNodeSelect: (id: string) => void;
  selectedNodeId: string | null;
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  data: Node;
  heightLevel: number; 
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
  isLattice: boolean;
}

const GraphVisualizer: React.FC<GraphVisualizerProps> = ({ engine, onNodeSelect, selectedNodeId }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);

  useEffect(() => {
    const sync = () => setNodes(engine.getAllNodes());
    const unsub = engine.subscribe(sync);
    sync();
    return unsub;
  }, [engine]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || nodes.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const simNodes: SimNode[] = nodes.map(n => ({
      id: n["@id"],
      data: n,
      heightLevel: (n as any)["pgsl:height"], 
      y: height - ((n as any)["pgsl:height"] * 100) - 50 
    }));

    const simLinks: SimLink[] = [];
    nodes.forEach(n => {
      const isFragment = (n["@type"] as string[]).includes(NodeType.FRAGMENT);
      const constituents = isFragment ? (n as any)["pgsl:constituents"] : null;
      const content = isFragment ? (n as any)["pgsl:content"] : [];

      if (constituents) {
        // Only create links if the target nodes actually exist in our visualization
        // (In a real federated graph, they might be off-screen, but D3 needs them)
        if (nodes.find(node => node["@id"] === constituents[0]))
            simLinks.push({ source: constituents[0], target: n["@id"], isLattice: true });
        if (nodes.find(node => node["@id"] === constituents[1]))
            simLinks.push({ source: constituents[1], target: n["@id"], isLattice: true });
      } 
      else if (isFragment && content.length > 0) {
          // Base Wrapper Link
          if (nodes.find(node => node["@id"] === content[0]))
            simLinks.push({ source: content[0], target: n["@id"], isLattice: false });
      }
    });

    // Clear previous elements
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height]);

    // Define Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Create a container group for zoomable content
    const g = svg.append("g");

    // Arrow marker
    svg.append("defs").append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("fill", "#64748b")
      .attr("d", "M0,-5L10,0L0,5");

    const simulation = d3.forceSimulation(simNodes)
      .force("link", d3.forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(60))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("collide", d3.forceCollide().radius(30))
      .force("y", d3.forceY<SimNode>().y(d => height - (d.heightLevel * 100) - 50).strength(2))
      .force("x", d3.forceX(width / 2).strength(0.05));

    const link = g.append("g")
      .selectAll("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", d => d.isLattice ? "#f59e0b" : "#10b981") 
      .attr("stroke-width", d => d.isLattice ? 2 : 1)
      .attr("stroke-dasharray", d => d.isLattice ? "0" : "4 2")
      .attr("opacity", 0.6)
      .attr("marker-end", "url(#arrow)");

    const nodeGroup = g.append("g")
      .selectAll("g")
      .data(simNodes)
      .join("g")
      .call(d3.drag<SVGGElement, SimNode>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    // Circles
    nodeGroup.append("circle")
      .attr("r", d => (d.data["@type"] as string[]).includes(NodeType.ATOM) ? 12 : 24)
      .attr("fill", d => {
        if (d.id === selectedNodeId) return "#ec4899"; // Pink selected
        if ((d.data["@type"] as string[]).includes(NodeType.ATOM)) return "#3b82f6"; // Blue Atom
        return "#f59e0b"; // Amber Fragment
      })
      .attr("stroke", d => {
          const isWrapper = (d.data["@type"] as string[]).includes(NodeType.FRAGMENT) && !(d.data as any)["pgsl:constituents"];
          return isWrapper ? "#10b981" : "#fff";
      })
      .attr("stroke-width", 2)
      .attr("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        onNodeSelect(d.id);
      });

    // Labels
    nodeGroup.append("text")
      .text(d => {
         if ((d.data["@type"] as string[]).includes(NodeType.ATOM)) return (d.data as any)["rdf:value"];
         const n = d.data as any;
         if (!n["pgsl:constituents"]) return "Wrap";
         return `L${n["pgsl:level"]}`;
      })
      .attr("dy", 4)
      .attr("text-anchor", "middle")
      .attr("fill", "white")
      .attr("font-size", d => (d.data["@type"] as string[]).includes(NodeType.ATOM) ? "10px" : "10px")
      .attr("font-weight", "bold")
      .attr("pointer-events", "none");

    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as SimNode).x!)
        .attr("y1", d => (d.source as SimNode).y!)
        .attr("x2", d => (d.target as SimNode).x!)
        .attr("y2", d => (d.target as SimNode).y!);

      nodeGroup
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [nodes, selectedNodeId]);

  return (
    <div ref={containerRef} className="w-full h-full bg-slate-900 rounded-lg overflow-hidden relative shadow-inner">
        <div className="absolute bottom-4 left-4 text-xs text-slate-400 pointer-events-none z-10 bg-slate-900/80 p-2 rounded border border-slate-800">
            <div className="font-bold mb-1 text-slate-200">Semantic Graph</div>
            <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> pgsl:Atom</div>
            <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full border-2 border-emerald-500 bg-amber-500"></span> Identity Wrapper</div>
            <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> pgsl:Fragment</div>
        </div>
      <svg ref={svgRef} className="w-full h-full cursor-move"></svg>
    </div>
  );
};

export default GraphVisualizer;