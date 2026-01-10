import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
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
  type: 'text' | 'select' | 'dateRange';
  dateFrom?: string;
  dateTo?: string;
}

type FilterType = 'text' | 'dropdown' | 'date';

interface ColumnDef {
  key: string;
  label: string;
  labelEs: string;
  width: number;
  metadata?: boolean;
  filterType?: FilterType;
}

// Available columns
const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name', labelEs: 'Nombre', width: 250 },
  { key: 'path', label: 'Path', labelEs: 'Ruta', width: 400 },
  { key: 'type', label: 'Type', labelEs: 'Tipo', width: 80, filterType: 'dropdown' },
  { key: 'extension', label: 'Ext', labelEs: 'Ext', width: 70, filterType: 'dropdown' },
  { key: 'size', label: 'Size', labelEs: 'Tamaño', width: 100 },
  { key: 'modified', label: 'Modified', labelEs: 'Modificado', width: 150 },
  // Taxonomy columns
  { key: 'taxa_verbatim', label: 'Taxon (Original)', labelEs: 'Taxón (Original)', width: 180, metadata: true, filterType: 'dropdown' },
  { key: 'taxa_interpreted', label: 'Taxon (Interpreted)', labelEs: 'Taxón (Interpretado)', width: 180, metadata: true, filterType: 'dropdown' },
  { key: 'taxa_kingdom', label: 'Kingdom', labelEs: 'Reino', width: 100, metadata: true, filterType: 'dropdown' },
  { key: 'taxa_phylum', label: 'Phylum', labelEs: 'Filo', width: 100, metadata: true, filterType: 'dropdown' },
  { key: 'taxa_class', label: 'Class', labelEs: 'Clase', width: 100, metadata: true, filterType: 'dropdown' },
  { key: 'taxa_order', label: 'Order', labelEs: 'Orden', width: 100, metadata: true, filterType: 'dropdown' },
  { key: 'taxa_family', label: 'Family', labelEs: 'Familia', width: 120, metadata: true, filterType: 'dropdown' },
  { key: 'taxa_genus', label: 'Genus', labelEs: 'Género', width: 120, metadata: true, filterType: 'dropdown' },
  { key: 'taxa_common_name', label: 'Common Name', labelEs: 'Nombre Común', width: 150, metadata: true, filterType: 'dropdown' },
  // Equipment & Location
  { key: 'project', label: 'Project', labelEs: 'Proyecto', width: 150, metadata: true, filterType: 'dropdown' },
  { key: 'location', label: 'Location', labelEs: 'Ubicación', width: 120, metadata: true, filterType: 'dropdown' },
  { key: 'zone', label: 'Zone', labelEs: 'Zona', width: 100, metadata: true, filterType: 'dropdown' },
  { key: 'equipment', label: 'Equipment', labelEs: 'Equipo', width: 120, metadata: true, filterType: 'dropdown' },
  { key: 'data_type', label: 'Data Type', labelEs: 'Tipo Datos', width: 100, metadata: true, filterType: 'dropdown' },
  // Date fields
  { key: 'extracted_date', label: 'Extracted Date', labelEs: 'Fecha Extraída', width: 120, metadata: true, filterType: 'date' },
  { key: 'date_precision', label: 'Date Precision', labelEs: 'Precisión Fecha', width: 100, metadata: true, filterType: 'dropdown' },
  { key: 'date_format_hint', label: 'Date Format', labelEs: 'Formato Fecha', width: 120, metadata: true, filterType: 'dropdown' },
  // Other
  { key: 'camera_id', label: 'Camera', labelEs: 'Cámara', width: 100, metadata: true, filterType: 'dropdown' },
];

