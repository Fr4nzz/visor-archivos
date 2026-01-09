import Papa from 'papaparse';
import type {
  ColumnMapping,
  InventoryEntry,
  FolderNode,
  InventoryStats,
  SizeDistributionBucket,
} from '../types/inventory';

// Utility functions (duplicated to avoid import issues in worker)
function getExtension(name: string): string | null {
  const lastDot = name.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0 || lastDot === name.length - 1) {
    return null;
  }
  return name.substring(lastDot).toLowerCase();
}

function getParentPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return '/';
  return normalized.substring(0, lastSlash);
}

function getNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || '/';
}

function getDepth(path: string): number {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).length;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

interface ParseMessage {
  type: 'parse';
  file: File;
  columnMapping: ColumnMapping;
}

self.onmessage = async (e: MessageEvent<ParseMessage>) => {
  const { file, columnMapping } = e.data;

  const entries: InventoryEntry[] = [];
  let rowsProcessed = 0;
  const estimatedRows = Math.ceil(file.size / 200); // Rough estimate

  self.postMessage({ type: 'progress', percent: 0, rowsProcessed: 0, stage: 'Parsing CSV...' });

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    chunk: (results) => {
      for (const row of results.data as Record<string, string>[]) {
        const entry = mapRowToEntry(row, columnMapping, rowsProcessed);
        if (entry) {
          entries.push(entry);
        }
        rowsProcessed++;
      }

      const percent = Math.min(90, (rowsProcessed / estimatedRows) * 90);
      self.postMessage({
        type: 'progress',
        percent,
        rowsProcessed,
        stage: `Parsing CSV... (${rowsProcessed.toLocaleString()} rows)`,
      });
    },
    complete: () => {
      self.postMessage({
        type: 'progress',
        percent: 92,
        rowsProcessed,
        stage: 'Building folder tree...',
      });

      const tree = buildFolderTree(entries);

      self.postMessage({
        type: 'progress',
        percent: 96,
        rowsProcessed,
        stage: 'Calculating statistics...',
      });

      const stats = calculateStats(entries, tree);

      self.postMessage({
        type: 'complete',
        data: {
          entries,
          tree,
          stats,
        },
      });
    },
    error: (error) => {
      self.postMessage({ type: 'error', error: error.message });
    },
  });
};

function mapRowToEntry(
  row: Record<string, string>,
  mapping: ColumnMapping,
  index: number
): InventoryEntry | null {
  const path = row[mapping.path];
  if (!path) return null;

  const normalizedPath = normalizePath(path);
  const name = mapping.name ? row[mapping.name] : getNameFromPath(normalizedPath);
  const typeRaw = row[mapping.type]?.toLowerCase() || 'file';
  const type = typeRaw === 'folder' || typeRaw === 'directory' ? 'folder' : 'file';

  return {
    id: `${index}-${normalizedPath.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50)}`,
    path: normalizedPath,
    name: name || getNameFromPath(normalizedPath),
    type,
    size: parseInt(row[mapping.size]) || 0,
    extension: mapping.extension
      ? row[mapping.extension] || null
      : type === 'file'
      ? getExtension(name || normalizedPath)
      : null,
    modified: mapping.modified ? row[mapping.modified] || null : null,
    parent: mapping.parent
      ? normalizePath(row[mapping.parent] || getParentPath(normalizedPath))
      : getParentPath(normalizedPath),
    depth: mapping.depth ? parseInt(row[mapping.depth]) || getDepth(normalizedPath) : getDepth(normalizedPath),
    hash: mapping.hash ? row[mapping.hash] : undefined,
  };
}

function buildFolderTree(entries: InventoryEntry[]): FolderNode {
  const root: FolderNode = {
    path: '/',
    name: 'Root',
    type: 'folder',
    size: 0,
    fileCount: 0,
    folderCount: 0,
    directChildren: 0,
    children: new Map(),
    depth: 0,
    extensionStats: new Map(),
  };

  const folderMap = new Map<string, FolderNode>();
  folderMap.set('/', root);

  // First pass: create folder nodes
  const folders = entries.filter((e) => e.type === 'folder');
  for (const folder of folders) {
    const path = folder.path;
    const node: FolderNode = {
      path,
      name: folder.name,
      type: 'folder',
      size: 0,
      fileCount: 0,
      folderCount: 0,
      directChildren: 0,
      children: new Map(),
      depth: folder.depth,
      extensionStats: new Map(),
    };
    folderMap.set(path, node);
  }

  // Second pass: link folders to parents
  for (const [path, folder] of folderMap) {
    if (path === '/') continue;

    const parentPath = getParentPath(path);
    let parent = folderMap.get(parentPath);

    if (!parent) {
      parent = ensureParentFolders(folderMap, parentPath, root);
    }

    parent.children.set(folder.name, folder);
    parent.directChildren++;
  }

  // Third pass: add files
  const files = entries.filter((e) => e.type === 'file');
  for (const file of files) {
    const parentPath = file.parent;
    let parent = folderMap.get(parentPath);

    if (!parent) {
      parent = ensureParentFolders(folderMap, parentPath, root);
    }

    const fileNode = {
      path: file.path,
      name: file.name,
      type: 'file' as const,
      size: file.size,
      extension: file.extension,
      modified: file.modified,
      depth: file.depth,
    };

    parent.children.set(fileNode.name, fileNode);
    parent.directChildren++;
  }

  // Fourth pass: calculate cumulative stats
  calculateFolderStats(root);

  return root;
}

