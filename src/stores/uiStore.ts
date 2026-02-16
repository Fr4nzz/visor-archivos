import { create } from 'zustand';
import { type Language } from '../utils/translations';

export type TabId = 'navigator' | 'treemap' | 'stats' | 'search' | 'data' | 'map';
export type TreemapColorBy = 'extension' | 'category' | 'depth' | 'species' | 'project';
export type MapGroupBy = 'project' | 'dataType';

export interface GeoJSONLayer {
  name: string;
  data: GeoJSON.FeatureCollection;
  visible: boolean;
  layerType: 'boundary' | 'trails' | 'buffer' | 'waypoints' | 'other';
}

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

  // Map state
  mapGroupBy: MapGroupBy;
  setMapGroupBy: (groupBy: MapGroupBy) => void;
  geojsonLayers: GeoJSONLayer[];
  addGeoJSONLayers: (layers: GeoJSONLayer[]) => void;
  toggleLayerVisibility: (name: string) => void;
  clearGeoJSONLayers: () => void;

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

  mapGroupBy: 'project',
  setMapGroupBy: (groupBy) => set({ mapGroupBy: groupBy }),
  geojsonLayers: [],
  addGeoJSONLayers: (layers) =>
    set((state) => ({
      geojsonLayers: [
        ...state.geojsonLayers.filter(
          (existing) => !layers.some((l) => l.name === existing.name)
        ),
        ...layers,
      ],
    })),
  toggleLayerVisibility: (name) =>
    set((state) => ({
      geojsonLayers: state.geojsonLayers.map((l) =>
        l.name === name ? { ...l, visible: !l.visible } : l
      ),
    })),
  clearGeoJSONLayers: () => set({ geojsonLayers: [] }),

  isDarkMode: false,
  toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
}));
