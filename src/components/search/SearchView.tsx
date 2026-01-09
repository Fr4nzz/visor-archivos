import { useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, Download, Filter } from 'lucide-react';
import { useInventoryStore } from '../../stores/inventoryStore';
import { formatSize, formatNumber } from '../../utils/formatters';
import { downloadFile, generateCSV } from '../../utils/fileUtils';
import { getColorByExtension } from '../../utils/colorSchemes';
import { FileIcon } from '../common/FileIcon';
import type { Filters } from '../../types/inventory';

const SIZE_OPTIONS = [
  { label: 'Any', value: null },
  { label: '> 1 KB', value: 1024 },
  { label: '> 100 KB', value: 102400 },
  { label: '> 1 MB', value: 1048576 },
  { label: '> 10 MB', value: 10485760 },
  { label: '> 100 MB', value: 104857600 },
  { label: '> 1 GB', value: 1073741824 },
];

const MAX_RESULTS = 10000; // Limit results to prevent UI freeze

export function SearchView() {
  const { entries, stats } = useInventoryStore();
  const [filters, setFilters] = useState<Filters>({
    query: '',
    extensions: [],
    sizeMin: null,
    sizeMax: null,
    dateFrom: null,
    dateTo: null,
    pathContains: '',
  });
  const [showFilters, setShowFilters] = useState(true);

  const parentRef = useRef<HTMLDivElement>(null);

  // Get unique extensions for filter
  const availableExtensions = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.extensionCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 30)
      .map(([ext]) => ext);
  }, [stats]);

  // Check if any filter is active
  const hasActiveFilters =
    filters.query ||
    filters.extensions.length > 0 ||
    filters.sizeMin !== null ||
    filters.pathContains;

  // Filter entries - only process when filters are active to prevent freezing
  const { filteredResults, totalMatchCount, isLimited } = useMemo(() => {
    // If no filters are active, don't process the huge array
    if (!hasActiveFilters) {
      return { filteredResults: [], totalMatchCount: 0, isLimited: false };
    }

    let matchCount = 0;
    const results: typeof entries = [];

    for (const e of entries) {
      if (e.type !== 'file') continue;

      // Apply filters
      if (filters.query) {
        const query = filters.query.toLowerCase();
        if (!e.name.toLowerCase().includes(query) && !e.path.toLowerCase().includes(query)) {
          continue;
        }
      }

      if (filters.extensions.length > 0) {
        if (!filters.extensions.includes(e.extension || 'no-extension')) {
          continue;
        }
      }

      if (filters.sizeMin !== null && e.size < filters.sizeMin) {
        continue;
      }

      if (filters.sizeMax !== null && e.size > filters.sizeMax) {
        continue;
      }

      if (filters.pathContains) {
        const pathQuery = filters.pathContains.toLowerCase();
        if (!e.path.toLowerCase().includes(pathQuery)) {
          continue;
        }
      }

      matchCount++;

      // Only keep up to MAX_RESULTS for rendering
      if (results.length < MAX_RESULTS) {
        results.push(e);
      }
    }

    return {
      filteredResults: results,
      totalMatchCount: matchCount,
      isLimited: matchCount > MAX_RESULTS,
    };
  }, [entries, filters, hasActiveFilters]);

  const virtualizer = useVirtualizer({
    count: filteredResults.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 20,
  });

  const handleExport = () => {
    const data = filteredResults.map((e) => ({
      name: e.name,
      path: e.path,
      type: e.type,
      size: e.size,
      extension: e.extension || '',
      modified: e.modified || '',
      parent: e.parent,
    }));
    const csv = generateCSV(data);
    downloadFile(csv, 'filtered_inventory.csv');
  };

  const toggleExtension = (ext: string) => {
    setFilters((f) => ({
      ...f,
      extensions: f.extensions.includes(ext)
        ? f.extensions.filter((e) => e !== ext)
        : [...f.extensions, ext],
    }));
  };

  const clearFilters = () => {
    setFilters({
      query: '',
      extensions: [],
      sizeMin: null,
      sizeMax: null,
      dateFrom: null,
      dateTo: null,
      pathContains: '',
    });
  };

  return (
    <div className="h-full flex bg-white">
      {/* Filter Panel */}
      {showFilters && (
        <div className="w-72 border-r border-gray-200 p-4 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Filters</h3>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-blue-600 hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Search input */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder="Search files..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Path filter */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Path contains
            </label>
            <input
              type="text"
              value={filters.pathContains}
              onChange={(e) => setFilters((f) => ({ ...f, pathContains: e.target.value }))}
              placeholder="e.g., /MULTIMEDIA/"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Size filter */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Minimum size
            </label>
            <select
              value={filters.sizeMin || ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  sizeMin: e.target.value ? parseInt(e.target.value) : null,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {SIZE_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.value || ''}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Extension filter */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              File types ({filters.extensions.length} selected)
            </label>
            <div className="flex-1 overflow-auto border border-gray-200 rounded-lg p-2">
              <div className="flex flex-wrap gap-1">
                {availableExtensions.map((ext) => {
                  const isSelected = filters.extensions.includes(ext);
                  return (
                    <button
                      key={ext}
                      onClick={() => toggleExtension(ext)}
                      className="px-2 py-1 text-xs rounded transition-colors"
                      style={{
                        backgroundColor: isSelected
                          ? getColorByExtension(ext)
                          : `${getColorByExtension(ext)}20`,
                        color: isSelected ? '#fff' : getColorByExtension(ext),
                      }}
                    >
                      {ext}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={filteredResults.length === 0}
            className="mt-4 flex items-center justify-center gap-2 w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            Export {formatNumber(Math.min(filteredResults.length, MAX_RESULTS))} results
          </button>
          {isLimited && (
            <p className="mt-2 text-xs text-amber-600">
              Showing first {formatNumber(MAX_RESULTS)} of {formatNumber(totalMatchCount)} matches. Use more specific filters.
            </p>
          )}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Results header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded"
            >
              <Filter className="w-4 h-4" />
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
            <span className="text-sm text-gray-500">
              {isLimited
                ? `${formatNumber(totalMatchCount)} results (showing ${formatNumber(MAX_RESULTS)})`
                : `${formatNumber(filteredResults.length)} results`}
            </span>
          </div>
        </div>

        {/* Virtual list */}
        <div ref={parentRef} className="flex-1 overflow-auto">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = filteredResults[virtualRow.index];

              return (
                <div
                  key={item.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex items-center px-4 border-b border-gray-100 hover:bg-gray-50"
                >
                  <FileIcon type={item.type} extension={item.extension} className="w-5 h-5 flex-shrink-0 mr-3" />
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
                    <div className="text-xs text-gray-500 truncate">{item.path}</div>
                  </div>
                  {item.extension && (
                    <span
                      className="text-xs px-2 py-0.5 rounded mr-4"
                      style={{
                        backgroundColor: `${getColorByExtension(item.extension)}20`,
                        color: getColorByExtension(item.extension),
                      }}
                    >
                      {item.extension}
                    </span>
                  )}
                  <span className="text-sm text-gray-700 w-24 text-right">{formatSize(item.size)}</span>
                </div>
              );
            })}
          </div>

          {!hasActiveFilters && (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8">
              <Search className="w-12 h-12 mb-4 text-gray-300" />
              <p className="text-lg font-medium mb-2">Start searching</p>
              <p className="text-sm text-center">
                Use the filters on the left to search through your files.
                <br />
                Try searching by name, path, file type, or size.
              </p>
            </div>
          )}
          {hasActiveFilters && filteredResults.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-500">
              No files match your filters
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
