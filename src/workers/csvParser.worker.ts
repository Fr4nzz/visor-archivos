import Papa from 'papaparse';
import type {
  ColumnMapping,
  InventoryEntry,
  FolderNode,
  InventoryStats,
  SizeDistributionBucket,
  EntryMetadata,
  MetadataStats,
  DeduplicationStats,
  DuplicateGroup,
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

  // Extract metadata if columns are mapped
  const metadata: EntryMetadata = {};
  let hasMetadata = false;

  // Helper function to extract string metadata
  const extractString = (field: keyof typeof mapping) => {
    const col = mapping[field];
    if (col && row[col]) {
      (metadata as Record<string, unknown>)[field] = row[col];
      hasMetadata = true;
    }
  };

  // Date fields
  extractString('extracted_date');
  extractString('date_precision');
  extractString('date_format_hint');
  extractString('date_confidence');

  // Taxonomy - GBIF hierarchy
  extractString('taxa_verbatim');
  extractString('taxa_interpreted');
  extractString('taxa_rank');
  extractString('taxa_kingdom');
  extractString('taxa_phylum');
  extractString('taxa_class');
  extractString('taxa_order');
  extractString('taxa_family');
  extractString('taxa_genus');
  extractString('taxa_species');
  extractString('taxa_common_name');
  extractString('taxa_gbif_key');
  extractString('taxa_source');

  // Legacy species
  extractString('species');
  extractString('species_source');

  // Equipment & Location
  extractString('equipment');
  extractString('location');
  extractString('zone');
  extractString('project');
  extractString('data_type');

  // Specialized fields
  extractString('climate_variable');
  extractString('climate_extent');
  extractString('camera_id');
  extractString('sequence_number');
  extractString('deforestation_period');

  // Cross-reference enrichment
  extractString('xref_source');
  extractString('xref_latitude');
  extractString('xref_longitude');
  extractString('xref_comment');

  // Boolean field
  if (mapping.is_system_file && row[mapping.is_system_file]) {
    metadata.is_system_file = row[mapping.is_system_file]?.toLowerCase() === 'true';
    hasMetadata = true;
  }

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
    metadata: hasMetadata ? metadata : undefined,
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
      metadata: file.metadata,
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

  // Calculate metadata statistics
  const metadataStats: MetadataStats = {
    taxonomy: {
      kingdom: {},
      phylum: {},
      class: {},
      order: {},
      family: {},
      genus: {},
      species: {},
    },
    species: {},
    projects: {},
    locations: {},
    zones: {},
    equipment: {},
    dataTypes: {},
    hasMetadata: false,
    hasTaxonomy: false,
  };

  // Helper to add to stats
  const addToStats = (
    statsObj: Record<string, { count: number; size: number }>,
    key: string | null | undefined,
    size: number
  ) => {
    if (!key) return;
    if (!statsObj[key]) {
      statsObj[key] = { count: 0, size: 0 };
    }
    statsObj[key].count++;
    statsObj[key].size += size;
  };

  for (const entry of entries) {
    if (!entry.metadata) continue;
    metadataStats.hasMetadata = true;

    // Taxonomy stats
    if (entry.metadata.taxa_kingdom) {
      metadataStats.hasTaxonomy = true;
      addToStats(metadataStats.taxonomy.kingdom, entry.metadata.taxa_kingdom, entry.size);
    }
    if (entry.metadata.taxa_phylum) {
      metadataStats.hasTaxonomy = true;
      addToStats(metadataStats.taxonomy.phylum, entry.metadata.taxa_phylum, entry.size);
    }
    if (entry.metadata.taxa_class) {
      metadataStats.hasTaxonomy = true;
      addToStats(metadataStats.taxonomy.class, entry.metadata.taxa_class, entry.size);
    }
    if (entry.metadata.taxa_order) {
      metadataStats.hasTaxonomy = true;
      addToStats(metadataStats.taxonomy.order, entry.metadata.taxa_order, entry.size);
    }
    if (entry.metadata.taxa_family) {
      metadataStats.hasTaxonomy = true;
      addToStats(metadataStats.taxonomy.family, entry.metadata.taxa_family, entry.size);
    }
    if (entry.metadata.taxa_genus) {
      metadataStats.hasTaxonomy = true;
      addToStats(metadataStats.taxonomy.genus, entry.metadata.taxa_genus, entry.size);
    }
    // Use taxa_interpreted for species level (scientific name)
    if (entry.metadata.taxa_interpreted) {
      metadataStats.hasTaxonomy = true;
      addToStats(metadataStats.taxonomy.species, entry.metadata.taxa_interpreted, entry.size);
    }

    // Legacy species (for backwards compatibility)
    addToStats(metadataStats.species, entry.metadata.species, entry.size);

    // Other stats
    addToStats(metadataStats.projects, entry.metadata.project, entry.size);
    addToStats(metadataStats.locations, entry.metadata.location, entry.size);
    addToStats(metadataStats.zones, entry.metadata.zone, entry.size);
    addToStats(metadataStats.equipment, entry.metadata.equipment, entry.size);
    addToStats(metadataStats.dataTypes, entry.metadata.data_type, entry.size);
  }

  // Calculate deduplication stats
  const deduplication = calculateDeduplicationStats(files);

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
    metadataStats: metadataStats.hasMetadata ? metadataStats : undefined,
    deduplication,
  };
}

function calculateDeduplicationStats(files: InventoryEntry[]): DeduplicationStats | undefined {
  // Group files by content hash
  const byHash = new Map<string, InventoryEntry[]>();

  for (const file of files) {
    if (!file.hash) continue;

    const existing = byHash.get(file.hash) || [];
    existing.push(file);
    byHash.set(file.hash, existing);
  }

  // No hash data available
  if (byHash.size === 0) return undefined;

  // Calculate unique storage (one copy of each hash)
  let uniqueSize = 0;
  const duplicateGroups: DuplicateGroup[] = [];
  let totalDuplicateFiles = 0;

  for (const [hash, group] of byHash) {
    const fileSize = group[0].size;
    uniqueSize += fileSize;

    if (group.length > 1) {
      const wastedBytes = fileSize * (group.length - 1);
      totalDuplicateFiles += group.length - 1;

      duplicateGroups.push({
        hash,
        fileSize,
        copyCount: group.length,
        wastedBytes,
        sampleName: group[0].name,
        samplePath: group[0].path,
        files: group.map(f => ({ name: f.name, path: f.path })),
      });
    }
  }

  // Sort by wasted bytes descending
  duplicateGroups.sort((a, b) => b.wastedBytes - a.wastedBytes);

  // Calculate totals
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const duplicateSize = totalSize - uniqueSize;
  const duplicatePercent = totalSize > 0 ? (duplicateSize / totalSize) * 100 : 0;

  return {
    uniqueSize,
    duplicateSize,
    duplicatePercent,
    duplicateGroups: duplicateGroups.length,
    duplicateFileCount: totalDuplicateFiles,
    topDuplicates: duplicateGroups.slice(0, 20),
  };
}
