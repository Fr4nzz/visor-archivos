export type Language = 'en' | 'es';

export const translations = {
  en: {
    // Header
    appTitle: 'Inventory Explorer',
    appSubtitle: 'Visualize your file inventory',
    uploadNew: 'Upload New',
    files: 'files',
    folders: 'folders',

    // Navigation tabs
    navigator: 'Navigator',
    treemap: 'Treemap',
    statistics: 'Statistics',
    search: 'Search',

    // Stats Dashboard
    totalFiles: 'Total Files',
    totalSize: 'Total Size',
    foldersLabel: 'Folders',
    fileTypes: 'File Types',
    storageByFileType: 'Storage by File Type',
    filesByType: 'Files by Type',
    bySize: 'By Size',
    byCount: 'By Count',
    fileSizeDistribution: 'File Size Distribution',
    fileCount: 'File Count',
    largestFiles: 'Largest Files',
    largestFolders: 'Largest Folders',
    allFileTypes: 'All File Types',
    extension: 'Extension',
    count: 'Count',
    avgSize: 'Avg Size',
    percentOfTotal: '% of Total',
    noDataLoaded: 'No data loaded',

    // Drop Zone
    dragDropTitle: 'Drag & Drop your inventory CSV',
    dropFile: 'Drop your CSV file',
    clickToBrowse: 'or click to browse your files',
    supportsFiles: 'Supports files up to 500 MB',
    noInventoryFile: "Don't have an inventory file?",
    learnHow: 'Learn how to create one',
    pleaseUploadCSV: 'Please upload a CSV file',

    // Column Mapper
    mapColumns: 'Map Your CSV Columns',
    mapColumnsDesc: "We'll try to auto-detect your columns. Please verify and adjust if needed.",
    yourCsvColumns: 'Your CSV columns:',
    requiredMappings: 'Required Mappings',
    optionalMappings: 'Optional Mappings',
    preview: 'Preview',
    filePath: 'File Path',
    fileSize: 'Size (bytes)',
    itemType: 'Item Type',
    fileName: 'Name',
    extensionField: 'Extension',
    modifiedDate: 'Modified Date',
    parentFolder: 'Parent Folder',
    selectColumn: 'Select column...',
    autoDetected: 'Auto-detected',
    cancel: 'Cancel',
    processFile: 'Process File',

    // Loading
    processingInventory: 'Processing your inventory',
    parsingCsv: 'Parsing CSV...',
    buildingFolderTree: 'Building folder tree...',
    calculatingStatistics: 'Calculating statistics...',
    complete: 'Complete!',
    rows: 'rows',

    // Search
    searchPlaceholder: 'Search files by name, path, or extension...',
    noResults: 'No results found',
    searchTip: 'Try adjusting your search terms',

    // Navigator
    root: 'Root',
    items: 'items',
    empty: 'Empty folder',

    // Treemap
    collapseAll: 'Collapse All',
    colorByExtension: 'Color by Extension',
    colorByCategory: 'Color by Category',
    colorByDepth: 'Color by Depth',
    clickToExpand: 'Click to expand',
  },
  es: {
    // Header
    appTitle: 'Explorador de Inventario',
    appSubtitle: 'Visualiza tu inventario de archivos',
    uploadNew: 'Subir Nuevo',
    files: 'archivos',
    folders: 'carpetas',

    // Navigation tabs
    navigator: 'Navegador',
    treemap: 'Mapa de Árbol',
    statistics: 'Estadísticas',
    search: 'Búsqueda',

    // Stats Dashboard
    totalFiles: 'Total de Archivos',
    totalSize: 'Tamaño Total',
    foldersLabel: 'Carpetas',
    fileTypes: 'Tipos de Archivo',
    storageByFileType: 'Almacenamiento por Tipo',
    filesByType: 'Archivos por Tipo',
    bySize: 'Por Tamaño',
    byCount: 'Por Cantidad',
    fileSizeDistribution: 'Distribución por Tamaño',
    fileCount: 'Cantidad de Archivos',
    largestFiles: 'Archivos más Grandes',
    largestFolders: 'Carpetas más Grandes',
    allFileTypes: 'Todos los Tipos de Archivo',
    extension: 'Extensión',
    count: 'Cantidad',
    avgSize: 'Tamaño Prom.',
    percentOfTotal: '% del Total',
    noDataLoaded: 'Sin datos cargados',

    // Drop Zone
    dragDropTitle: 'Arrastra y suelta tu CSV de inventario',
    dropFile: 'Suelta tu archivo CSV',
    clickToBrowse: 'o haz clic para buscar archivos',
    supportsFiles: 'Soporta archivos hasta 500 MB',
    noInventoryFile: '¿No tienes un archivo de inventario?',
    learnHow: 'Aprende cómo crear uno',
    pleaseUploadCSV: 'Por favor sube un archivo CSV',

    // Column Mapper
    mapColumns: 'Mapea las Columnas del CSV',
    mapColumnsDesc: 'Intentaremos auto-detectar tus columnas. Por favor verifica y ajusta si es necesario.',
    yourCsvColumns: 'Tus columnas CSV:',
    requiredMappings: 'Mapeos Requeridos',
    optionalMappings: 'Mapeos Opcionales',
    preview: 'Vista Previa',
    filePath: 'Ruta del Archivo',
    fileSize: 'Tamaño (bytes)',
    itemType: 'Tipo de Elemento',
    fileName: 'Nombre',
    extensionField: 'Extensión',
    modifiedDate: 'Fecha de Modificación',
    parentFolder: 'Carpeta Padre',
    selectColumn: 'Seleccionar columna...',
    autoDetected: 'Auto-detectado',
    cancel: 'Cancelar',
    processFile: 'Procesar Archivo',

    // Loading
    processingInventory: 'Procesando tu inventario',
    parsingCsv: 'Analizando CSV...',
    buildingFolderTree: 'Construyendo árbol de carpetas...',
    calculatingStatistics: 'Calculando estadísticas...',
    complete: '¡Completo!',
    rows: 'filas',

    // Search
    searchPlaceholder: 'Buscar archivos por nombre, ruta o extensión...',
    noResults: 'No se encontraron resultados',
    searchTip: 'Intenta ajustar los términos de búsqueda',

    // Navigator
    root: 'Raíz',
    items: 'elementos',
    empty: 'Carpeta vacía',

    // Treemap
    collapseAll: 'Contraer Todo',
    colorByExtension: 'Color por Extensión',
    colorByCategory: 'Color por Categoría',
    colorByDepth: 'Color por Profundidad',
    clickToExpand: 'Clic para expandir',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

export function getTranslation(lang: Language, key: TranslationKey): string {
  return translations[lang][key];
}
