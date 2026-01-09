# TBS Inventory Explorer - Revised Coding Plan

## React + Vite + GitHub Pages Edition

A client-side web application for visualizing large file inventories. Designed to handle 100MB+ CSV files efficiently, deployable as a static GitHub Pages site, and flexible enough for any user's inventory format.

---

## Key Requirements

| Requirement | Solution |
|-------------|----------|
| Large CSV files (~120 MB, 400k+ rows) | Web Workers for parsing, virtual scrolling |
| GitHub Pages deployment | Vite static build, client-side only |
| Drag-and-drop CSV loading | No server needed, all processing in browser |
| Flexible column names | Column mapping UI on first load |
| Works for other users | Generic design, no hardcoded column names |
| SpaceSniffer-style treemap | D3.js treemap with drill-down |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Pages                              │
│                    (Static Hosting)                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     React + Vite App                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Drag & Drop │  │   Column    │  │    Data Processing      │  │
│  │   Upload    │──▶│   Mapper    │──▶│    (Web Worker)         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                                              │                   │
│                                              ▼                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Zustand Store                            ││
│  │  (Normalized data, folder tree, computed aggregations)      ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │   Folder    │      │   Treemap   │      │   Stats     │     │
│  │  Navigator  │      │    View     │      │  Dashboard  │     │
│  │ (Virtual)   │      │   (D3.js)   │      │  (Charts)   │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Category | Technology | Why |
|----------|------------|-----|
| Framework | React 18 | Component architecture, hooks |
| Build Tool | Vite | Fast builds, optimized bundles |
| Language | TypeScript | Type safety for complex data |
| State | Zustand | Lightweight, no boilerplate |
| Styling | Tailwind CSS | Rapid UI development |
| CSV Parsing | PapaParse | Streaming parser, Web Worker support |
| Treemap | D3.js | Industry standard for treemaps |
| Virtual List | @tanstack/react-virtual | Handle 400k+ rows efficiently |
| Charts | Recharts | React-native charts |
| Icons | Lucide React | Clean, consistent icons |
| Routing | React Router | Tab navigation with URL state |

---

## Project Structure

```
inventory-explorer/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── TabNavigation.tsx
│   │   │   └── Footer.tsx
│   │   ├── upload/
│   │   │   ├── DropZone.tsx
│   │   │   ├── ColumnMapper.tsx
│   │   │   └── LoadingProgress.tsx
│   │   ├── navigator/
│   │   │   ├── FolderTree.tsx
│   │   │   ├── FolderRow.tsx
│   │   │   ├── FolderDetails.tsx
│   │   │   └── Breadcrumbs.tsx
│   │   ├── treemap/
│   │   │   ├── TreemapView.tsx
│   │   │   ├── TreemapNode.tsx
│   │   │   ├── TreemapTooltip.tsx
│   │   │   └── TreemapControls.tsx
│   │   ├── stats/
│   │   │   ├── StatsDashboard.tsx
│   │   │   ├── SummaryCards.tsx
│   │   │   ├── FileTypeChart.tsx
│   │   │   ├── SizeDistribution.tsx
│   │   │   └── TimelineChart.tsx
│   │   ├── search/
│   │   │   ├── SearchView.tsx
│   │   │   ├── FilterPanel.tsx
│   │   │   ├── ResultsTable.tsx
│   │   │   └── ExportButton.tsx
│   │   └── common/
│   │       ├── SizeBar.tsx
│   │       ├── FileIcon.tsx
│   │       └── FormatSize.tsx
│   ├── workers/
│   │   └── csvParser.worker.ts
│   ├── stores/
│   │   ├── inventoryStore.ts
│   │   └── uiStore.ts
│   ├── hooks/
│   │   ├── useInventory.ts
│   │   ├── useFolderTree.ts
│   │   └── useTreemapData.ts
│   ├── utils/
│   │   ├── fileUtils.ts
│   │   ├── treeUtils.ts
│   │   ├── formatters.ts
│   │   └── colorSchemes.ts
│   ├── types/
│   │   └── inventory.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── package.json
└── README.md
```