export function DataTableView() {
  const { entries } = useInventoryStore();
  const { language } = useUIStore();

  const [sort, setSort] = useState<SortConfig>({ column: '', direction: null });
  const [filters, setFilters] = useState<ColumnFilter[]>([]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null);
  const [dropdownSearch, setDropdownSearch] = useState<string>('');
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(COLUMNS.filter(c => !c.metadata).map(c => c.key))
  );

  // Column widths state (for resizing)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const widths: Record<string, number> = {};
    COLUMNS.forEach(col => {
      widths[col.key] = col.width;
    });
    return widths;
  });

  // Resizing state
  const [resizing, setResizing] = useState<{ column: string; startX: number; startWidth: number } | null>(null);

  const parentRef = useRef<HTMLDivElement>(null);

  // Handle column resize start
  const handleResizeStart = useCallback((e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({
      column: columnKey,
      startX: e.clientX,
      startWidth: columnWidths[columnKey],
    });
  }, [columnWidths]);

  // Handle mouse move during resize
  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizing) return;
    const delta = e.clientX - resizing.startX;
    const newWidth = Math.max(50, resizing.startWidth + delta);
    setColumnWidths(prev => ({
      ...prev,
      [resizing.column]: newWidth,
    }));
  }, [resizing]);

  // Handle mouse up to end resize
  const handleResizeEnd = useCallback(() => {
    setResizing(null);
  }, []);

  // Add/remove event listeners for resizing
  useEffect(() => {
    if (resizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [resizing, handleResizeMove, handleResizeEnd]);

  // Reset dropdown search when filter column changes
  useEffect(() => {
    setDropdownSearch('');
  }, [activeFilterColumn]);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (activeFilterColumn && !(e.target as Element).closest('.filter-dropdown-container')) {
        setActiveFilterColumn(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeFilterColumn]);

  // Get cell value helper
  const getCellValue = useCallback((entry: InventoryEntry, column: string): string | number | null => {
    switch (column) {
      case 'name': return entry.name;
      case 'path': return entry.path;
      case 'type': return entry.type;
      case 'extension': return entry.extension;
      case 'size': return entry.size;
      case 'modified': return entry.modified;
      // Taxonomy
      case 'taxa_verbatim': return entry.metadata?.taxa_verbatim || null;
      case 'taxa_interpreted': return entry.metadata?.taxa_interpreted || null;
      case 'taxa_kingdom': return entry.metadata?.taxa_kingdom || null;
      case 'taxa_phylum': return entry.metadata?.taxa_phylum || null;
      case 'taxa_class': return entry.metadata?.taxa_class || null;
      case 'taxa_order': return entry.metadata?.taxa_order || null;
      case 'taxa_family': return entry.metadata?.taxa_family || null;
      case 'taxa_genus': return entry.metadata?.taxa_genus || null;
      case 'taxa_common_name': return entry.metadata?.taxa_common_name || null;
      // Equipment & Location
      case 'species': return entry.metadata?.species || null;
      case 'project': return entry.metadata?.project || null;
      case 'location': return entry.metadata?.location || null;
      case 'zone': return entry.metadata?.zone || null;
      case 'equipment': return entry.metadata?.equipment || null;
      case 'data_type': return entry.metadata?.data_type || null;
      // Date fields
      case 'extracted_date': return entry.metadata?.extracted_date || null;
      case 'date_precision': return entry.metadata?.date_precision || null;
      case 'date_format_hint': return entry.metadata?.date_format_hint || null;
      // Other
      case 'camera_id': return entry.metadata?.camera_id || null;
      default: return null;
    }
  }, []);

  // Date range filter state
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Get unique values for dropdown filters (memoized)
  const uniqueValuesCache = useMemo(() => {
    const cache: Record<string, string[]> = {};
    const dropdownCols = COLUMNS.filter(c => c.filterType === 'dropdown').map(c => c.key);

    for (const col of dropdownCols) {
      const values = new Set<string>();
      // Sample entries for performance
      const sample = entries.slice(0, 50000);
      for (const entry of sample) {
        const val = (() => {
          switch (col) {
            case 'type': return entry.type;
            case 'extension': return entry.extension;
            case 'taxa_verbatim': return entry.metadata?.taxa_verbatim;
            case 'taxa_kingdom': return entry.metadata?.taxa_kingdom;
            case 'taxa_phylum': return entry.metadata?.taxa_phylum;
            case 'taxa_class': return entry.metadata?.taxa_class;
            case 'taxa_order': return entry.metadata?.taxa_order;
            case 'taxa_family': return entry.metadata?.taxa_family;
            case 'taxa_genus': return entry.metadata?.taxa_genus;
            case 'taxa_interpreted': return entry.metadata?.taxa_interpreted;
            case 'taxa_common_name': return entry.metadata?.taxa_common_name;
            case 'date_precision': return entry.metadata?.date_precision;
            case 'date_format_hint': return entry.metadata?.date_format_hint;
            case 'project': return entry.metadata?.project;
            case 'location': return entry.metadata?.location;
            case 'zone': return entry.metadata?.zone;
            case 'equipment': return entry.metadata?.equipment;
            case 'data_type': return entry.metadata?.data_type;
            case 'camera_id': return entry.metadata?.camera_id;
            default: return null;
          }
        })();
        if (val) values.add(val);
      }
      cache[col] = Array.from(values).sort();
    }
    return cache;
  }, [entries]);

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
          entry.metadata?.taxa_interpreted?.toLowerCase().includes(search) ||
          entry.metadata?.taxa_common_name?.toLowerCase().includes(search) ||
          entry.metadata?.project?.toLowerCase().includes(search) ||
          entry.metadata?.location?.toLowerCase().includes(search)
        );
      });
    }

    // Apply date range filter
    if (dateFrom || dateTo) {
      data = data.filter(entry => {
        const entryDate = entry.metadata?.extracted_date;
        if (!entryDate) return false;
        const dateStr = entryDate.split('T')[0]; // Get just the date part
        if (dateFrom && dateStr < dateFrom) return false;
        if (dateTo && dateStr > dateTo) return false;
        return true;
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
  }, [entries, globalSearch, filters, sort, getCellValue, dateFrom, dateTo]);

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
  const totalWidth = visibleCols.reduce((sum, c) => sum + columnWidths[c.key], 0);

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

          {/* Date range filter */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">{language === 'es' ? 'Fecha:' : 'Date:'}</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded text-xs"
              placeholder={language === 'es' ? 'Desde' : 'From'}
            />
            <span className="text-gray-400">-</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded text-xs"
              placeholder={language === 'es' ? 'Hasta' : 'To'}
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

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
                  className="flex-none relative group filter-dropdown-container"
                  style={{ width: columnWidths[col.key] }}
                >
                  <div
                    className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-100 border-r border-gray-200"
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

                  {/* Resize handle */}
                  <div
                    className={clsx(
                      'absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 transition-colors',
                      resizing?.column === col.key ? 'bg-blue-500' : 'bg-transparent group-hover:bg-blue-300'
                    )}
                    onMouseDown={(e) => handleResizeStart(e, col.key)}
                  />

                  {/* Filter dropdown */}
                  {activeFilterColumn === col.key && col.filterType !== 'date' && (
                    <div
                      className="absolute top-full left-0 z-20 bg-white border border-gray-200 rounded shadow-lg min-w-[180px] max-w-[300px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {col.filterType === 'dropdown' ? (
                        // Searchable dropdown for dropdown columns
                        <div className="p-2">
                          <input
                            type="text"
                            placeholder={language === 'es' ? 'Buscar...' : 'Search...'}
                            value={dropdownSearch}
                            onChange={(e) => setDropdownSearch(e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 mb-2"
                            autoFocus
                          />
                          <div className="max-h-48 overflow-y-auto">
                            {currentFilter?.value && (
                              <button
                                onClick={() => {
                                  handleFilterChange(col.key, '');
                                  setActiveFilterColumn(null);
                                  setDropdownSearch('');
                                }}
                                className="w-full px-2 py-1 text-left text-xs text-red-600 hover:bg-red-50 rounded"
                              >
                                {language === 'es' ? '✕ Limpiar filtro' : '✕ Clear filter'}
                              </button>
                            )}
                            {(uniqueValuesCache[col.key] || [])
                              .filter(val => !dropdownSearch || val.toLowerCase().includes(dropdownSearch.toLowerCase()))
                              .slice(0, 100)
                              .map(val => (
                                <button
                                  key={val}
                                  onClick={() => {
                                    handleFilterChange(col.key, val);
                                    setActiveFilterColumn(null);
                                    setDropdownSearch('');
                                  }}
                                  className={clsx(
                                    'w-full px-2 py-1 text-left text-xs rounded truncate',
                                    currentFilter?.value === val
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'hover:bg-gray-100 text-gray-700'
                                  )}
                                  title={val}
                                >
                                  {val}
                                </button>
                              ))}
                            {(uniqueValuesCache[col.key] || []).filter(val => !dropdownSearch || val.toLowerCase().includes(dropdownSearch.toLowerCase())).length === 0 && (
                              <div className="px-2 py-1 text-xs text-gray-400 italic">
                                {language === 'es' ? 'Sin resultados' : 'No results'}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        // Text input for text columns
                        <div className="p-2">
                          <input
                            type="text"
                            placeholder={language === 'es' ? 'Filtrar...' : 'Filter...'}
                            value={currentFilter?.value || ''}
                            onChange={(e) => handleFilterChange(col.key, e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                            autoFocus
                          />
                        </div>
                      )}
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
                        style={{ width: columnWidths[col.key] }}
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
