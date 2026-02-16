import type { GeoJSONLayer } from '../stores/uiStore';

/**
 * Auto-detect layer type from filename and geometry.
 */
export function detectLayerType(
  filename: string,
  data: GeoJSON.FeatureCollection
): GeoJSONLayer['layerType'] {
  const nameLower = filename.toLowerCase();

  // Filename hints
  if (nameLower.includes('buffer') || nameLower.includes('zona')) return 'buffer';
  if (nameLower.includes('area') || nameLower.includes('boundary') || nameLower.includes('limite'))
    return 'boundary';
  if (nameLower.includes('camino') || nameLower.includes('trail') || nameLower.includes('sendero'))
    return 'trails';
  if (nameLower.includes('waypoint') || nameLower.includes('saladero') || nameLower.includes('point'))
    return 'waypoints';

  // Detect from geometry type
  const geomTypes = new Set<string>();
  for (const feature of data.features) {
    if (feature.geometry) {
      geomTypes.add(feature.geometry.type);
    }
  }

  if (geomTypes.has('Point') || geomTypes.has('MultiPoint')) return 'waypoints';
  if (geomTypes.has('LineString') || geomTypes.has('MultiLineString')) return 'trails';
  if (geomTypes.has('Polygon') || geomTypes.has('MultiPolygon')) return 'boundary';

  return 'other';
}