---

## Core Features

### Feature 1: Smart CSV Upload with Column Mapping

Since different users will have different CSV formats, the app needs to:

1. **Auto-detect common column names**
2. **Let users map columns manually if needed**
3. **Remember mappings in localStorage**

```typescript
// types/inventory.ts

// Required fields (must be mapped)
interface RequiredFields {
  path: string;      // Full file/folder path
  type: string;      // 'file' or 'folder'
  size: string;      // Size in bytes
}

// Optional fields (nice to have)
interface OptionalFields {
  name?: string;           // File/folder name (can derive from path)
  extension?: string;      // File extension (can derive from name)
  modified?: string;       // Last modified date
  parent?: string;         // Parent folder path (can derive from path)
  depth?: string;          // Folder depth (can calculate)
  hash?: string;           // Content hash for deduplication
  // ... any other fields
}

// Common column name variations to auto-detect
const COLUMN_ALIASES = {
  path: ['path', 'filepath', 'file_path', 'fullpath', 'full_path', 'location'],
  type: ['type', 'kind', 'item_type', 'entry_type', 'filetype'],
  size: ['size', 'size_bytes', 'bytes', 'filesize', 'file_size', 'length'],
  name: ['name', 'filename', 'file_name', 'basename'],
  extension: ['extension', 'ext', 'file_ext', 'suffix', 'type'],
  modified: ['modified', 'date_modified', 'mtime', 'last_modified', 'updated'],
  parent: ['parent', 'parent_folder', 'directory', 'folder', 'dirname'],
};
```

**Column Mapper UI:**

```
┌─────────────────────────────────────────────────────────────────┐
│  📋 Map Your CSV Columns                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Your CSV has these columns:                                    │
│  [type] [name] [path] [extension] [size_bytes] [modified] ...   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Required Mappings:                                             │
│                                                                 │
│  File Path     [path ▼]              ✅ Auto-detected           │
│  Item Type     [type ▼]              ✅ Auto-detected           │
│  Size (bytes)  [size_bytes ▼]        ✅ Auto-detected           │
│                                                                 │
│  Optional Mappings:                                             │
│                                                                 │
│  Name          [name ▼]              ✅ Auto-detected           │
│  Extension     [extension ▼]         ✅ Auto-detected           │
│  Modified Date [modified ▼]          ✅ Auto-detected           │
│  Parent Folder [parent_folder ▼]     ✅ Auto-detected           │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Preview (first 5 rows):                                        │
│  ┌──────────┬────────────────────────────┬──────────┬────────┐  │
│  │ type     │ path                       │ size     │ name   │  │
│  ├──────────┼────────────────────────────┼──────────┼────────┤  │
│  │ folder   │ /MULTIMEDIA                │ 0        │ MULTI..│  │
│  │ file     │ /MULTIMEDIA/video.mp4      │ 1048576  │ video..│  │
│  └──────────┴────────────────────────────┴──────────┴────────┘  │
│                                                                 │
│                              [Continue →]                       │
└─────────────────────────────────────────────────────────────────┘
```

---

### Feature 2: Web Worker CSV Processing

For 120 MB CSV files, parsing must happen off the main thread:

