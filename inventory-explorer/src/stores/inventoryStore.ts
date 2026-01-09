import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  InventoryEntry,
  FolderNode,
  InventoryStats,
  ColumnMapping,
  FlattenedTreeNode,
} from '../types/inventory';
import { flattenTree } from '../utils/treeUtils';

interface InventoryState {
  // Data
  entries: InventoryEntry[];
  folderTree: FolderNode | null;
  stats: InventoryStats | null;

  // Column mapping (persisted)
  columnMapping: ColumnMapping | null;
  csvHeaders: string[];

  // UI State
  isLoading: boolean;
  loadingProgress: number;
  loadingStage: string;
  error: string | null;
  fileName: string | null;

  // Navigation
  currentPath: string;
  expandedPaths: Set<string>;
  showFiles: boolean;

  // Computed
  flattenedTree: FlattenedTreeNode[];

  // Actions
  setCSVHeaders: (headers: string[]) => void;
  setColumnMapping: (mapping: ColumnMapping) => void;
  setLoadingState: (isLoading: boolean, progress?: number, stage?: string) => void;
  setError: (error: string | null) => void;
  setData: (
    entries: InventoryEntry[],
    tree: FolderNode,
    stats: InventoryStats,
    fileName: string
  ) => void;
  setCurrentPath: (path: string) => void;
  toggleFolder: (path: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  toggleShowFiles: () => void;
  reset: () => void;
}

const initialState = {
  entries: [],
  folderTree: null,
  stats: null,
  columnMapping: null,
  csvHeaders: [],
  isLoading: false,
  loadingProgress: 0,
  loadingStage: '',
  error: null,
  fileName: null,
  currentPath: '/',
  expandedPaths: new Set<string>(),
  showFiles: false,
  flattenedTree: [],
};

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setCSVHeaders: (headers: string[]) => {
        set({ csvHeaders: headers });
      },

      setColumnMapping: (mapping: ColumnMapping) => {
        set({ columnMapping: mapping });
      },

      setLoadingState: (isLoading: boolean, progress = 0, stage = '') => {
        set({ isLoading, loadingProgress: progress, loadingStage: stage });
      },

      setError: (error: string | null) => {
        set({ error, isLoading: false });
      },

      setData: (
        entries: InventoryEntry[],
        tree: FolderNode,
        stats: InventoryStats,
        fileName: string
      ) => {
        const expandedPaths = new Set<string>();
        // Auto-expand root level folders
        for (const [, child] of tree.children) {
          if (child.type === 'folder') {
            expandedPaths.add(child.path);
          }
        }

        set({
          entries,
          folderTree: tree,
          stats,
          fileName,
          isLoading: false,
          loadingProgress: 100,
          loadingStage: 'Complete',
          expandedPaths,
          flattenedTree: flattenTree(tree, expandedPaths, get().showFiles),
        });
      },

      setCurrentPath: (path: string) => {
        set({ currentPath: path });
      },

      toggleFolder: (path: string) => {
        const { expandedPaths, folderTree, showFiles } = get();
        const newExpanded = new Set(expandedPaths);

        if (newExpanded.has(path)) {
          newExpanded.delete(path);
        } else {
          newExpanded.add(path);
        }

        set({
          expandedPaths: newExpanded,
          flattenedTree: folderTree
            ? flattenTree(folderTree, newExpanded, showFiles)
            : [],
        });
      },

      expandAll: () => {
        const { folderTree, showFiles } = get();
        if (!folderTree) return;

        const allPaths = new Set<string>();

        function collectPaths(node: FolderNode) {
          allPaths.add(node.path);
          for (const [, child] of node.children) {
            if (child.type === 'folder') {
              collectPaths(child);
            }
          }
        }

        collectPaths(folderTree);

        set({
          expandedPaths: allPaths,
          flattenedTree: flattenTree(folderTree, allPaths, showFiles),
        });
      },

      collapseAll: () => {
        const { folderTree, showFiles } = get();
        const emptySet = new Set<string>();

        set({
          expandedPaths: emptySet,
          flattenedTree: folderTree
            ? flattenTree(folderTree, emptySet, showFiles)
            : [],
        });
      },

      toggleShowFiles: () => {
        const { folderTree, expandedPaths, showFiles } = get();
        const newShowFiles = !showFiles;

        set({
          showFiles: newShowFiles,
          flattenedTree: folderTree
            ? flattenTree(folderTree, expandedPaths, newShowFiles)
            : [],
        });
      },

      reset: () => {
        set({
          ...initialState,
          columnMapping: get().columnMapping, // Keep column mapping
        });
      },
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
