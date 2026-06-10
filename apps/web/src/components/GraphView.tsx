import * as d3Force from "d3-force";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { 
  Network, 
  RefreshCw, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Lightbulb, 
  AlertTriangle, 
  X, 
  ChevronRight,
  Sparkles,
  Eye
} from "lucide-react";
import { 
  findSurprisingConnections, 
  detectKnowledgeGaps 
} from "../lib/graph-insights";
import type { 
  GraphNode, 
  GraphEdge, 
  CommunityInfo
} from "../lib/graph-insights";

// Node colors
const NODE_TYPE_COLORS: Record<string, string> = {
  entity: "#06b6d4",    // Cyan
  concept: "#a855f7",   // Purple
  source: "#f97316",    // Orange
  overview: "#eab308",  // Yellow
  note: "#10b981",      // Green / Lagoon-like
  other: "#6b7280",     // Gray
};

const COMMUNITY_COLORS = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f97316", // Orange
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#f43f5e", // Rose
  "#06b6d4", // Cyan
  "#eab308", // Yellow
  "#14b8a6", // Teal
  "#a855f7", // Purple
];

interface D3Node extends d3Force.SimulationNodeDatum {
  id: string;
  title: string;
  path: string;
  type: string;
  is_ai_generated: boolean;
  qualityScore?: number | null;
  linkCount: number;
  community: number;
}

interface D3Link extends d3Force.SimulationLinkDatum<D3Node> {
  source: string | D3Node;
  target: string | D3Node;
  label?: string;
  weight?: number;
}

interface GraphViewProps {
  rawNodes: Array<{
    id: string;
    title: string;
    path: string;
    type: string;
    is_ai_generated: boolean;
    qualityScore?: number | null;
  }>;
  rawEdges: Array<{
    source: string;
    target: string;
    label?: string;
  }>;
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
}