```typescript
// workers/csvParser.worker.ts

import Papa from 'papaparse';

interface ParseMessage {
  type: 'parse';
  file: File;
  columnMapping: Record<string, string>;
}

interface ProgressMessage {
  type: 'progress';
  percent: number;
  rowsProcessed: number;
}

interface CompleteMessage {
  type: 'complete';
  data: ProcessedInventory;
}

self.onmessage = async (e: MessageEvent<ParseMessage>) => {
  const { file, columnMapping } = e.data;
  
  const entries: InventoryEntry[] = [];
  const folderStats = new Map<string, FolderStats>();
  let rowsProcessed = 0;
  
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    chunk: (results, parser) => {
      // Process in chunks to avoid memory spikes
      for (const row of results.data) {
        const entry = mapRowToEntry(row, columnMapping);
        entries.push(entry);
        updateFolderStats(folderStats, entry);
        rowsProcessed++;
      }
      
      // Report progress
      const percent = (rowsProcessed / estimatedRows) * 100;
      self.postMessage({ type: 'progress', percent, rowsProcessed });
    },
    complete: () => {
      // Build folder tree
      const tree = buildFolderTree(entries, folderStats);
      
      self.postMessage({
        type: 'complete',
        data: {
          entries,
          tree,
          stats: calculateStats(entries),
        }
      });
    },
    error: (error) => {
      self.postMessage({ type: 'error', error: error.message });
    }
  });
};

function mapRowToEntry(row: any, mapping: Record<string, string>): InventoryEntry {
  const path = row[mapping.path] || '';
  const name = row[mapping.name] || path.split('/').pop() || '';
  
  return {
    path,
    name,
    type: row[mapping.type] || 'file',
    size: parseInt(row[mapping.size]) || 0,
    extension: row[mapping.extension] || getExtension(name),
    modified: row[mapping.modified] || null,
    parent: row[mapping.parent] || getParentPath(path),
    depth: row[mapping.depth] || getDepth(path),
    // Preserve any extra columns for display
    extra: getExtraColumns(row, mapping),
  };
}
```

**Loading Progress UI:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                    📂 Processing inventory.csv                  │
│                                                                 │
│     [████████████████████████████░░░░░░░░░░░░] 68%              │
│                                                                 │
│     Rows processed: 274,532 / ~405,000                          │
│     Elapsed: 12.4 seconds                                       │
│                                                                 │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ ✅ Parsing CSV...                          done     │     │
│     │ 🔄 Building folder tree...                 active   │     │
│     │ ⏳ Calculating statistics...               pending  │     │
│     │ ⏳ Preparing treemap data...               pending  │     │
│     └─────────────────────────────────────────────────────┘     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Feature 3: Folder Navigator with Virtual Scrolling

For 400k+ entries, we need virtualization:

```typescript
// components/navigator/FolderTree.tsx

import { useVirtualizer } from '@tanstack/react-virtual';

export function FolderTree() {
  const { flattenedTree, toggleFolder, expandedPaths } = useInventory();
  const parentRef = useRef<HTMLDivElement>(null);
  
  // Only render visible rows
  const virtualizer = useVirtualizer({
    count: flattenedTree.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // Row height
    overscan: 20, // Extra rows to render outside viewport
  });
  
  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = flattenedTree[virtualRow.index];
          return (
            <FolderRow
              key={item.path}
              item={item}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              isExpanded={expandedPaths.has(item.path)}
              onToggle={() => toggleFolder(item.path)}
            />
          );
        })}
      </div>
    </div>
  );
}
```

**Folder Row Design:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ▶ 📁 INVESTIGACIÓN TBS              745.2 GB   89,234 files   [████████] 85%│
│      └─ .jpg (45%) .dat (30%) .tif (15%) other (10%)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ ▼ 📁 MULTIMEDIA                     105.4 GB    1,234 files   [█       ]  5%│
│      └─ .mp4 (60%) .jpg (25%) .pdf (15%)                                    │
│   ▶ 📁 BACKUP OFFSPRING              98.2 GB      890 files   [███████ ] 93%│
│   ▶ 📁 Panthera_onca_2021            61.1 MB        7 files   [        ]  0%│
├─────────────────────────────────────────────────────────────────────────────┤
│ ▶ 📁 NO_TOCAR_AUDIOVISUAL           516.9 GB   12,456 files   [█       ] 10%│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Feature 4: Interactive Treemap (SpaceSniffer Style)

