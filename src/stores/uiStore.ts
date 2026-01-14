import { create } from 'zustand';
import { type Language } from '../utils/translations';

export type TabId = 'navigator' | 'treemap' | 'stats' | 'search' | 'data';
export type TreemapColorBy = 'extension' | 'category' | 'depth' | 'species' | 'project';

interface UIState {
  // Language
  language: Language;
  setLanguage: (lang: Language) => void;

  // Active tab
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  // Treemap state
  treemapColorBy: TreemapColorBy;
  setTreemapColorBy: (colorBy: TreemapColorBy) => void;
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
  language: 'es',
  setLanguage: (lang) => set({ language: lang }),

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
