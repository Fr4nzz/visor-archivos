import { useState, useMemo, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUpDown, ArrowUp, ArrowDown, Filter, X, Search, Download } from 'lucide-react';
import { clsx } from 'clsx';
import { useInventoryStore } from '../../stores/inventoryStore';
import { useUIStore } from '../../stores/uiStore';
import { formatSize } from '../../utils/formatters';
import type { InventoryEntry } from '../../types/inventory';

type SortDirection = 'asc' | 'desc' | null;
type SortConfig = { column: string; direction: SortDirection };

interface ColumnFilter {
  column: string;
  value: string;
  type: 'text' | 'select';
}

// Available columns
const COLUMNS = [
  { key: 'name', label: 'Name', labelEs: 'Nombre', width: 250 },
  { key: 'path', label: 'Path', labelEs: 'Ruta', width: 400 },
  { key: 'type', label: 'Type', labelEs: 'Tipo', width: 80 },
  { key: 'extension', label: 'Ext', labelEs: 'Ext', width: 70 },
  { key: 'size', label: 'Size', labelEs: 'Tamaño', width: 100 },
  { key: 'modified', label: 'Modified', labelEs: 'Modificado', width: 150 },
  { key: 'species', label: 'Species', labelEs: 'Especie', width: 150, metadata: true },
  { key: 'project', label: 'Project', labelEs: 'Proyecto', width: 150, metadata: true },
  { key: 'location', label: 'Location', labelEs: 'Ubicación', width: 120, metadata: true },
  { key: 'zone', label: 'Zone', labelEs: 'Zona', width: 100, metadata: true },
  { key: 'equipment', label: 'Equipment', labelEs: 'Equipo', width: 120, metadata: true },
  { key: 'extracted_date', label: 'Date', labelEs: 'Fecha', width: 120, metadata: true },
  { key: 'data_type', label: 'Data Type', labelEs: 'Tipo Datos', width: 100, metadata: true },
  { key: 'camera_id', label: 'Camera', labelEs: 'Cámara', width: 100, metadata: true },
];