```typescript
// components/treemap/TreemapView.tsx

import * as d3 from 'd3';
import { useTreemapData } from '@/hooks/useTreemapData';

export function TreemapView() {
  const svgRef = useRef<SVGSVGElement>(null);
  const { currentNode, zoomTo, zoomOut, breadcrumbs } = useTreemapData();
  const [hoveredNode, setHoveredNode] = useState<TreeNode | null>(null);
  
  useEffect(() => {
    if (!svgRef.current || !currentNode) return;
    
    const svg = d3.select(svgRef.current);
    const { width, height } = svgRef.current.getBoundingClientRect();
    
    // Create treemap layout
    const treemap = d3.treemap<TreeNode>()
      .size([width, height])
      .padding(2)
      .round(true);
    
    // Create hierarchy
    const root = d3.hierarchy(currentNode)
      .sum(d => d.type === 'file' ? d.size : 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));
    
    treemap(root);
    
    // Render nodes
    const nodes = svg.selectAll('g.node')
      .data(root.descendants().filter(d => d.depth <= 2))
      .join('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);
    
    nodes.selectAll('rect')
      .data(d => [d])
      .join('rect')
      .attr('width', d => Math.max(0, d.x1 - d.x0))
      .attr('height', d => Math.max(0, d.y1 - d.y0))
      .attr('fill', d => getColorByType(d.data))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .on('click', (event, d) => {
        if (d.children) zoomTo(d.data.path);
      })
      .on('mouseenter', (event, d) => setHoveredNode(d.data))
      .on('mouseleave', () => setHoveredNode(null));
    
    // Labels for larger nodes
    nodes.selectAll('text')
      .data(d => [d])
      .join('text')
      .attr('x', 4)
      .attr('y', 16)
      .text(d => {
        const width = d.x1 - d.x0;
        if (width < 60) return '';
        return truncate(d.data.name, width / 8);
      })
      .attr('fill', '#fff')
      .attr('font-size', '12px');
      
  }, [currentNode]);
  
  return (
    <div className="h-full flex flex-col">
      {/* Breadcrumbs */}
      <div className="p-2 bg-gray-100 border-b flex items-center gap-2">
        <button onClick={() => zoomTo('/')} className="hover:underline">
          🏠 Root
        </button>
        {breadcrumbs.map((crumb, i) => (
          <Fragment key={crumb.path}>
            <span>/</span>
            <button 
              onClick={() => zoomTo(crumb.path)}
              className="hover:underline"
            >
              {crumb.name}
            </button>
          </Fragment>
        ))}
      </div>
      
      {/* Treemap */}
      <div className="flex-1 relative">
        <svg ref={svgRef} className="w-full h-full" />
        
        {/* Tooltip */}
        {hoveredNode && (
          <TreemapTooltip node={hoveredNode} />
        )}
      </div>
      
      {/* Controls */}
      <TreemapControls onZoomOut={zoomOut} />
    </div>
  );
}
```

**Color Scheme by File Type:**

```typescript
// utils/colorSchemes.ts

export const FILE_TYPE_COLORS = {
  // Images - Green spectrum
  '.jpg': '#4CAF50',
  '.jpeg': '#4CAF50',
  '.png': '#66BB6A',
  '.gif': '#81C784',
  '.tif': '#43A047',
  '.tiff': '#43A047',
  '.bmp': '#A5D6A7',
  
  // Audio - Blue spectrum
  '.wav': '#2196F3',
  '.mp3': '#42A5F5',
  '.dat': '#1E88E5',  // Common for bioacoustic data
  '.flac': '#64B5F6',
  
  // Video - Orange spectrum
  '.mp4': '#FF9800',
  '.avi': '#FFB74D',
  '.mov': '#FFA726',
  '.mkv': '#FFCC80',
  
  // Documents - Purple spectrum
  '.pdf': '#9C27B0',
  '.doc': '#AB47BC',
  '.docx': '#AB47BC',
  '.xlsx': '#7B1FA2',
  '.pptx': '#CE93D8',
  
  // Data files - Teal spectrum
  '.csv': '#009688',
  '.json': '#26A69A',
  '.xml': '#4DB6AC',
  '.gdb': '#00796B',
  
  // Code - Gray spectrum
  '.py': '#607D8B',
  '.js': '#78909C',
  '.html': '#90A4AE',
  
  // Folders - Amber
  'folder': '#FFC107',
  
  // Default
  'default': '#795548',
};

export function getColorByExtension(ext: string | null): string {
  if (!ext) return FILE_TYPE_COLORS.default;
  return FILE_TYPE_COLORS[ext.toLowerCase()] || FILE_TYPE_COLORS.default;
}

export function getColorByCategory(ext: string | null): string {
  const categories = {
    images: ['jpg', 'jpeg', 'png', 'gif', 'tif', 'tiff', 'bmp', 'raw'],
    audio: ['wav', 'mp3', 'dat', 'flac', 'aac', 'ogg'],
    video: ['mp4', 'avi', 'mov', 'mkv', 'wmv'],
    documents: ['pdf', 'doc', 'docx', 'xlsx', 'pptx', 'txt'],
    data: ['csv', 'json', 'xml', 'gdb', 'sqlite'],
  };
  
  const normalized = (ext || '').toLowerCase().replace('.', '');
  
  for (const [category, extensions] of Object.entries(categories)) {
    if (extensions.includes(normalized)) {
      return CATEGORY_COLORS[category];
    }
  }
  return CATEGORY_COLORS.other;
}
```

