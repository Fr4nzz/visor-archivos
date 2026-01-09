import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { Home, ChevronRight, RotateCcw } from 'lucide-react';
import { useInventoryStore } from '../../stores/inventoryStore';
import { useUIStore } from '../../stores/uiStore';
import { findNode, getBreadcrumbs } from '../../utils/treeUtils';
import { getColorByExtension, getColorByCategory, getDepthColor, getColorBySpecies, getColorByProject } from '../../utils/colorSchemes';
import type { TreemapColorBy } from '../../stores/uiStore';
import { formatSize, truncate } from '../../utils/formatters';
import { translations } from '../../utils/translations';
import type { FolderNode, FileNode, EntryMetadata } from '../../types/inventory';

interface D3TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size: number;
  extension?: string | null;
  children?: D3TreeNode[];
  hasChildren?: boolean;
  metadata?: EntryMetadata;
}

function folderToD3Tree(node: FolderNode | FileNode, maxDepth: number = 2, currentDepth: number = 0): D3TreeNode {
  if (node.type === 'file') {
    return {
      name: node.name,
      path: node.path,
      type: 'file',
      size: node.size,
      extension: node.extension,
      metadata: node.metadata,
    };
  }

  const folder = node as FolderNode;
  const hasChildren = folder.children.size > 0;

  if (currentDepth >= maxDepth) {
    return {
      name: folder.name,
      path: folder.path,
      type: 'folder',
      size: folder.size,
      hasChildren,
    };
  }

  const children: D3TreeNode[] = [];
  for (const [, child] of folder.children) {
    children.push(folderToD3Tree(child, maxDepth, currentDepth + 1));
  }

  return {
    name: folder.name,
    path: folder.path,
    type: 'folder',
    size: folder.size,
    hasChildren,
    children: children.length > 0 ? children : undefined,
  };
}

// Get immediate children only for expanded folders
function getImmediateChildren(node: FolderNode): D3TreeNode[] {
  const children: D3TreeNode[] = [];
  for (const [, child] of node.children) {
    if (child.type === 'file') {
      children.push({
        name: child.name,
        path: child.path,
        type: 'file',
        size: child.size,
        extension: child.extension,
        metadata: child.metadata,
      });
    } else {
      const folder = child as FolderNode;
      children.push({
        name: folder.name,
        path: folder.path,
        type: 'folder',
        size: folder.size,
        hasChildren: folder.children.size > 0,
      });
    }
  }
  return children;
}

