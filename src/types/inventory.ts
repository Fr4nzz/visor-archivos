// Required fields (must be mapped)
export interface RequiredFields {
  path: string;      // Full file/folder path
  type: string;      // 'file' or 'folder'
  size: string;      // Size column name (size in bytes)
}

// Optional fields (nice to have)
export interface OptionalFields {
  name?: string;           // File/folder name (can derive from path)
  extension?: string;      // File extension (can derive from name)
  modified?: string;       // Last modified date
  parent?: string;         // Parent folder path (can derive from path)
  depth?: string;          // Folder depth (can calculate)
  hash?: string;           // Content hash for deduplication
}

export type ColumnMapping = RequiredFields & OptionalFields;

// Common column name variations to auto-detect
export const COLUMN_ALIASES: Record<keyof ColumnMapping, string[]> = {
  path: ['path', 'filepath', 'file_path', 'fullpath', 'full_path', 'location'],
  type: ['type', 'kind', 'item_type', 'entry_type', 'filetype'],
  size: ['size', 'size_bytes', 'bytes', 'filesize', 'file_size', 'length'],
  name: ['name', 'filename', 'file_name', 'basename'],
  extension: ['extension', 'ext', 'file_ext', 'suffix'],
  modified: ['modified', 'date_modified', 'mtime', 'last_modified', 'updated'],
  parent: ['parent', 'parent_folder', 'directory', 'folder', 'dirname'],
  depth: ['depth', 'folder_depth', 'level'],
  hash: ['hash', 'content_hash', 'md5', 'sha1', 'sha256', 'checksum'],
};

// Processed inventory entry
export interface InventoryEntry {
  id: string;
  path: string;
  name: string;
  type: 'file' | 'folder';
  size: number;
  extension: string | null;
  modified: string | null;
  parent: string;
  depth: number;
  hash?: string;
  extra?: Record<string, unknown>;
}

// Folder node in tree structure
export interface FolderNode {
  path: string;
  name: string;
  type: 'folder';
  size: number;            // Total size of all contents
  fileCount: number;       // Number of files (recursive)
  folderCount: number;     // Number of folders (recursive)
  directChildren: number;  // Direct children count
  children: Map<string, FolderNode | FileNode>;
  depth: number;
  extensionStats: Map<string, { count: number; size: number }>;
}

export interface FileNode {
  path: string;
  name: string;
  type: 'file';
  size: number;
  extension: string | null;
  modified: string | null;
  depth: number;
}

export type TreeNode = FolderNode | FileNode;

// Statistics
export interface InventoryStats {
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  extensionCounts: Record<string, number>;
  sizeByExtension: Record<string, number>;
  sizeDistribution: SizeDistributionBucket[];
  largestFiles: InventoryEntry[];
  largestFolders: { path: string; name: string; size: number; fileCount: number }[];
  filesByMonth?: Record<string, number>;
  hasDateData: boolean;
}

export interface SizeDistributionBucket {
  label: string;
  min: number;
  max: number;
  count: number;
  totalSize: number;
}

// Flattened tree for virtual list
export interface FlattenedTreeNode {
  path: string;
  name: string;
  type: 'file' | 'folder';
  size: number;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  fileCount?: number;
  folderCount?: number;
  extensionStats?: Map<string, { count: number; size: number }>;
}

// Search filters
export interface Filters {
  query: string;
  extensions: string[];
  sizeMin: number | null;
  sizeMax: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  pathContains: string;
}

// Worker messages
export interface ParseMessage {
  type: 'parse';
  file: File;
  columnMapping: ColumnMapping;
}

export interface ProgressMessage {
  type: 'progress';
  percent: number;
  rowsProcessed: number;
  stage: string;
}

export interface CompleteMessage {
  type: 'complete';
  data: {
    entries: InventoryEntry[];
    tree: FolderNode;
    stats: InventoryStats;
  };
}

export interface ErrorMessage {
  type: 'error';
  error: string;
}

export type WorkerMessage = ParseMessage;
export type WorkerResponse = ProgressMessage | CompleteMessage | ErrorMessage;