---

### Feature 5: Statistics Dashboard

```typescript
// components/stats/StatsDashboard.tsx

export function StatsDashboard() {
  const { stats } = useInventory();
  
  return (
    <div className="p-6 space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          title="Total Files"
          value={stats.totalFiles.toLocaleString()}
          icon={<FileIcon />}
        />
        <SummaryCard
          title="Total Size"
          value={formatSize(stats.totalSize)}
          icon={<DatabaseIcon />}
        />
        <SummaryCard
          title="Folders"
          value={stats.totalFolders.toLocaleString()}
          icon={<FolderIcon />}
        />
        <SummaryCard
          title="File Types"
          value={Object.keys(stats.extensionCounts).length}
          icon={<PieChartIcon />}
        />
      </div>
      
      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6">
        {/* File Type Distribution */}
        <Card>
          <h3>Storage by File Type</h3>
          <FileTypeChart data={stats.sizeByExtension} />
        </Card>
        
        {/* Size Distribution */}
        <Card>
          <h3>File Size Distribution</h3>
          <SizeDistributionChart data={stats.sizeDistribution} />
        </Card>
      </div>
      
      {/* Timeline (if dates available) */}
      {stats.hasDateData && (
        <Card>
          <h3>Files Over Time</h3>
          <TimelineChart data={stats.filesByMonth} />
        </Card>
      )}
      
      {/* Top Items */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <h3>Largest Files</h3>
          <TopItemsList items={stats.largestFiles} />
        </Card>
        <Card>
          <h3>Largest Folders</h3>
          <TopItemsList items={stats.largestFolders} />
        </Card>
      </div>
    </div>
  );
}
```

---

### Feature 6: Search & Filter with Export

```typescript
// components/search/SearchView.tsx

export function SearchView() {
  const { entries } = useInventory();
  const [filters, setFilters] = useState<Filters>({
    query: '',
    extensions: [],
    sizeMin: null,
    sizeMax: null,
    dateFrom: null,
    dateTo: null,
    pathContains: '',
  });
  
  // Filter in Web Worker for large datasets
  const filteredResults = useFilteredResults(entries, filters);
  
  const handleExport = () => {
    const csv = generateCSV(filteredResults);
    downloadFile(csv, 'filtered_inventory.csv');
  };
  
  return (
    <div className="h-full flex">
      {/* Filter Panel */}
      <div className="w-80 border-r p-4 space-y-4">
        <SearchInput
          value={filters.query}
          onChange={(q) => setFilters(f => ({ ...f, query: q }))}
          placeholder="Search files..."
        />
        
        <ExtensionFilter
          selected={filters.extensions}
          onChange={(exts) => setFilters(f => ({ ...f, extensions: exts }))}
        />
        
        <SizeRangeFilter
          min={filters.sizeMin}
          max={filters.sizeMax}
          onChange={(min, max) => setFilters(f => ({ ...f, sizeMin: min, sizeMax: max }))}
        />
        
        {/* Show date filter only if data has dates */}
        <DateRangeFilter ... />
        
        <PathFilter
          value={filters.pathContains}
          onChange={(p) => setFilters(f => ({ ...f, pathContains: p }))}
        />
        
        <div className="pt-4 border-t">
          <Button onClick={handleExport}>
            Export {filteredResults.length.toLocaleString()} results
          </Button>
        </div>
      </div>
      
      {/* Results */}
      <div className="flex-1">
        <ResultsTable results={filteredResults} />
      </div>
    </div>
  );
}
```