export function DataTableView() {
  const { entries } = useInventoryStore();
  const { language } = useUIStore();

  const [sort, setSort] = useState<SortConfig>({ column: '', direction: null });
  const [filters, setFilters] = useState<ColumnFilter[]>([]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(COLUMNS.filter(c => !c.metadata).map(c => c.key))
  );

  const parentRef = useRef<HTMLDivElement>(null);

  // Get cell value helper
  const getCellValue = useCallback((entry: InventoryEntry, column: string): string | number | null => {
    switch (column) {
      case 'name': return entry.name;
      case 'path': return entry.path;
      case 'type': return entry.type;
      case 'extension': return entry.extension;
      case 'size': return entry.size;
      case 'modified': return entry.modified;
      case 'species': return entry.metadata?.species || null;
      case 'project': return entry.metadata?.project || null;
      case 'location': return entry.metadata?.location || null;
      case 'zone': return entry.metadata?.zone || null;
      case 'equipment': return entry.metadata?.equipment || null;
      case 'extracted_date': return entry.metadata?.extracted_date || null;
      case 'data_type': return entry.metadata?.data_type || null;
      case 'camera_id': return entry.metadata?.camera_id || null;
      default: return null;
    }
  }, []);

  // Filter and sort data
  const filteredData = useMemo(() => {
    let data = [...entries];

    // Apply global search
    if (globalSearch.trim()) {
      const search = globalSearch.toLowerCase();
      data = data.filter(entry => {
        return (
          entry.name.toLowerCase().includes(search) ||
          entry.path.toLowerCase().includes(search) ||
          entry.extension?.toLowerCase().includes(search) ||
          entry.metadata?.species?.toLowerCase().includes(search) ||
          entry.metadata?.project?.toLowerCase().includes(search) ||
          entry.metadata?.location?.toLowerCase().includes(search)
        );
      });
    }

    // Apply column filters
    for (const filter of filters) {
      if (!filter.value) continue;
      const searchValue = filter.value.toLowerCase();
      data = data.filter(entry => {
        const cellValue = getCellValue(entry, filter.column);
        if (cellValue === null) return false;
        return String(cellValue).toLowerCase().includes(searchValue);
      });
    }

    // Apply sorting
    if (sort.column && sort.direction) {
      data.sort((a, b) => {
        const aVal = getCellValue(a, sort.column);
        const bVal = getCellValue(b, sort.column);

        if (aVal === null && bVal === null) return 0;
        if (aVal === null) return 1;
        if (bVal === null) return -1;

        let comparison = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }

        return sort.direction === 'desc' ? -comparison : comparison;
      });
    }

    return data;
  }, [entries, globalSearch, filters, sort, getCellValue]);

  // Virtual row renderer
  const rowVirtualizer = useVirtualizer({
    count: filteredData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });

  // Handle sort
  const handleSort = (column: string) => {
    setSort(prev => {
      if (prev.column !== column) {
        return { column, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { column, direction: 'desc' };
      }
      return { column: '', direction: null };
    });
  };

  // Handle filter change
  const handleFilterChange = (column: string, value: string) => {
    setFilters(prev => {
      const existing = prev.findIndex(f => f.column === column);
      if (existing >= 0) {
        if (!value) {
          return prev.filter((_, i) => i !== existing);
        }
        const updated = [...prev];
        updated[existing] = { ...updated[existing], value };
        return updated;
      }
      if (value) {
        return [...prev, { column, value, type: 'text' }];
      }
      return prev;
    });
  };

  // Toggle column visibility
  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Export filtered data to CSV
  const handleExport = () => {
    const visibleCols = COLUMNS.filter(c => visibleColumns.has(c.key));
    const headers = visibleCols.map(c => c.key).join(',');
    const rows = filteredData.slice(0, 100000).map(entry => {
      return visibleCols.map(col => {
        const val = getCellValue(entry, col.key);
        const strVal = val === null ? '' : String(val);
        // Escape CSV special characters
        if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
          return `"${strVal.replace(/"/g, '""')}"`;
        }
        return strVal;
      }).join(',');
    }).join('\n');

    const csv = `${headers}\n${rows}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'filtered_data.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const visibleCols = COLUMNS.filter(c => visibleColumns.has(c.key));
  const totalWidth = visibleCols.reduce((sum, c) => sum + c.width, 0);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Toolbar */}
      <div className="flex-none p-4 border-b border-gray-200 space-y-3">
        {/* Search and actions row */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={language === 'es' ? 'Buscar en todos los campos...' : 'Search all fields...'}
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {globalSearch && (
              <button
                onClick={() => setGlobalSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
          >
            <Download className="w-4 h-4" />
            {language === 'es' ? 'Exportar' : 'Export'}
          </button>

          <div className="text-sm text-gray-500">
            {filteredData.length.toLocaleString()} / {entries.length.toLocaleString()} {language === 'es' ? 'filas' : 'rows'}
          </div>
        </div>

        {/* Column toggles */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 mr-2">{language === 'es' ? 'Columnas:' : 'Columns:'}</span>
          {COLUMNS.map(col => (
            <button
              key={col.key}
              onClick={() => toggleColumn(col.key)}
              className={clsx(
                'px-2 py-1 text-xs rounded border transition-colors',
                visibleColumns.has(col.key)
                  ? 'bg-blue-100 border-blue-300 text-blue-700'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
              )}
            >
              {language === 'es' ? col.labelEs : col.label}
            </button>
          ))}
        </div>

        {/* Active filters */}
        {filters.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-500">{language === 'es' ? 'Filtros:' : 'Filters:'}</span>
            {filters.map(filter => (
              <span
                key={filter.column}
                className="flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700"
              >
                {COLUMNS.find(c => c.key === filter.column)?.[language === 'es' ? 'labelEs' : 'label']}: {filter.value}
                <button
                  onClick={() => handleFilterChange(filter.column, '')}
                  className="ml-1 hover:text-blue-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              onClick={() => setFilters([])}
              className="text-xs text-red-600 hover:text-red-700"
            >
              {language === 'es' ? 'Limpiar todo' : 'Clear all'}
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden">
        <div
          ref={parentRef}
          className="h-full overflow-auto"
        >
          {/* Header */}
          <div
            className="sticky top-0 z-10 flex bg-gray-50 border-b border-gray-200"
            style={{ minWidth: totalWidth }}
          >
            {visibleCols.map(col => {
              const currentFilter = filters.find(f => f.column === col.key);
              const isSorted = sort.column === col.key;

              return (
                <div
                  key={col.key}
                  className="flex-none border-r border-gray-200 last:border-r-0"
                  style={{ width: col.width }}
                >
                  <div
                    className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="text-xs font-semibold text-gray-700 truncate">
                      {language === 'es' ? col.labelEs : col.label}
                    </span>
                    <div className="flex items-center gap-1">
                      {isSorted ? (
                        sort.direction === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-blue-600" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-blue-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-gray-400" />
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveFilterColumn(activeFilterColumn === col.key ? null : col.key);
                        }}
                        className={clsx(
                          'p-0.5 rounded',
                          currentFilter ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                        )}
                      >
                        <Filter className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Filter dropdown */}
                  {activeFilterColumn === col.key && (
                    <div className="px-2 pb-2 bg-gray-50 border-b border-gray-200">
                      <input
                        type="text"
                        placeholder={language === 'es' ? 'Filtrar...' : 'Filter...'}
                        value={currentFilter?.value || ''}
                        onChange={(e) => handleFilterChange(col.key, e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Virtual rows */}
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
              minWidth: totalWidth,
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const entry = filteredData[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  className={clsx(
                    'absolute top-0 left-0 flex border-b border-gray-100',
                    virtualRow.index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  )}
                  style={{
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                    minWidth: totalWidth,
                  }}
                >
                  {visibleCols.map(col => {
                    const value = getCellValue(entry, col.key);
                    let displayValue: string;

                    if (value === null) {
                      displayValue = '';
                    } else if (col.key === 'size') {
                      displayValue = formatSize(value as number);
                    } else if (col.key === 'type') {
                      displayValue = value === 'file'
                        ? (language === 'es' ? 'Archivo' : 'File')
                        : (language === 'es' ? 'Carpeta' : 'Folder');
                    } else {
                      displayValue = String(value);
                    }

                    return (
                      <div
                        key={col.key}
                        className="flex-none px-3 py-2 text-xs text-gray-700 truncate border-r border-gray-100 last:border-r-0"
                        style={{ width: col.width }}
                        title={displayValue}
                      >
                        {displayValue}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