export function TreemapView() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const { folderTree } = useInventoryStore();
  const { treemapCurrentPath, setTreemapCurrentPath, treemapColorBy, setTreemapColorBy, language } = useUIStore();
  const t = translations[language];
  const [hoveredNode, setHoveredNode] = useState<D3TreeNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // Calculate smart tooltip position to keep it within the visible area
  const getTooltipStyle = useCallback(() => {
    const offset = 10;
    const tooltipWidth = tooltipRef.current?.offsetWidth || 200;
    const tooltipHeight = tooltipRef.current?.offsetHeight || 80;

    let left = tooltipPos.x + offset;
    let top = tooltipPos.y + offset;

    // Check right edge overflow - position to left of cursor if needed
    if (left + tooltipWidth > dimensions.width) {
      left = tooltipPos.x - tooltipWidth - offset;
    }

    // Check bottom edge overflow - position above cursor if needed
    if (top + tooltipHeight > dimensions.height) {
      top = tooltipPos.y - tooltipHeight - offset;
    }

    // Ensure tooltip doesn't go beyond left edge
    if (left < 0) {
      left = offset;
    }

    // Ensure tooltip doesn't go beyond top edge
    if (top < 0) {
      top = offset;
    }

    return {
      left,
      top,
      maxWidth: '300px',
    };
  }, [tooltipPos, dimensions]);

  const currentNode = useMemo(() => {
    if (!folderTree) return null;
    if (treemapCurrentPath === '/') return folderTree;
    const node = findNode(folderTree, treemapCurrentPath);
    return node?.type === 'folder' ? node as FolderNode : folderTree;
  }, [folderTree, treemapCurrentPath]);

  const breadcrumbs = useMemo(() => getBreadcrumbs(treemapCurrentPath), [treemapCurrentPath]);

  // Toggle folder expansion
  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        // Collapse: remove this path and all children paths
        for (const p of next) {
          if (p === path || p.startsWith(path + '/')) {
            next.delete(p);
          }
        }
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Reset expansions
  const resetExpansions = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setDimensions({ width: rect.width, height: rect.height });
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Get color function
  const getColor = useCallback((d: { data: D3TreeNode; depth: number }, baseDepth: number = 0) => {
    const effectiveDepth = d.depth + baseDepth;
    if (d.data.type === 'folder') {
      return treemapColorBy === 'depth' ? getDepthColor(effectiveDepth) : '#FFC107';
    }
    switch (treemapColorBy) {
      case 'category':
        return getColorByCategory(d.data.extension ?? null);
      case 'depth':
        return getDepthColor(effectiveDepth);
      case 'species':
        return getColorBySpecies(d.data.metadata?.species);
      case 'project':
        return getColorByProject(d.data.metadata?.project);
      default:
        return getColorByExtension(d.data.extension ?? null);
    }
  }, [treemapColorBy]);

  // Render treemap with nested expansions
  useEffect(() => {
    if (!svgRef.current || !currentNode || !folderTree) return;

    const { width, height } = dimensions;
    if (width < 50 || height < 50) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Convert to D3 tree structure (shallow - just immediate children)
    const treeData = folderToD3Tree(currentNode, 1);

    // Create hierarchy
    const root = d3
      .hierarchy<D3TreeNode>(treeData)
      .sum((d) => (d.type === 'file' ? d.size : 0) || (d.children ? 0 : d.size))
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    // Create treemap layout
    const treemap = d3
      .treemap<D3TreeNode>()
      .size([width, height])
      .padding(2)
      .round(true);

    treemap(root);

    type TreemapNode = d3.HierarchyRectangularNode<D3TreeNode>;

    // Recursive function to render nodes and their expanded children
    const renderNodes = (
      parentGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
      nodes: TreemapNode[],
      baseDepth: number = 0
    ) => {
      const nodeGroups = parentGroup
        .selectAll<SVGGElement, TreemapNode>(`g.node-depth-${baseDepth}`)
        .data(nodes)
        .enter()
        .append('g')
        .attr('class', `node-depth-${baseDepth}`)
        .attr('transform', (d) => `translate(${d.x0},${d.y0})`);

      // Rectangles
      nodeGroups
        .append('rect')
        .attr('width', (d) => Math.max(0, d.x1 - d.x0))
        .attr('height', (d) => Math.max(0, d.y1 - d.y0))
        .attr('fill', (d) => {
          // If folder is expanded, use a darker/border color
          if (d.data.type === 'folder' && expandedPaths.has(d.data.path)) {
            return '#333';
          }
          return getColor(d, baseDepth);
        })
        .attr('stroke', (d) => {
          if (d.data.type === 'folder' && expandedPaths.has(d.data.path)) {
            return '#000';
          }
          return '#fff';
        })
        .attr('stroke-width', (d) => {
          if (d.data.type === 'folder' && expandedPaths.has(d.data.path)) {
            return 2;
          }
          return 1;
        })
        .attr('rx', 2)
        .style('cursor', (d) => (d.data.type === 'folder' && d.data.hasChildren ? 'pointer' : 'default'))
        .on('click', (_event, d) => {
          _event.stopPropagation();
          if (d.data.type === 'folder' && d.data.hasChildren) {
            toggleExpanded(d.data.path);
          }
        })
        .on('mouseenter', (event, d) => {
          // Don't show tooltip for expanded folders (they're containers now)
          if (d.data.type === 'folder' && expandedPaths.has(d.data.path)) return;
          setHoveredNode(d.data);
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            setTooltipPos({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            });
          }
        })
        .on('mousemove', (event, d) => {
          if (d.data.type === 'folder' && expandedPaths.has(d.data.path)) return;
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            setTooltipPos({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            });
          }
        })
        .on('mouseleave', () => {
          setHoveredNode(null);
        });

      // Labels (only for non-expanded or small enough areas)
      nodeGroups
        .append('text')
        .attr('x', 6)
        .attr('y', 20)
        .text((d) => {
          const w = d.x1 - d.x0;
          const h = d.y1 - d.y0;
          if (w < 60 || h < 25) return '';
          // For expanded folders, show name at top
          if (d.data.type === 'folder' && expandedPaths.has(d.data.path)) {
            return truncate(d.data.name, Math.floor(w / 9));
          }
          return truncate(d.data.name, Math.floor(w / 9));
        })
        .attr('fill', (d) => {
          if (d.data.type === 'folder' && expandedPaths.has(d.data.path)) {
            return '#fff';
          }
          return '#fff';
        })
        .attr('font-size', '14px')
        .attr('font-weight', '600')
        .style('pointer-events', 'none')
        .style('text-shadow', '0 1px 3px rgba(0,0,0,0.6)');

      // Size labels for non-expanded nodes
      nodeGroups
        .append('text')
        .attr('x', 6)
        .attr('y', 38)
        .text((d) => {
          const w = d.x1 - d.x0;
          const h = d.y1 - d.y0;
          if (w < 70 || h < 50) return '';
          if (d.data.type === 'folder' && expandedPaths.has(d.data.path)) return '';
          return formatSize(d.value || 0);
        })
        .attr('fill', 'rgba(255,255,255,0.9)')
        .attr('font-size', '12px')
        .style('pointer-events', 'none');

      // Render children for expanded folders
      nodeGroups.each(function(d) {
        if (d.data.type !== 'folder' || !expandedPaths.has(d.data.path)) return;

        const nodeGroup = d3.select(this);
        const nodeWidth = d.x1 - d.x0;
        const nodeHeight = d.y1 - d.y0;

        // Minimum size to render children
        if (nodeWidth < 40 || nodeHeight < 40) return;

        // Find the actual folder node in the tree
        const actualFolder = findNode(folderTree, d.data.path);
        if (!actualFolder || actualFolder.type !== 'file') {
          const folder = actualFolder as FolderNode | null;
          if (!folder) return;

          // Get children for this folder
          const childrenData = getImmediateChildren(folder);
          if (childrenData.length === 0) return;

          // Create a container node for children
          const containerData: D3TreeNode = {
            name: folder.name,
            path: folder.path,
            type: 'folder',
            size: folder.size,
            children: childrenData,
          };

          // Create child hierarchy
          const childRoot = d3
            .hierarchy<D3TreeNode>(containerData)
            .sum((c) => (c.type === 'file' ? c.size : 0) || (c.children ? 0 : c.size))
            .sort((a, b) => (b.value || 0) - (a.value || 0));

          // Padding for the label at top (larger now for bigger text)
          const labelPadding = 28;
          const innerPadding = 4;

          // Create treemap for children within this node's bounds
          const childTreemap = d3
            .treemap<D3TreeNode>()
            .size([nodeWidth - innerPadding * 2, nodeHeight - labelPadding - innerPadding])
            .padding(2)
            .round(true);

          childTreemap(childRoot);

          // Create a group for children, offset by padding
          const childGroup = nodeGroup
            .append('g')
            .attr('transform', `translate(${innerPadding},${labelPadding})`);

          // Get child nodes (skip root)
          const childNodes = childRoot.descendants().filter(c => c.depth > 0) as TreemapNode[];

          // Recursively render children
          renderNodes(childGroup as unknown as d3.Selection<SVGGElement, unknown, null, undefined>, childNodes, baseDepth + 1);
        }
      });
    };

    // Create main group
    const mainGroup = svg.append('g');

    // Get top-level nodes (skip root)
    const topNodes = root.descendants().filter(d => d.depth > 0) as TreemapNode[];

    // Render
    renderNodes(mainGroup as unknown as d3.Selection<SVGGElement, unknown, null, undefined>, topNodes, 0);

  }, [currentNode, dimensions, treemapColorBy, expandedPaths, toggleExpanded, getColor, folderTree]);

  // Auto-expand folders that occupy more than 50% of the area
  useEffect(() => {
    if (!currentNode || !folderTree) return;

    const { width, height } = dimensions;
    if (width < 50 || height < 50) return;

    const totalArea = width * height;
    const autoExpandPaths = new Set<string>();

    // Recursive function to find and expand large folders
    const findLargeFolders = (node: FolderNode, parentArea: number, currentExpandedPaths: Set<string>) => {
      // Convert to D3 tree structure
      const treeData = folderToD3Tree(node, 1);

      const root = d3
        .hierarchy<D3TreeNode>(treeData)
        .sum((d) => (d.type === 'file' ? d.size : 0) || (d.children ? 0 : d.size))
        .sort((a, b) => (b.value || 0) - (a.value || 0));

      // Create treemap layout
      const treemap = d3
        .treemap<D3TreeNode>()
        .size([Math.sqrt(parentArea), Math.sqrt(parentArea)]) // Approximate square for calculation
        .padding(2)
        .round(true);

      treemap(root);

      // Check children for large tiles
      type TreemapNodeLocal = d3.HierarchyRectangularNode<D3TreeNode>;
      const children = root.descendants().filter(d => d.depth === 1) as TreemapNodeLocal[];

      for (const child of children) {
        if (child.data.type !== 'folder' || !child.data.hasChildren) continue;

        const childArea = (child.x1 - child.x0) * (child.y1 - child.y0);
        const ratio = childArea / parentArea;

        // If folder takes more than 50% of parent area, auto-expand it
        if (ratio > 0.5) {
          currentExpandedPaths.add(child.data.path);

          // Find the actual folder and recursively check its children
          const actualFolder = findNode(folderTree, child.data.path);
          if (actualFolder && actualFolder.type === 'folder') {
            findLargeFolders(actualFolder as FolderNode, childArea, currentExpandedPaths);
          }
        }
      }
    };

    findLargeFolders(currentNode, totalArea, autoExpandPaths);

    if (autoExpandPaths.size > 0) {
      setExpandedPaths(autoExpandPaths);
    } else {
      setExpandedPaths(new Set());
    }
  }, [treemapCurrentPath, currentNode, folderTree, dimensions]);

  if (!folderTree) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        {t.noDataLoaded}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTreemapCurrentPath('/')}
            className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded"
          >
            <Home className="w-4 h-4" />
            {t.root}
          </button>
          {breadcrumbs.map((crumb) => (
            <div key={crumb.path} className="flex items-center">
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <button
                onClick={() => setTreemapCurrentPath(crumb.path)}
                className="px-2 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded"
              >
                {crumb.name}
              </button>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {expandedPaths.size > 0 && (
            <button
              onClick={resetExpansions}
              className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded"
            >
              <RotateCcw className="w-4 h-4" />
              {t.collapseAll}
            </button>
          )}

          <select
            value={treemapColorBy}
            onChange={(e) => setTreemapColorBy(e.target.value as TreemapColorBy)}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="extension">{t.colorByExtension}</option>
            <option value="category">{t.colorByCategory}</option>
            <option value="depth">{t.colorByDepth}</option>
            <option value="species">{language === 'es' ? 'Color por Especie' : 'Color by Species'}</option>
            <option value="project">{language === 'es' ? 'Color por Proyecto' : 'Color by Project'}</option>
          </select>
        </div>
      </div>

      {/* Treemap */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <svg ref={svgRef} className="w-full h-full" />

        {/* Tooltip */}
        {hoveredNode && (
          <div
            ref={tooltipRef}
            className="absolute pointer-events-none bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm z-50"
            style={getTooltipStyle()}
          >
            <div className="font-medium">{hoveredNode.name}</div>
            <div className="text-gray-300">{formatSize(hoveredNode.size)}</div>
            {hoveredNode.type === 'file' && hoveredNode.extension && (
              <div className="text-gray-400">{hoveredNode.extension}</div>
            )}
            {/* Metadata info */}
            {hoveredNode.metadata && (
              <div className="mt-1 pt-1 border-t border-gray-700 space-y-0.5">
                {hoveredNode.metadata.species && (
                  <div className="text-green-300 text-xs">
                    <span className="text-gray-400">{language === 'es' ? 'Especie:' : 'Species:'}</span> {hoveredNode.metadata.species}
                  </div>
                )}
                {hoveredNode.metadata.project && (
                  <div className="text-purple-300 text-xs">
                    <span className="text-gray-400">{language === 'es' ? 'Proyecto:' : 'Project:'}</span> {hoveredNode.metadata.project}
                  </div>
                )}
                {hoveredNode.metadata.location && (
                  <div className="text-yellow-300 text-xs">
                    <span className="text-gray-400">{language === 'es' ? 'Ubicación:' : 'Location:'}</span> {hoveredNode.metadata.location}
                  </div>
                )}
                {hoveredNode.metadata.zone && (
                  <div className="text-orange-300 text-xs">
                    <span className="text-gray-400">{language === 'es' ? 'Zona:' : 'Zone:'}</span> {hoveredNode.metadata.zone}
                  </div>
                )}
                {hoveredNode.metadata.extracted_date && (
                  <div className="text-cyan-300 text-xs">
                    <span className="text-gray-400">{language === 'es' ? 'Fecha:' : 'Date:'}</span> {hoveredNode.metadata.extracted_date}
                  </div>
                )}
                {hoveredNode.metadata.equipment && (
                  <div className="text-pink-300 text-xs">
                    <span className="text-gray-400">{language === 'es' ? 'Equipo:' : 'Equipment:'}</span> {hoveredNode.metadata.equipment}
                  </div>
                )}
              </div>
            )}
            {hoveredNode.type === 'folder' && hoveredNode.hasChildren && (
              <div className="text-blue-300 text-xs mt-1">{t.clickToExpand}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
