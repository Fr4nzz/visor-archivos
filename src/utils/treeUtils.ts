import type { InventoryEntry, FolderNode, FileNode, FlattenedTreeNode } from '../types/inventory';
import { getExtension, getParentPath, getNameFromPath, getDepth, normalizePath } from './fileUtils';

/**
 * Build folder tree from inventory entries
 */
export function buildFolderTree(entries: InventoryEntry[]): FolderNode {
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

  // First pass: create all folder nodes
  const folders = entries.filter(e => e.type === 'folder');
  const folderMap = new Map<string, FolderNode>();
  folderMap.set('/', root);

  for (const folder of folders) {
    const path = normalizePath(folder.path);
    const node: FolderNode = {
      path,
      name: folder.name || getNameFromPath(path),
      type: 'folder',
      size: 0,
      fileCount: 0,
      folderCount: 0,
      directChildren: 0,
      children: new Map(),
      depth: folder.depth || getDepth(path),
      extensionStats: new Map(),
    };
    folderMap.set(path, node);
  }

  // Second pass: link folders to parents
  for (const [path, folder] of folderMap) {
    if (path === '/') continue;

    const parentPath = getParentPath(path);
    let parent = folderMap.get(parentPath);

    // Create parent folders if they don't exist
    if (!parent) {
      parent = ensureParentFolders(folderMap, parentPath, root);
    }

    parent.children.set(folder.name, folder);
    parent.directChildren++;
  }

  // Third pass: add files and accumulate sizes
  const files = entries.filter(e => e.type === 'file');

  for (const file of files) {
    const path = normalizePath(file.path);
    const parentPath = normalizePath(file.parent) || getParentPath(path);
    let parent = folderMap.get(parentPath);

    // Create parent folders if they don't exist
    if (!parent) {
      parent = ensureParentFolders(folderMap, parentPath, root);
    }

    const fileNode: FileNode = {
      path,
      name: file.name || getNameFromPath(path),
      type: 'file',
      size: file.size,
      extension: file.extension || getExtension(file.name || path),
      modified: file.modified,
      depth: file.depth || getDepth(path),
    };

    parent.children.set(fileNode.name, fileNode);
    parent.directChildren++;
  }

  // Fourth pass: calculate cumulative sizes and counts
  calculateFolderStats(root);

  return root;
}

/**
 * Ensure all parent folders exist in the tree
 */
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

/**
 * Recursively calculate folder statistics
 */
function calculateFolderStats(folder: FolderNode): { size: number; fileCount: number; folderCount: number; extensionStats: Map<string, { count: number; size: number }> } {
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

      // Merge extension stats
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

/**
 * Flatten tree for virtual list rendering
 */
export function flattenTree(
  root: FolderNode,
  expandedPaths: Set<string>,
  showFiles: boolean = false
): FlattenedTreeNode[] {
  const result: FlattenedTreeNode[] = [];

  function traverse(node: FolderNode | FileNode, depth: number) {
    const isFolder = node.type === 'folder';
    const isExpanded = isFolder && expandedPaths.has(node.path);

    if (!showFiles && node.type === 'file') return;

    result.push({
      path: node.path,
      name: node.name,
      type: node.type,
      size: node.size,
      depth,
      hasChildren: isFolder && (node as FolderNode).children.size > 0,
      isExpanded,
      fileCount: isFolder ? (node as FolderNode).fileCount : undefined,
      folderCount: isFolder ? (node as FolderNode).folderCount : undefined,
      extensionStats: isFolder ? (node as FolderNode).extensionStats : undefined,
    });

    if (isFolder && isExpanded) {
      const folder = node as FolderNode;
      // Sort children: folders first, then alphabetically
      const sortedChildren = Array.from(folder.children.values()).sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      for (const child of sortedChildren) {
        traverse(child, depth + 1);
      }
    }
  }

  // Start from root's children
  const sortedRootChildren = Array.from(root.children.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const child of sortedRootChildren) {
    traverse(child, 0);
  }

  return result;
}

/**
 * Find node by path
 */
export function findNode(root: FolderNode, path: string): FolderNode | FileNode | null {
  if (path === '/' || path === '') return root;

  const segments = path.split('/').filter(Boolean);
  let current: FolderNode | FileNode = root;

  for (const segment of segments) {
    if (current.type !== 'folder') return null;
    const child = (current as FolderNode).children.get(segment);
    if (!child) return null;
    current = child;
  }

  return current;
}

/**
 * Get breadcrumb path segments
 */
export function getBreadcrumbs(path: string): { name: string; path: string }[] {
  const segments = path.split('/').filter(Boolean);
  const breadcrumbs: { name: string; path: string }[] = [];
  let currentPath = '';

  for (const segment of segments) {
    currentPath += '/' + segment;
    breadcrumbs.push({ name: segment, path: currentPath });
  }

  return breadcrumbs;
}
