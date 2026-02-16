import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useInventoryStore } from '../../stores/inventoryStore';
import { useUIStore, type MapGroupBy, type GeoJSONLayer } from '../../stores/uiStore';
import { translations } from '../../utils/translations';
import { detectLayerType } from '../../utils/geojsonUtils';
import { MapPin, Upload } from 'lucide-react';
import type { InventoryEntry } from '../../types/inventory';

// -------------------------------------------------------------------
// Color palettes
// -------------------------------------------------------------------

const PROJECT_COLORS: Record<string, string> = {
  'Camera Trap Project': '#22c55e',
  'Jaguar Monitoring': '#eab308',
  'LIFEPLAN': '#3b82f6',
  'OFFSPRING': '#f97316',
  'FLARE': '#ef4444',
  'Insect Monitoring': '#a855f7',
  'Dolphin Monitoring': '#06b6d4',
  'Climate Monitoring': '#64748b',
  _other: '#9ca3af',
};

const DATA_TYPE_COLORS: Record<string, string> = {
  photo: '#3b82f6',
  video: '#a855f7',
  audio: '#22c55e',
  document: '#f97316',
  data: '#06b6d4',
  config: '#64748b',
  _other: '#9ca3af',
};

function getColor(groupBy: MapGroupBy, key: string): string {
  const palette = groupBy === 'project' ? PROJECT_COLORS : DATA_TYPE_COLORS;
  return palette[key] || palette._other;
}

// -------------------------------------------------------------------
// Station aggregation
// -------------------------------------------------------------------

interface StationInfo {
  lat: number;
  lon: number;
  name: string;
  fileCount: number;
  projects: Record<string, number>;
  dataTypes: Record<string, number>;
  speciesSet: Set<string>;
}

function aggregateStations(entries: InventoryEntry[]): StationInfo[] {
  const stationMap = new Map<string, StationInfo>();

  for (const entry of entries) {
    const lat = entry.metadata?.xref_latitude;
    const lon = entry.metadata?.xref_longitude;
    if (!lat || !lon) continue;

    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (isNaN(latNum) || isNaN(lonNum)) continue;

    // Round to 4 decimal places (~11m precision) to group nearby points
    const key = `${latNum.toFixed(4)},${lonNum.toFixed(4)}`;

    let station = stationMap.get(key);
    if (!station) {
      // Try to derive station name from camera_id or path
      const cameraId = entry.metadata?.camera_id || '';
      const stationMatch = entry.path.match(/\b([HMP]\d{3,4})/i);
      const name = cameraId || (stationMatch ? stationMatch[1].toUpperCase() : key);

      station = {
        lat: latNum,
        lon: lonNum,
        name,
        fileCount: 0,
        projects: {},
        dataTypes: {},
        speciesSet: new Set(),
      };
      stationMap.set(key, station);
    }

    station.fileCount++;

    const project = entry.metadata?.project || 'Unknown';
    station.projects[project] = (station.projects[project] || 0) + 1;

    const dataType = entry.metadata?.data_type || 'other';
    station.dataTypes[dataType] = (station.dataTypes[dataType] || 0) + 1;

    const species = entry.metadata?.taxa_interpreted || entry.metadata?.taxa_verbatim;
    if (species) station.speciesSet.add(species);
  }

  return Array.from(stationMap.values());
}

function stationsToGeoJSON(
  stations: StationInfo[],
  groupBy: MapGroupBy
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations.map((s) => {
      const groups = groupBy === 'project' ? s.projects : s.dataTypes;
      let dominant = '_other';
      let maxCount = 0;
      for (const [k, v] of Object.entries(groups)) {
        if (v > maxCount) {
          dominant = k;
          maxCount = v;
        }
      }

      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: {
          name: s.name,
          fileCount: s.fileCount,
          color: getColor(groupBy, dominant),
          dominant,
          radius: Math.max(6, Math.min(20, 4 + Math.log2(s.fileCount) * 2)),
          speciesCount: s.speciesSet.size,
          projects: JSON.stringify(s.projects),
          dataTypes: JSON.stringify(s.dataTypes),
        },
      };
    }),
  };
}

// -------------------------------------------------------------------
// Legend helpers
// -------------------------------------------------------------------

function buildLegendItems(
  stations: StationInfo[],
  groupBy: MapGroupBy
): { label: string; color: string; count: number }[] {
  const totals: Record<string, number> = {};
  for (const s of stations) {
    const groups = groupBy === 'project' ? s.projects : s.dataTypes;
    for (const [k, v] of Object.entries(groups)) {
      totals[k] = (totals[k] || 0) + v;
    }
  }

  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label,
      color: getColor(groupBy, label),
      count,
    }));
}

