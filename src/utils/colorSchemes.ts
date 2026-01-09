export const FILE_TYPE_COLORS: Record<string, string> = {
  // Images - Green spectrum
  '.jpg': '#4CAF50',
  '.jpeg': '#4CAF50',
  '.png': '#66BB6A',
  '.gif': '#81C784',
  '.tif': '#43A047',
  '.tiff': '#43A047',
  '.bmp': '#A5D6A7',
  '.raw': '#388E3C',
  '.cr2': '#388E3C',
  '.nef': '#388E3C',
  '.webp': '#2E7D32',

  // Audio - Blue spectrum
  '.wav': '#2196F3',
  '.mp3': '#42A5F5',
  '.dat': '#1E88E5',  // Common for bioacoustic data
  '.flac': '#64B5F6',
  '.aac': '#1976D2',
  '.ogg': '#0D47A1',
  '.m4a': '#1565C0',

  // Video - Orange spectrum
  '.mp4': '#FF9800',
  '.avi': '#FFB74D',
  '.mov': '#FFA726',
  '.mkv': '#FFCC80',
  '.wmv': '#F57C00',
  '.webm': '#E65100',
  '.m4v': '#FF8F00',

  // Documents - Purple spectrum
  '.pdf': '#9C27B0',
  '.doc': '#AB47BC',
  '.docx': '#AB47BC',
  '.xlsx': '#7B1FA2',
  '.xls': '#7B1FA2',
  '.pptx': '#CE93D8',
  '.ppt': '#CE93D8',
  '.txt': '#E1BEE7',

  // Data files - Teal spectrum
  '.csv': '#009688',
  '.json': '#26A69A',
  '.xml': '#4DB6AC',
  '.gdb': '#00796B',
  '.sqlite': '#00695C',
  '.db': '#004D40',

  // Code - Gray spectrum
  '.py': '#607D8B',
  '.js': '#78909C',
  '.ts': '#546E7A',
  '.html': '#90A4AE',
  '.css': '#B0BEC5',
  '.java': '#455A64',
  '.cpp': '#37474F',
  '.c': '#263238',
  '.r': '#455A64',

  // Archives - Brown spectrum
  '.zip': '#795548',
  '.rar': '#8D6E63',
  '.7z': '#6D4C41',
  '.tar': '#5D4037',
  '.gz': '#4E342E',

  // Folders - Amber
  folder: '#FFC107',

  // Default
  default: '#9E9E9E',
};

export const CATEGORY_COLORS: Record<string, string> = {
  images: '#4CAF50',
  audio: '#2196F3',
  video: '#FF9800',
  documents: '#9C27B0',
  data: '#009688',
  code: '#607D8B',
  archives: '#795548',
  other: '#9E9E9E',
};

export function getColorByExtension(ext: string | null): string {
  if (!ext) return FILE_TYPE_COLORS.default;
  const normalized = ext.toLowerCase().startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return FILE_TYPE_COLORS[normalized] || FILE_TYPE_COLORS.default;
}

export function getCategory(ext: string | null): string {
  if (!ext) return 'other';

  const normalized = ext.toLowerCase().replace('.', '');

  const categories: Record<string, string[]> = {
    images: ['jpg', 'jpeg', 'png', 'gif', 'tif', 'tiff', 'bmp', 'raw', 'cr2', 'nef', 'webp', 'svg', 'ico'],
    audio: ['wav', 'mp3', 'dat', 'flac', 'aac', 'ogg', 'm4a', 'wma'],
    video: ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'webm', 'm4v', 'flv', 'mpeg', 'mpg'],
    documents: ['pdf', 'doc', 'docx', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'rtf', 'odt'],
    data: ['csv', 'json', 'xml', 'gdb', 'sqlite', 'db', 'sql', 'yaml', 'yml'],
    code: ['py', 'js', 'ts', 'html', 'css', 'java', 'cpp', 'c', 'h', 'r', 'jsx', 'tsx', 'vue', 'php'],
    archives: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
  };

  for (const [category, extensions] of Object.entries(categories)) {
    if (extensions.includes(normalized)) {
      return category;
    }
  }

  return 'other';
}

export function getColorByCategory(ext: string | null): string {
  const category = getCategory(ext);
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
}

// Treemap color scale based on depth
export function getDepthColor(depth: number, maxDepth: number = 10): string {
  const hue = 210; // Blue base
  const saturation = 50 + (depth / maxDepth) * 30;
  const lightness = 70 - (depth / maxDepth) * 40;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