---

## State Management with Zustand

```typescript
// stores/inventoryStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface InventoryState {
  // Data
  entries: InventoryEntry[];
  folderTree: FolderNode | null;
  stats: InventoryStats | null;
  
  // Column mapping (persisted)
  columnMapping: ColumnMapping | null;
  
  // UI State
  isLoading: boolean;
  loadingProgress: number;
  loadingStage: string;
  error: string | null;
  
  // Navigation
  currentPath: string;
  expandedPaths: Set<string>;
  
  // Actions
  loadCSV: (file: File) => Promise<void>;
  setColumnMapping: (mapping: ColumnMapping) => void;
  setCurrentPath: (path: string) => void;
  toggleFolder: (path: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  reset: () => void;
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      folderTree: null,
      stats: null,
      columnMapping: null,
      isLoading: false,
      loadingProgress: 0,
      loadingStage: '',
      error: null,
      currentPath: '/',
      expandedPaths: new Set(),
      
      loadCSV: async (file: File) => {
        set({ isLoading: true, loadingProgress: 0, error: null });
        
        const worker = new Worker(
          new URL('../workers/csvParser.worker.ts', import.meta.url),
          { type: 'module' }
        );
        
        worker.onmessage = (e) => {
          const { type, ...data } = e.data;
          
          switch (type) {
            case 'progress':
              set({ 
                loadingProgress: data.percent,
                loadingStage: `Processing ${data.rowsProcessed.toLocaleString()} rows...`
              });
              break;
            case 'complete':
              set({
                entries: data.entries,
                folderTree: data.tree,
                stats: data.stats,
                isLoading: false,
                loadingProgress: 100,
              });
              worker.terminate();
              break;
            case 'error':
              set({ error: data.error, isLoading: false });
              worker.terminate();
              break;
          }
        };
        
        worker.postMessage({
          type: 'parse',
          file,
          columnMapping: get().columnMapping,
        });
      },
      
      toggleFolder: (path: string) => {
        set((state) => {
          const newExpanded = new Set(state.expandedPaths);
          if (newExpanded.has(path)) {
            newExpanded.delete(path);
          } else {
            newExpanded.add(path);
          }
          return { expandedPaths: newExpanded };
        });
      },
      
      // ... other actions
    }),
    {
      name: 'inventory-explorer',
      partialize: (state) => ({
        // Only persist column mapping
        columnMapping: state.columnMapping,
      }),
    }
  )
);
```

---

## GitHub Pages Deployment

### Vite Configuration

```typescript
// vite.config.ts

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  
  // For GitHub Pages - set to repo name
  base: '/inventory-explorer/',
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  
  build: {
    // Optimize for large data handling
    target: 'esnext',
    
    // Web Worker handling
    rollupOptions: {
      output: {
        manualChunks: {
          'd3': ['d3'],
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  
  // Web Worker configuration
  worker: {
    format: 'es',
  },
});
```

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml

name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### package.json Scripts