// -------------------------------------------------------------------
// Layer style config
// -------------------------------------------------------------------

const OVERLAY_STYLES: Record<
  GeoJSONLayer['layerType'],
  { fillColor?: string; fillOpacity?: number; lineColor: string; lineWidth: number; lineDash?: number[] }
> = {
  buffer: {
    fillColor: '#f59e0b',
    fillOpacity: 0.08,
    lineColor: '#f59e0b',
    lineWidth: 1.5,
    lineDash: [4, 4],
  },
  boundary: {
    fillColor: '#ef4444',
    fillOpacity: 0.1,
    lineColor: '#ef4444',
    lineWidth: 2,
  },
  trails: {
    lineColor: '#fbbf24',
    lineWidth: 1.5,
    lineDash: [6, 3],
  },
  waypoints: {
    lineColor: '#06b6d4',
    lineWidth: 1,
  },
  other: {
    lineColor: '#9ca3af',
    lineWidth: 1,
  },
};

// -------------------------------------------------------------------
// MapView Component
// -------------------------------------------------------------------

export function MapView() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const { entries } = useInventoryStore();
  const { language, mapGroupBy, setMapGroupBy, geojsonLayers, addGeoJSONLayers, toggleLayerVisibility } = useUIStore();
  const t = translations[language];

  const stations = useMemo(() => aggregateStations(entries), [entries]);
  const stationGeoJSON = useMemo(() => stationsToGeoJSON(stations, mapGroupBy), [stations, mapGroupBy]);
  const legendItems = useMemo(() => buildLegendItems(stations, mapGroupBy), [stations, mapGroupBy]);

  // GeoJSON drop handler for Map tab
  const handleGeoJSONDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.toLowerCase().endsWith('.geojson')
      );
      if (files.length === 0) return;

      const layers: GeoJSONLayer[] = [];
      Promise.all(
        files.map(
          (file) =>
            new Promise<void>((resolve) => {
              const reader = new FileReader();
              reader.onload = (ev) => {
                try {
                  const data = JSON.parse(ev.target?.result as string);
                  if (data.type === 'FeatureCollection') {
                    layers.push({
                      name: file.name.replace(/\.geojson$/i, ''),
                      data,
                      visible: true,
                      layerType: detectLayerType(file.name, data),
                    });
                  }
                } catch { /* skip */ }
                resolve();
              };
              reader.onerror = () => resolve();
              reader.readAsText(file);
            })
        )
      ).then(() => {
        if (layers.length > 0) addGeoJSONLayers(layers);
      });
    },
    [addGeoJSONLayers]
  );

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'esri-satellite': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            attribution: 'Tiles &copy; Esri',
            maxzoom: 19,
          },
        },
        layers: [
          {
            id: 'satellite',
            type: 'raster',
            source: 'esri-satellite',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: [-76.15, -0.635],
      zoom: 13,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Add/update station markers when data or grouping changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const sourceId = 'stations';
    const circleLayerId = 'station-circles';
    const labelLayerId = 'station-labels';

    // Remove existing layers/source
    if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
    if (map.getLayer(circleLayerId)) map.removeLayer(circleLayerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    if (stationGeoJSON.features.length === 0) return;

    map.addSource(sourceId, { type: 'geojson', data: stationGeoJSON });

    map.addLayer({
      id: circleLayerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': ['get', 'radius'],
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-opacity': 0.85,
      },
    });

    map.addLayer({
      id: labelLayerId,
      type: 'symbol',
      source: sourceId,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-offset': [0, 1.8],
        'text-anchor': 'top',
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#000000',
        'text-halo-width': 1.5,
      },
    });

    // Popup on click
    map.on('click', circleLayerId, (e) => {
      const feature = e.features?.[0];
      if (!feature || !feature.properties) return;

      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      const props = feature.properties;
      const projects = JSON.parse(props.projects || '{}') as Record<string, number>;
      const dataTypes = JSON.parse(props.dataTypes || '{}') as Record<string, number>;

      const groups = mapGroupBy === 'project' ? projects : dataTypes;
      const groupLines = Object.entries(groups)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `<div class="flex justify-between gap-4"><span class="text-gray-300">${k}</span><span class="text-white font-medium">${v.toLocaleString()}</span></div>`)
        .join('');

      const speciesLine = props.speciesCount > 0
        ? `<div class="mt-1 text-xs text-emerald-400">${props.speciesCount} ${t.speciesDetected}</div>`
        : '';

      const html = `
        <div class="text-sm" style="min-width: 180px">
          <div class="font-bold text-white mb-1">${props.name} <span class="text-xs text-gray-400">(${coords[1].toFixed(4)}, ${coords[0].toFixed(4)})</span></div>
          <div class="text-gray-300 mb-2">${Number(props.fileCount).toLocaleString()} ${t.filesCount}</div>
          <div class="border-t border-gray-600 pt-1 space-y-0.5 text-xs">${groupLines}</div>
          ${speciesLine}
        </div>
      `;

      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        className: 'station-popup',
        maxWidth: '280px',
      })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map);
    });

    map.on('mouseenter', circleLayerId, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', circleLayerId, () => {
      map.getCanvas().style.cursor = '';
    });

    // Fit bounds to include all stations
    const bounds = new maplibregl.LngLatBounds();
    for (const feat of stationGeoJSON.features) {
      const c = (feat.geometry as GeoJSON.Point).coordinates;
      bounds.extend([c[0], c[1]]);
    }

    // Also include GeoJSON layers in bounds
    for (const layer of geojsonLayers) {
      if (!layer.visible) continue;
      for (const feat of layer.data.features) {
        extendBoundsFromGeometry(bounds, feat.geometry);
      }
    }

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 16 });
    }
  }, [stationGeoJSON, mapReady, mapGroupBy, t.filesCount, t.speciesDetected, geojsonLayers]);

  // Add/update GeoJSON overlay layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Layer ordering: buffer → boundary → trails → waypoints (bottom to top)
    const order: GeoJSONLayer['layerType'][] = ['buffer', 'boundary', 'trails', 'waypoints', 'other'];

    // Remove old overlay layers
    for (const layerType of order) {
      const fillId = `overlay-fill-${layerType}`;
      const lineId = `overlay-line-${layerType}`;
      const pointId = `overlay-point-${layerType}`;
      const labelId = `overlay-label-${layerType}`;
      if (map.getLayer(labelId)) map.removeLayer(labelId);
      if (map.getLayer(pointId)) map.removeLayer(pointId);
      if (map.getLayer(lineId)) map.removeLayer(lineId);
      if (map.getLayer(fillId)) map.removeLayer(fillId);
      const srcId = `overlay-src-${layerType}`;
      if (map.getSource(srcId)) map.removeSource(srcId);
    }

    // Group layers by type, merging features
    const byType = new Map<GeoJSONLayer['layerType'], GeoJSON.Feature[]>();
    for (const layer of geojsonLayers) {
      if (!layer.visible) continue;
      const arr = byType.get(layer.layerType) || [];
      arr.push(...layer.data.features);
      byType.set(layer.layerType, arr);
    }

    // Add in order (bottom to top), before station layers
    const beforeLayer = map.getLayer('station-circles') ? 'station-circles' : undefined;

    for (const layerType of order) {
      const features = byType.get(layerType);
      if (!features || features.length === 0) continue;

      const srcId = `overlay-src-${layerType}`;
      const style = OVERLAY_STYLES[layerType];
      const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };

      map.addSource(srcId, { type: 'geojson', data: fc });

      if (layerType === 'waypoints') {
        // Point layer with diamond symbols
        map.addLayer(
          {
            id: `overlay-point-${layerType}`,
            type: 'circle',
            source: srcId,
            paint: {
              'circle-radius': 4,
              'circle-color': style.lineColor,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1,
            },
          },
          beforeLayer
        );

        map.addLayer(
          {
            id: `overlay-label-${layerType}`,
            type: 'symbol',
            source: srcId,
            layout: {
              'text-field': ['get', 'name'],
              'text-size': 10,
              'text-offset': [0, 1.2],
              'text-anchor': 'top',
              'text-allow-overlap': false,
            },
            paint: {
              'text-color': '#06b6d4',
              'text-halo-color': '#000000',
              'text-halo-width': 1,
            },
          },
          beforeLayer
        );
      } else if (layerType === 'trails') {
        map.addLayer(
          {
            id: `overlay-line-${layerType}`,
            type: 'line',
            source: srcId,
            paint: {
              'line-color': style.lineColor,
              'line-width': style.lineWidth,
              'line-dasharray': style.lineDash || [],
              'line-opacity': 0.8,
            },
          },
          beforeLayer
        );
      } else {
        // Polygon layers (boundary, buffer)
        if (style.fillColor) {
          map.addLayer(
            {
              id: `overlay-fill-${layerType}`,
              type: 'fill',
              source: srcId,
              paint: {
                'fill-color': style.fillColor,
                'fill-opacity': style.fillOpacity ?? 0.1,
              },
            },
            beforeLayer
          );
        }

        map.addLayer(
          {
            id: `overlay-line-${layerType}`,
            type: 'line',
            source: srcId,
            paint: {
              'line-color': style.lineColor,
              'line-width': style.lineWidth,
              'line-dasharray': style.lineDash || [],
            },
          },
          beforeLayer
        );
      }
    }
  }, [geojsonLayers, mapReady]);

  // No geo data message
  if (stations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-gray-500">
        <MapPin className="w-16 h-16 mb-4 text-gray-300" />
        <p className="text-lg font-medium">{t.noGeoData}</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* Map container */}
      <div
        ref={mapContainerRef}
        className="absolute inset-0"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={handleGeoJSONDrop}
      />

      {/* Legend panel */}
      <div className="absolute top-3 right-3 bg-gray-900/90 text-white rounded-lg shadow-lg p-3 max-w-[220px] text-xs backdrop-blur-sm z-10">
        {/* Grouping dropdown */}
        <div className="flex items-center gap-2 mb-2">
          <label className="text-gray-400 whitespace-nowrap">{t.groupBy}:</label>
          <select
            value={mapGroupBy}
            onChange={(e) => setMapGroupBy(e.target.value as MapGroupBy)}
            className="bg-gray-800 text-white border border-gray-700 rounded px-1.5 py-0.5 text-xs flex-1"
          >
            <option value="project">{t.groupByProject}</option>
            <option value="dataType">{t.groupByDataType}</option>
          </select>
        </div>

        {/* Color legend */}
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {legendItems.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="flex-1 truncate text-gray-300">{item.label}</span>
              <span className="text-gray-500 tabular-nums">{item.count.toLocaleString()}</span>
            </div>
          ))}
        </div>

        {/* GeoJSON layer toggles */}
        {geojsonLayers.length > 0 && (
          <>
            <div className="border-t border-gray-700 mt-2 pt-2">
              <div className="text-gray-400 mb-1">{t.layers}</div>
              {geojsonLayers.map((layer) => (
                <label key={layer.name} className="flex items-center gap-2 cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={layer.visible}
                    onChange={() => toggleLayerVisibility(layer.name)}
                    className="w-3 h-3 accent-blue-500"
                  />
                  <span className="truncate text-gray-300">{layer.name}</span>
                </label>
              ))}
            </div>
          </>
        )}

        {/* Drop hint when no layers loaded */}
        {geojsonLayers.length === 0 && (
          <div className="border-t border-gray-700 mt-2 pt-2 text-gray-500 flex items-center gap-1">
            <Upload className="w-3 h-3" />
            <span>{t.dropGeoJSON}</span>
          </div>
        )}
      </div>

      {/* Popup styles */}
      <style>{`
        .station-popup .maplibregl-popup-content {
          background: rgba(17, 24, 39, 0.95);
          border: 1px solid rgba(75, 85, 99, 0.5);
          border-radius: 8px;
          padding: 10px 12px;
          color: white;
          backdrop-filter: blur(8px);
        }
        .station-popup .maplibregl-popup-tip {
          border-top-color: rgba(17, 24, 39, 0.95);
        }
        .station-popup .maplibregl-popup-close-button {
          color: #9ca3af;
          font-size: 16px;
          padding: 2px 6px;
        }
        .station-popup .maplibregl-popup-close-button:hover {
          color: white;
          background: transparent;
        }
      `}</style>
    </div>
  );
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function isValidLngLat(coord: number[]): boolean {
  return coord.length >= 2
    && isFinite(coord[0]) && isFinite(coord[1])
    && coord[0] >= -180 && coord[0] <= 180
    && coord[1] >= -90 && coord[1] <= 90;
}

function extendBoundsFromGeometry(bounds: maplibregl.LngLatBounds, geometry: GeoJSON.Geometry) {
  if (!geometry) return;

  const tryExtend = (coord: number[]) => {
    if (isValidLngLat(coord)) bounds.extend(coord as [number, number]);
  };

  switch (geometry.type) {
    case 'Point':
      tryExtend(geometry.coordinates);
      break;
    case 'MultiPoint':
    case 'LineString':
      for (const coord of geometry.coordinates) tryExtend(coord);
      break;
    case 'MultiLineString':
    case 'Polygon':
      for (const ring of geometry.coordinates)
        for (const coord of ring) tryExtend(coord);
      break;
    case 'MultiPolygon':
      for (const poly of geometry.coordinates)
        for (const ring of poly)
          for (const coord of ring) tryExtend(coord);
      break;
  }
}
