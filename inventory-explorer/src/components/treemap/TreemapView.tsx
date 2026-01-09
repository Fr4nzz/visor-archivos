import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Home, ChevronRight, ZoomOut } from 'lucide-react';
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
}

function folderToD3Tree(node: FolderNode | FileNode, maxDepth: number = 3, currentDepth: number = 0): D3TreeNode {
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

  if (currentDepth >= maxDepth) {
    return {
      name: folder.name,
      path: folder.path,
      type: 'folder',
      size: folder.size,
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
    children: children.length > 0 ? children : undefined,
  };
}

export function TreemapView() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { folderTree } = useInventoryStore();
  const { treemapCurrentPath, setTreemapCurrentPath, treemapColorBy, setTreemapColorBy } = useUIStore();
  const [hoveredNode, setHoveredNode] = useState<D3TreeNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const currentNode = useMemo(() => {
    if (!folderTree) return null;
    if (treemapCurrentPath === '/') return folderTree;
    const node = findNode(folderTree, treemapCurrentPath);
    return node?.type === 'folder' ? node as FolderNode : folderTree;
  }, [folderTree, treemapCurrentPath]);

  const breadcrumbs = useMemo(() => getBreadcrumbs(treemapCurrentPath), [treemapCurrentPath]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;

    // Get initial dimensions immediately
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

  // Render treemap
  useEffect(() => {
    if (!svgRef.current || !currentNode) return;

    const { width, height } = dimensions;

    // Don't render if dimensions are too small
    if (width < 50 || height < 50) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Convert to D3 tree structure
    const treeData = folderToD3Tree(currentNode, 3);

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

    // Get color function
    const getColor = (d: d3.HierarchyRectangularNode<D3TreeNode>) => {
      if (d.data.type === 'folder') {
        return treemapColorBy === 'depth' ? getDepthColor(d.depth) : '#FFC107';
      }
      switch (treemapColorBy) {
        case 'category':
          return getColorByCategory(d.data.extension ?? null);
        case 'depth':
          return getDepthColor(d.depth);
        default:
          return getColorByExtension(d.data.extension ?? null);
      }
    };

    // Type the treemap result
    type TreemapNode = d3.HierarchyRectangularNode<D3TreeNode>;

    // Render nodes
    const nodes = svg
      .selectAll('g')
      .data(root.descendants().filter((d) => d.depth > 0) as TreemapNode[])
      .enter()
      .append('g')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`);

    // Rectangles
    nodes
      .append('rect')
      .attr('width', (d) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d) => Math.max(0, d.y1 - d.y0))
      .attr('fill', getColor)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .attr('rx', 2)
      .style('cursor', (d) => (d.data.type === 'folder' ? 'pointer' : 'default'))
      .on('click', (_event, d) => {
        if (d.data.type === 'folder') {
          setTreemapCurrentPath(d.data.path);
        }
      })
      .on('mouseenter', (event, d) => {
        setHoveredNode(d.data);
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          setTooltipPos({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
        }
      })
      .on('mousemove', (event) => {
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

    // Labels
    nodes
      .append('text')
      .attr('x', 4)
      .attr('y', 14)
      .text((d) => {
        const width = d.x1 - d.x0;
        const height = d.y1 - d.y0;
        if (width < 50 || height < 20) return '';
        return truncate(d.data.name, Math.floor(width / 7));
      })
      .attr('fill', '#fff')
      .attr('font-size', '11px')
      .attr('font-weight', '500')
      .style('pointer-events', 'none')
      .style('text-shadow', '0 1px 2px rgba(0,0,0,0.5)');

    // Size labels for larger nodes
    nodes
      .append('text')
      .attr('x', 4)
      .attr('y', 28)
      .text((d) => {
        const width = d.x1 - d.x0;
        const height = d.y1 - d.y0;
        if (width < 60 || height < 35) return '';
        return formatSize(d.value || 0);
      })
      .attr('fill', 'rgba(255,255,255,0.8)')
      .attr('font-size', '10px')
      .style('pointer-events', 'none');
  }, [currentNode, dimensions, treemapColorBy, setTreemapCurrentPath]);

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
          {treemapCurrentPath !== '/' && (
            <button
              onClick={() => {
                const parent = breadcrumbs.length > 1
                  ? breadcrumbs[breadcrumbs.length - 2].path
                  : '/';
                setTreemapCurrentPath(parent);
              }}
              className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded"
            >
              <ZoomOut className="w-4 h-4" />
              Zoom Out
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
            {hoveredNode.type === 'folder' && (
              <div className="text-blue-300 text-xs mt-1">Click to zoom in</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
