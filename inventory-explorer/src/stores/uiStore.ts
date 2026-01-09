import { create } from 'zustand';

export type TabId = 'navigator' | 'treemap' | 'stats' | 'search';

interface UIState {
  // Active tab
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  // Treemap state
  treemapColorBy: 'extension' | 'category' | 'depth';
  setTreemapColorBy: (colorBy: 'extension' | 'category' | 'depth') => void;
  treemapCurrentPath: string;
  setTreemapCurrentPath: (path: string) => void;

  // Search state
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Theme (future)
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: 'navigator',
  setActiveTab: (tab) => set({ activeTab: tab }),

  treemapColorBy: 'extension',
  setTreemapColorBy: (colorBy) => set({ treemapColorBy: colorBy }),
  treemapCurrentPath: '/',
  setTreemapCurrentPath: (path) => set({ treemapCurrentPath: path }),

  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  isDarkMode: false,
  toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
}));