function ensureParentFolders(
  folderMap: Map<string, FolderNode>,
  path: string,
  root: FolderNode
): FolderNode {
  if (path === '/' || path === '') return root;

  const existing = folderMap.get(path);
  if (existing) return existing;

  const folder: FolderNode = {
    path,
    name: getNameFromPath(path),
    type: 'folder',
    size: 0,
    fileCount: 0,
    folderCount: 0,
    directChildren: 0,
    children: new Map(),
    depth: getDepth(path),
    extensionStats: new Map(),
  };

  folderMap.set(path, folder);

  const parentPath = getParentPath(path);
  const parent = ensureParentFolders(folderMap, parentPath, root);
  parent.children.set(folder.name, folder);
  parent.directChildren++;

  return folder;
}

function calculateFolderStats(folder: FolderNode): {
  size: number;
  fileCount: number;
  folderCount: number;
  extensionStats: Map<string, { count: number; size: number }>;
} {
  let totalSize = 0;
  let totalFileCount = 0;
  let totalFolderCount = 0;
  const extensionStats = new Map<string, { count: number; size: number }>();

  for (const [, child] of folder.children) {
    if (child.type === 'file') {
      totalSize += child.size;
      totalFileCount++;

      const ext = child.extension || 'no-extension';
      const existing = extensionStats.get(ext) || { count: 0, size: 0 };
      existing.count++;
      existing.size += child.size;
      extensionStats.set(ext, existing);
    } else {
      const stats = calculateFolderStats(child);
      totalSize += stats.size;
      totalFileCount += stats.fileCount;
      totalFolderCount += stats.folderCount + 1;

      for (const [ext, stat] of stats.extensionStats) {
        const existing = extensionStats.get(ext) || { count: 0, size: 0 };
        existing.count += stat.count;
        existing.size += stat.size;
        extensionStats.set(ext, existing);
      }
    }
  }

  folder.size = totalSize;
  folder.fileCount = totalFileCount;
  folder.folderCount = totalFolderCount;
  folder.extensionStats = extensionStats;

  return { size: totalSize, fileCount: totalFileCount, folderCount: totalFolderCount, extensionStats };
}

function calculateStats(entries: InventoryEntry[], tree: FolderNode): InventoryStats {
  const files = entries.filter((e) => e.type === 'file');
  const folders = entries.filter((e) => e.type === 'folder');

  // Extension counts and sizes
  const extensionCounts: Record<string, number> = {};
  const sizeByExtension: Record<string, number> = {};

  for (const file of files) {
    const ext = file.extension || 'no-extension';
    extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
    sizeByExtension[ext] = (sizeByExtension[ext] || 0) + file.size;
  }

  // Size distribution buckets
  const sizeDistribution: SizeDistributionBucket[] = [
    { label: '0-1KB', min: 0, max: 1024, count: 0, totalSize: 0 },
    { label: '1KB-100KB', min: 1024, max: 102400, count: 0, totalSize: 0 },
    { label: '100KB-1MB', min: 102400, max: 1048576, count: 0, totalSize: 0 },
    { label: '1MB-10MB', min: 1048576, max: 10485760, count: 0, totalSize: 0 },
    { label: '10MB-100MB', min: 10485760, max: 104857600, count: 0, totalSize: 0 },
    { label: '100MB-1GB', min: 104857600, max: 1073741824, count: 0, totalSize: 0 },
    { label: '1GB+', min: 1073741824, max: Infinity, count: 0, totalSize: 0 },
  ];

  for (const file of files) {
    for (const bucket of sizeDistribution) {
      if (file.size >= bucket.min && file.size < bucket.max) {
        bucket.count++;
        bucket.totalSize += file.size;
        break;
      }
    }
  }

  // Largest files
  const largestFiles = [...files]
    .sort((a, b) => b.size - a.size)
    .slice(0, 20);

  // Largest folders (from tree)
  const folderSizes: { path: string; name: string; size: number; fileCount: number }[] = [];

  function collectFolderSizes(node: FolderNode) {
    folderSizes.push({
      path: node.path,
      name: node.name,
      size: node.size,
      fileCount: node.fileCount,
    });
    for (const [, child] of node.children) {
      if (child.type === 'folder') {
        collectFolderSizes(child);
      }
    }
  }

  collectFolderSizes(tree);
  const largestFolders = folderSizes
    .filter((f) => f.path !== '/')
    .sort((a, b) => b.size - a.size)
    .slice(0, 20);

  // Check if we have date data
  const hasDateData = files.some((f) => f.modified);

  // Files by month (if we have date data)
  const filesByMonth: Record<string, number> = {};
  if (hasDateData) {
    for (const file of files) {
      if (file.modified) {
        try {
          const date = new Date(file.modified);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          filesByMonth[monthKey] = (filesByMonth[monthKey] || 0) + 1;
        } catch {
          // Ignore invalid dates
        }
      }
    }
  }

  return {
    totalFiles: files.length,
    totalFolders: folders.length,
    totalSize: tree.size,
    extensionCounts,
    sizeByExtension,
    sizeDistribution,
    largestFiles,
    largestFolders,
    filesByMonth: hasDateData ? filesByMonth : undefined,
    hasDateData,
  };
}