export function GraphView({ rawNodes, rawEdges, selectedNoteId, onSelectNote }: GraphViewProps) {
  const [colorMode, setColorMode] = useState<"type" | "community">("type");
  const [showInsights, setShowInsights] = useState(false);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: D3Node } | null>(null);
  
  // Pan & Zoom state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Calculate Node Size/Radius based on connections
  const getNodeRadius = useCallback((linkCount: number) => {
    return 6 + Math.min(18, Math.sqrt(linkCount) * 4);
  }, []);

  const getNodeColor = useCallback((node: D3Node) => {
    if (colorMode === "community") {
      return COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length];
    }
    return NODE_TYPE_COLORS[node.type.toLowerCase()] || NODE_TYPE_COLORS.other;
  }, [colorMode]);

  // Compute folder communities
  const { nodes, edges, communities } = useMemo(() => {
    // 1. Map folder paths to communities
    const getFolderCommunity = (path: string): string => {
      const parts = path.split("/");
      if (parts.length >= 2) {
        return parts[parts.length - 2];
      }
      return "other";
    };

    const uniqueFolders = Array.from(new Set(rawNodes.map(n => getFolderCommunity(n.path))));
    const folderToIndex = new Map(uniqueFolders.map((f, i) => [f, i]));

    // Compute node inbound/outbound links count
    const linkCounts = new Map<string, number>();
    for (const n of rawNodes) linkCounts.set(n.id, 0);
    for (const e of rawEdges) {
      linkCounts.set(e.source, (linkCounts.get(e.source) ?? 0) + 1);
      linkCounts.set(e.target, (linkCounts.get(e.target) ?? 0) + 1);
    }

    const processedNodes: GraphNode[] = rawNodes.map(n => {
      const folder = getFolderCommunity(n.path);
      const communityIdx = folderToIndex.get(folder) ?? 0;
      return {
        ...n,
        linkCount: linkCounts.get(n.id) ?? 0,
        community: communityIdx,
      };
    });

    const processedEdges: GraphEdge[] = rawEdges.map(e => ({
      source: e.source,
      target: e.target,
      label: e.label,
      weight: 1,
    }));

    // Compute Community Info
    const comms: CommunityInfo[] = uniqueFolders.map((_folder, idx) => {
      const commNodes = processedNodes.filter(n => n.community === idx);
      const commNodeIds = new Set(commNodes.map(n => n.id));
      const n = commNodes.length;

      let intraEdges = 0;
      for (const edge of processedEdges) {
        if (commNodeIds.has(edge.source) && commNodeIds.has(edge.target)) {
          intraEdges++;
        }
      }

      const possibleEdges = n > 1 ? (n * (n - 1)) / 2 : 1;
      const cohesion = intraEdges / possibleEdges;
      const topNodes = [...commNodes]
        .sort((a, b) => b.linkCount - a.linkCount)
        .slice(0, 3)
        .map(n => n.title);

      return {
        id: idx,
        nodeCount: n,
        cohesion,
        topNodes,
      };
    });

    return {
      nodes: processedNodes,
      edges: processedEdges,
      communities: comms,
    };
  }, [rawNodes, rawEdges]);

  // Compute insights client-side
  const surprisingConns = useMemo(() => findSurprisingConnections(nodes, edges), [nodes, edges]);
  const knowledgeGaps = useMemo(() => detectKnowledgeGaps(nodes, edges, communities), [nodes, edges, communities]);

  // D3 force simulation layout
  const [simulationNodes, setSimulationNodes] = useState<D3Node[]>([]);
  const [simulationLinks, setSimulationLinks] = useState<D3Link[]>([]);
  const [simKey, setSimKey] = useState(0);

  useEffect(() => {
    if (nodes.length === 0) return;
    const _forceTrigger = simKey; // Reference simKey to trigger simulation refresh

    // Create fresh node copies for D3 datum safety
    const d3Nodes: D3Node[] = nodes.map(n => ({
      ...n,
      x: (Math.random() - 0.5) * 500,
      y: (Math.random() - 0.5) * 500,
    }));

    const d3Links: D3Link[] = edges.map(e => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
    }));

    // Build the force directed simulation
    const simulation = d3Force.forceSimulation<D3Node>(d3Nodes)
      .force("link", d3Force.forceLink<D3Node, D3Link>(d3Links)
        .id(d => d.id)
        .distance(80)
      )
      .force("charge", d3Force.forceManyBody().strength(-200))
      .force("center", d3Force.forceCenter(0, 0))
      .force("collision", d3Force.forceCollide<D3Node>().radius(d => getNodeRadius(d.linkCount) + 12));

    // Run layout simulation synchronously to settle layout quickly
    for (let i = 0; i < 200; i++) {
      simulation.tick();
    }

    setSimulationNodes(d3Nodes);
    setSimulationLinks(d3Links);
    simulation.stop();
  }, [nodes, edges, simKey, getNodeRadius]);

  // Automatically center selection when note selection changes
  useEffect(() => {
    if (selectedNoteId && simulationNodes.length > 0) {
      const activeNode = simulationNodes.find(n => n.id === selectedNoteId);
      if (activeNode && activeNode.x !== undefined && activeNode.y !== undefined) {
        setPan({
          x: 400 / 2 - activeNode.x * zoom,
          y: 400 / 2 - activeNode.y * zoom,
        });
      }
    }
  }, [selectedNoteId, simulationNodes, zoom]);



  // Mouse Drag Panning handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only
    isDragging.current = true;
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current) {
      setPan({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      });
    }
  };

  const handleMouseUpOrLeave = () => {
    isDragging.current = false;
  };

  // Scroll Zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    setZoom(Math.max(0.15, Math.min(4, nextZoom)));
  };

  const handleZoomIn = () => setZoom(z => Math.min(4, z * 1.2));
  const handleZoomOut = () => setZoom(z => Math.max(0.15, z / 1.2));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setHighlightedNodes(new Set());
  };

  const handleNodeHover = (e: React.MouseEvent, node: D3Node) => {
    setHoveredNodeId(node.id);
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    setTooltip({
      x: e.clientX - rect.left + 12,
      y: e.clientY - rect.top - 12,
      node,
    });
  };

  const handleNodeLeave = () => {
    setHoveredNodeId(null);
    setTooltip(null);
  };

  // Determine if a node should be dimmed (when hoveredNodeId or highlightedNodes are active)
  const isNodeDimmed = (nodeId: string) => {
    const hasHighlight = highlightedNodes.size > 0;
    const hasHover = hoveredNodeId !== null;

    if (hasHighlight && !highlightedNodes.has(nodeId)) return true;

    if (hasHover && hoveredNodeId !== nodeId) {
      // Check if they are connected
      const isConnected = simulationLinks.some(l => {
        const sId = typeof l.source === "string" ? l.source : l.source.id;
        const tId = typeof l.target === "string" ? l.target : l.target.id;
        return (sId === hoveredNodeId && tId === nodeId) || (tId === hoveredNodeId && sId === nodeId);
      });
      if (!isConnected) return true;
    }

    return false;
  };

  // Determine if a link should be highlighted
  const isLinkActive = (link: D3Link) => {
    const sId = typeof link.source === "string" ? link.source : link.source.id;
    const tId = typeof link.target === "string" ? link.target : link.target.id;

    if (hoveredNodeId) {
      return sId === hoveredNodeId || tId === hoveredNodeId;
    }
    if (highlightedNodes.size > 0) {
      return highlightedNodes.has(sId) && highlightedNodes.has(tId);
    }
    return false;
  };

  // Legend Counters
  const legendCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const node of nodes) {
      const key = colorMode === "community" ? `community-${node.community}` : node.type.toLowerCase();
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [nodes, colorMode]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface rounded-2xl border border-line overflow-hidden relative shadow-inner">
      {/* Top Controls Toolbar */}
      <header className="px-4 py-3 shrink-0 flex justify-between items-center border-b border-line bg-surface-strong/60 backdrop-blur-md z-15">
        <div className="flex items-center gap-2">
          <Network className="text-lagoon" size={18} />
          <div>
            <h3 className="text-sm font-bold text-sea-ink">Knowledge Graph</h3>
            <p className="text-[10px] text-sea-ink-soft">
              {nodes.length} pages • {edges.length} links
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle Type / Community */}
          <div className="flex bg-foam border border-line rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setColorMode("type")}
              className={`px-2.5 py-1 rounded-md transition-all font-bold cursor-pointer ${
                colorMode === "type" 
                  ? "bg-surface text-sea-ink shadow-sm" 
                  : "text-sea-ink-soft hover:text-sea-ink"
              }`}
            >
              Type
            </button>
            <button
              type="button"
              onClick={() => setColorMode("community")}
              className={`px-2.5 py-1 rounded-md transition-all font-bold cursor-pointer ${
                colorMode === "community" 
                  ? "bg-surface text-sea-ink shadow-sm" 
                  : "text-sea-ink-soft hover:text-sea-ink"
              }`}
            >
              Cluster
            </button>
          </div>

          {/* Insights Toggle */}
          <button
            type="button"
            onClick={() => setShowInsights(!showInsights)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
              showInsights
                ? "bg-lagoon/15 border-lagoon text-lagoon-deep"
                : "bg-foam border-line text-sea-ink-soft hover:text-sea-ink"
            }`}
          >
            <Lightbulb size={14} />
            Insights
          </button>

          {/* Refresh Layout */}
          <button
            type="button"
            onClick={() => setSimKey(k => k + 1)}
            className="p-1.5 rounded-lg bg-foam border border-line text-sea-ink-soft hover:text-sea-ink transition-colors cursor-pointer"
            title="Refresh layout positions"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      {/* Main split canvas / insights drawer */}
      <div className="flex-1 flex min-h-0 relative">
        {/* SVG Canvas Area */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: SVG pan/zoom container */}
        <div 
          className="flex-1 h-full cursor-grab active:cursor-grabbing relative select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          onWheel={handleWheel}
        >
          <svg
            ref={svgRef}
            className="w-full h-full"
            style={{ backgroundColor: "transparent" }}
          >
            <title>Knowledge Graph Canvas</title>
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              <g className="edges-group">
                {simulationLinks.map((link) => {
                  const s = link.source as D3Node;
                  const t = link.target as D3Node;
                  if (!s || !t || s.x === undefined || t.x === undefined) return null;
                  const isActive = isLinkActive(link);
                  const isDimmed = isNodeDimmed(s.id) || isNodeDimmed(t.id);
                  
                  return (
                    <line
                      key={`link-${s.id}-${t.id}`}
                      x1={s.x}
                      y1={s.y}
                      x2={t.x}
                      y2={t.y}
                      stroke={isActive ? "var(--lagoon)" : "var(--line)"}
                      strokeWidth={isActive ? 2 : 1}
                      strokeOpacity={isDimmed && !isActive ? 0.08 : 0.35}
                      transition-all="true"
                    />
                  );
                })}
              </g>

              {/* Nodes */}
              <g className="nodes-group">
                {simulationNodes.map(node => {
                  if (node.x === undefined || node.y === undefined) return null;
                  const isSelected = node.id === selectedNoteId;
                  const isDimmed = isNodeDimmed(node.id);
                  const color = getNodeColor(node);
                  const radius = getNodeRadius(node.linkCount);

                  return (
                    // biome-ignore lint/a11y/useSemanticElements: SVG groups must use role button inside SVG
                    <g
                      key={node.id}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectNote(node.id);
                        }
                      }}
                      transform={`translate(${node.x}, ${node.y})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectNote(node.id);
                      }}
                      onMouseEnter={(e) => handleNodeHover(e, node)}
                      onMouseMove={(e) => handleNodeHover(e, node)}
                      onMouseLeave={handleNodeLeave}
                      className="cursor-pointer group outline-none"
                    >
                      {/* Selection Ring */}
                      {isSelected && (
                        <circle
                          r={radius + 5}
                          fill="none"
                          stroke="var(--lagoon)"
                          strokeWidth={2}
                          strokeDasharray="4,2"
                          className="animate-spin"
                          style={{ transformOrigin: "0 0", animationDuration: "12s" }}
                        />
                      )}
                      
                      {/* Node Circle */}
                      <circle
                        r={radius}
                        fill={color}
                        stroke={isSelected ? "var(--surface)" : "transparent"}
                        strokeWidth={2}
                        opacity={isDimmed ? 0.15 : 1}
                        className="transition-all duration-200 group-hover:scale-110 shadow-sm"
                      />

                      {/* Text label */}
                      <text
                        dy=".35em"
                        x={radius + 6}
                        fill="var(--sea-ink)"
                        fontSize={isSelected ? "11px" : "9px"}
                        fontWeight={isSelected ? "bold" : "normal"}
                        opacity={isDimmed ? 0.08 : isSelected || node.linkCount > 4 || hoveredNodeId === node.id ? 0.9 : 0.4}
                        className="pointer-events-none select-none font-sans"
                      >
                        {node.title}
                      </text>
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>

          {/* Floating Zoom & Reset controls */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 z-10">
            <button
              type="button"
              onClick={handleZoomIn}
              className="h-8 w-8 rounded-lg bg-surface-strong/80 backdrop-blur-sm border border-line text-sea-ink hover:text-lagoon flex items-center justify-center shadow-sm cursor-pointer"
            >
              <ZoomIn size={16} />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="h-8 w-8 rounded-lg bg-surface-strong/80 backdrop-blur-sm border border-line text-sea-ink hover:text-lagoon flex items-center justify-center shadow-sm cursor-pointer"
            >
              <ZoomOut size={16} />
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="h-8 w-8 rounded-lg bg-surface-strong/80 backdrop-blur-sm border border-line text-sea-ink hover:text-lagoon flex items-center justify-center shadow-sm cursor-pointer"
              title="Reset Zoom & Selection"
            >
              <Maximize size={15} />
            </button>
          </div>

          {/* Node Legend (Bottom-Left overlay) */}
          <div className="absolute bottom-4 left-4 bg-surface-strong/90 backdrop-blur-md border border-line rounded-xl p-3 shadow-md text-[10px] space-y-1.5 z-10 select-none">
            <span className="font-bold text-sea-ink block border-b border-line pb-1 mb-1.5 uppercase tracking-wider">
              {colorMode === "type" ? "Node Types" : "Folder Clusters"}
            </span>
            {colorMode === "type" ? (
              Object.entries(NODE_TYPE_COLORS).map(([type, color]) => {
                const count = legendCounts[type] ?? 0;
                if (count === 0 && type !== "other") return null;
                return (
                  <div key={type} className="flex items-center justify-between gap-6 text-sea-ink-soft">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="capitalize">{type}</span>
                    </div>
                    <span className="font-bold">{count}</span>
                  </div>
                );
              })
            ) : (
              communities.map((comm, idx) => {
                const color = COMMUNITY_COLORS[idx % COMMUNITY_COLORS.length];
                const count = legendCounts[`community-${idx}`] ?? 0;
                if (count === 0) return null;
                return (
                  <div key={`community-${comm.id}`} className="flex items-center justify-between gap-6 text-sea-ink-soft">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span>Cluster {idx + 1}</span>
                    </div>
                    <span className="font-bold">{count}</span>
                  </div>
                );
              })
            )}
          </div>

          {/* Tooltip Overlay */}
          {tooltip && (
            <div
              className="absolute pointer-events-none bg-surface-strong/95 backdrop-blur-md border border-line rounded-lg p-2.5 shadow-xl text-[11px] space-y-1 z-30 font-sans"
              style={{ left: tooltip.x, top: tooltip.y }}
            >
              <div className="font-bold text-sea-ink truncate max-w-[180px]">
                {tooltip.node.title}
              </div>
              <div className="text-[10px] text-sea-ink-soft flex items-center gap-2">
                <span className="capitalize font-mono bg-foam px-1.5 py-0.5 rounded border border-line">
                  {tooltip.node.type}
                </span>
                <span>{tooltip.node.linkCount} connections</span>
              </div>
              {tooltip.node.qualityScore !== undefined && tooltip.node.qualityScore !== null && (
                <div className="text-[10px] font-bold flex items-center gap-1 mt-1">
                  <span className="text-sea-ink-soft">Score:</span>
                  <span className={tooltip.node.qualityScore >= 0.75 ? "text-green-600" : tooltip.node.qualityScore >= 0.5 ? "text-amber-600" : "text-red-500"}>
                    {(tooltip.node.qualityScore * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Insights Drawer (Right overlay) */}
        {showInsights && (
          <div className="w-[300px] border-l border-line bg-surface-strong/90 backdrop-blur-md flex flex-col min-h-0 z-10 shrink-0 rise-in relative">
            <header className="px-4 py-3 border-b border-line flex justify-between items-center shrink-0">
              <span className="text-xs font-bold text-sea-ink uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} className="text-lagoon" /> Graph Insights
              </span>
              <button
                type="button"
                onClick={() => setShowInsights(false)}
                className="p-1 rounded hover:bg-foam text-sea-ink-soft hover:text-sea-ink cursor-pointer"
              >
                <X size={14} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Section: Knowledge Gaps */}
              <div>
                <h4 className="text-[10px] font-bold text-sea-ink-soft uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <AlertTriangle size={12} className="text-amber-500" /> Structural Gaps
                </h4>
                {knowledgeGaps.length === 0 ? (
                  <p className="text-[11px] italic text-sea-ink-soft">No gaps identified.</p>
                ) : (
                  <div className="space-y-2.5">
                    {knowledgeGaps.map((gap) => (
                      <div 
                        key={`gap-${gap.title}`} 
                        className="bg-surface border border-line rounded-lg p-2.5 transition-all hover:border-lagoon/40"
                      >
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <span className="font-bold text-xs text-sea-ink leading-snug">
                            {gap.title}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              // Highlight involved nodes
                              setHighlightedNodes(new Set(gap.nodeIds));
                            }}
                            className="p-0.5 rounded hover:bg-foam text-sea-ink-soft"
                            title="Show nodes in graph"
                          >
                            <Eye size={12} />
                          </button>
                        </div>
                        <p className="text-[10px] text-sea-ink-soft mb-1.5 leading-relaxed">
                          {gap.description}
                        </p>
                        <div className="text-[9px] bg-foam text-sea-ink-soft p-1.5 rounded leading-relaxed border border-line">
                          <span className="font-bold text-sea-ink">Fix:</span> {gap.suggestion}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section: Surprising Connections */}
              <div>
                <h4 className="text-[10px] font-bold text-sea-ink-soft uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-lagoon" /> Surprising Links
                </h4>
                {surprisingConns.length === 0 ? (
                  <p className="text-[11px] italic text-sea-ink-soft">No surprising links found.</p>
                ) : (
                  <div className="space-y-2.5">
                    {surprisingConns.map((conn) => (
                      <div 
                        key={conn.key} 
                        className="bg-surface border border-line rounded-lg p-2.5 transition-all hover:border-lagoon/40"
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-sea-ink mb-1">
                          <span>{conn.source.title}</span>
                          <ChevronRight size={10} className="text-sea-ink-soft" />
                          <span>{conn.target.title}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setHighlightedNodes(new Set([conn.source.id, conn.target.id]));
                            }}
                            className="p-0.5 rounded hover:bg-foam text-sea-ink-soft ml-1.5"
                            title="Highlight in graph"
                          >
                            <Eye size={12} />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {conn.reasons.map(r => (
                            <span 
                              key={r} 
                              className="text-[9px] bg-lagoon/10 border border-lagoon/15 text-lagoon-deep px-1.5 py-0.5 rounded-md"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
