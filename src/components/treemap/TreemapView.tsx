import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { Home, ChevronRight, RotateCcw } from 'lucide-react';
import { useInventoryStore } from '../../stores/inventoryStore';
import { useUIStore } from '../../stores/uiStore';
import { findNode, getBreadcrumbs } from '../../utils/treeUtils';
import { getColorByExtension, getColorByCategory, getDepthColor } from '../../utils/colorSchemes';
import { formatSize, truncate } from '../../utils/formatters';
import type { FolderNode, FileNode } from '../../types/inventory';

interface D3TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size: number;
  extension?: string | null;
  children?: D3TreeNode[];
  hasChildren?: boolean;
}

function folderToD3Tree(node: FolderNode | FileNode, maxDepth: number = 2, currentDepth: number = 0): D3TreeNode {
  if (node.type === 'file') {
    return {
      name: node.name,
      path: node.path,
      type: 'file',
      size: node.size,
      extension: node.extension,
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
  const { folderTree } = useInventoryStore();
  const { treemapCurrentPath, setTreemapCurrentPath, treemapColorBy, setTreemapColorBy } = useUIStore();
  const [hoveredNode, setHoveredNode] = useState<D3TreeNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

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
        .attr('x', 4)
        .attr('y', 14)
        .text((d) => {
          const w = d.x1 - d.x0;
          const h = d.y1 - d.y0;
          if (w < 50 || h < 20) return '';
          // For expanded folders, show name at top
          if (d.data.type === 'folder' && expandedPaths.has(d.data.path)) {
            return truncate(d.data.name, Math.floor(w / 7));
          }
          return truncate(d.data.name, Math.floor(w / 7));
        })
        .attr('fill', (d) => {
          if (d.data.type === 'folder' && expandedPaths.has(d.data.path)) {
            return '#fff';
          }
          return '#fff';
        })
        .attr('font-size', '11px')
        .attr('font-weight', '500')
        .style('pointer-events', 'none')
        .style('text-shadow', '0 1px 2px rgba(0,0,0,0.5)');

      // Size labels for non-expanded nodes
      nodeGroups
        .append('text')
        .attr('x', 4)
        .attr('y', 28)
        .text((d) => {
          const w = d.x1 - d.x0;
          const h = d.y1 - d.y0;
          if (w < 60 || h < 35) return '';
          if (d.data.type === 'folder' && expandedPaths.has(d.data.path)) return '';
          return formatSize(d.value || 0);
        })
        .attr('fill', 'rgba(255,255,255,0.8)')
        .attr('font-size', '10px')
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

          // Padding for the label at top
          const labelPadding = 20;
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

  // Reset expansions when path changes
  useEffect(() => {
    setExpandedPaths(new Set());
  }, [treemapCurrentPath]);

  if (!folderTree) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No data loaded
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
            Root
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
              Collapse All
            </button>
          )}

          <select
            value={treemapColorBy}
            onChange={(e) => setTreemapColorBy(e.target.value as 'extension' | 'category' | 'depth')}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="extension">Color by Extension</option>
            <option value="category">Color by Category</option>
            <option value="depth">Color by Depth</option>
          </select>
        </div>
      </div>

      {/* Treemap */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <svg ref={svgRef} className="w-full h-full" />

        {/* Tooltip */}
        {hoveredNode && (
          <div
            className="absolute pointer-events-none bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm z-50"
            style={{
              left: tooltipPos.x + 10,
              top: tooltipPos.y + 10,
              maxWidth: '300px',
            }}
          >
            <div className="font-medium">{hoveredNode.name}</div>
            <div className="text-gray-300">{formatSize(hoveredNode.size)}</div>
            {hoveredNode.type === 'file' && hoveredNode.extension && (
              <div className="text-gray-400">{hoveredNode.extension}</div>
            )}
            {hoveredNode.type === 'folder' && hoveredNode.hasChildren && (
              <div className="text-blue-300 text-xs mt-1">Click to expand</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