```json
{
  "name": "inventory-explorer",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx",
    "deploy": "npm run build && gh-pages -d dist"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.21.0",
    "@tanstack/react-virtual": "^3.0.0",
    "zustand": "^4.4.0",
    "papaparse": "^5.4.0",
    "d3": "^7.8.0",
    "recharts": "^2.10.0",
    "lucide-react": "^0.300.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/d3": "^7.4.0",
    "@types/papaparse": "^5.3.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "gh-pages": "^6.1.0"
  }
}
```

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER VISITS GITHUB PAGE                                     │
│     https://username.github.io/inventory-explorer/              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. LANDING / UPLOAD SCREEN                                     │
│                                                                 │
│     ┌───────────────────────────────────────────────────────┐   │
│     │                                                       │   │
│     │         📂 Drag & Drop your inventory CSV             │   │
│     │                                                       │   │
│     │              or click to browse                       │   │
│     │                                                       │   │
│     │         Supports files up to 500 MB                   │   │
│     │                                                       │   │
│     └───────────────────────────────────────────────────────┘   │
│                                                                 │
│     Don't have an inventory? [Create one with our script →]     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. COLUMN MAPPING (if needed)                                  │
│                                                                 │
│     We detected these columns. Please verify the mappings:      │
│     [Auto-mapping UI with dropdown overrides]                   │
│                                                                 │
│                                        [Continue →]             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. PROCESSING                                                  │
│                                                                 │
│     [████████████████████░░░░░░░░░░] 65%                        │
│     Processing 260,000 of 400,000 entries...                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. MAIN APPLICATION                                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 📁 Navigator │ 🟦 Treemap │ 📊 Stats │ 🔍 Search        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  [Selected tab content rendered here]                           │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐      │
│  │ 📄 inventory.csv │ 403,109 files │ 2.6 TB │ [Upload New]│     │
│  └───────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Initial page load | < 2 seconds |
| CSV parsing (100 MB) | < 15 seconds |
| Folder tree render | < 100ms for visible items |
| Treemap render | < 500ms |
| Search/filter | < 200ms response |
| Memory usage | < 1 GB for 500k entries |

---

## Implementation Phases

### Phase 1: Foundation (Days 1-2)
- [ ] Initialize Vite + React + TypeScript project
- [ ] Set up Tailwind CSS
- [ ] Create basic layout with tab navigation
- [ ] Implement DropZone component
- [ ] Create Column Mapper UI
- [ ] Set up Web Worker for CSV parsing
- [ ] Basic Zustand store

### Phase 2: Folder Navigator (Days 3-4)
- [ ] Implement folder tree data structure
- [ ] Create virtualized FolderTree component
- [ ] Add expand/collapse functionality
- [ ] Implement breadcrumb navigation
- [ ] Add folder statistics display
- [ ] Size bars and extension badges

### Phase 3: Treemap Visualization (Days 5-6)
- [ ] Set up D3.js treemap
- [ ] Implement zoom/drill-down
- [ ] Add color schemes
- [ ] Create tooltip component
- [ ] Add breadcrumb navigation
- [ ] Implement controls (zoom, color options)

### Phase 4: Statistics Dashboard (Day 7)
- [ ] Summary cards
- [ ] File type pie chart
- [ ] Size distribution histogram
- [ ] Timeline chart (if dates available)
- [ ] Top files/folders lists

### Phase 5: Search & Filter (Day 8)
- [ ] Filter panel UI
- [ ] Implement filtering logic (Web Worker)
- [ ] Virtual results table
- [ ] CSV export functionality

### Phase 6: Polish & Deploy (Days 9-10)
- [ ] Responsive design
- [ ] Error handling
- [ ] Loading states
- [ ] GitHub Actions workflow
- [ ] Documentation
- [ ] Testing with large files

---

## Future Enhancements (v2.0)

1. **Multiple file support** — Compare inventories
2. **Saved views** — Bookmark specific filters/paths
3. **Duplicate finder** — Using content_hash if available
4. **Migration planner** — Tag folders with priority/embargo
5. **Cost calculator** — Estimate cloud storage costs
6. **Share via URL** — Encode view state in URL params
7. **PWA support** — Offline capability

---

*Revised plan for TBS DataHub Migration Project - January 2025*
*Designed for React + Vite + GitHub Pages deployment*
