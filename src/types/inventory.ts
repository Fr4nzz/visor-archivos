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

// Metadata fields (extracted from filenames)
export interface MetadataFields {
  extracted_date?: string;
  date_precision?: string;
  species?: string;
  equipment?: string;
  location?: string;
  zone?: string;
  project?: string;
  data_type?: string;
  climate_variable?: string;
  climate_extent?: string;
  camera_id?: string;
  sequence_number?: string;
  deforestation_period?: string;
  is_system_file?: string;
}

export type ColumnMapping = RequiredFields & OptionalFields & MetadataFields;

// Common column name variations to auto-detect
export const COLUMN_ALIASES: Record<keyof ColumnMapping, string[]> = {
  // Required
  path: ['path', 'filepath', 'file_path', 'fullpath', 'full_path', 'ruta'],
  type: ['type', 'kind', 'item_type', 'entry_type', 'filetype'],
  size: ['size', 'size_bytes', 'bytes', 'filesize', 'file_size', 'length'],
  // Optional
  name: ['name', 'filename', 'file_name', 'basename'],
  extension: ['extension', 'ext', 'file_ext', 'suffix'],
  modified: ['modified', 'date_modified', 'mtime', 'last_modified', 'updated'],
  parent: ['parent', 'parent_folder', 'directory', 'folder', 'dirname'],
  depth: ['depth', 'folder_depth', 'level'],
  hash: ['hash', 'content_hash', 'md5', 'sha1', 'sha256', 'checksum'],
  // Metadata
  extracted_date: ['extracted_date', 'date', 'fecha'],
  date_precision: ['date_precision', 'precision'],
  species: ['species', 'especie', 'scientific_name', 'nombre_cientifico'],
  equipment: ['equipment', 'equipo', 'camera', 'recorder'],
  location: ['location', 'ubicacion', 'site', 'sitio'],
  zone: ['zone', 'zona', 'position'],
  project: ['project', 'proyecto', 'study'],
  data_type: ['data_type', 'tipo_dato', 'tipo'],
  climate_variable: ['climate_variable', 'variable_climatica'],
  climate_extent: ['climate_extent', 'extension_climatica'],
  camera_id: ['camera_id', 'camara_id', 'trap_id'],
  sequence_number: ['sequence_number', 'secuencia', 'seq'],
  deforestation_period: ['deforestation_period', 'periodo_deforestacion'],
  is_system_file: ['is_system_file', 'archivo_sistema', 'system'],
};

// Metadata stored on entries
export interface EntryMetadata {
  extracted_date?: string | null;
  date_precision?: string | null;
  species?: string | null;
  equipment?: string | null;
  location?: string | null;
  zone?: string | null;
  project?: string | null;
  data_type?: string | null;
  climate_variable?: string | null;
  climate_extent?: string | null;
  camera_id?: string | null;
  sequence_number?: string | null;
  deforestation_period?: string | null;
  is_system_file?: boolean;
}

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
  metadata?: EntryMetadata;
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
  metadata?: EntryMetadata;
}

export type TreeNode = FolderNode | FileNode;

// Metadata statistics
export interface MetadataStats {
  species: Record<string, { count: number; size: number }>;
  projects: Record<string, { count: number; size: number }>;
  locations: Record<string, { count: number; size: number }>;
  zones: Record<string, { count: number; size: number }>;
  equipment: Record<string, { count: number; size: number }>;
  dataTypes: Record<string, { count: number; size: number }>;
  hasMetadata: boolean;
}

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
  metadataStats?: MetadataStats;
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
