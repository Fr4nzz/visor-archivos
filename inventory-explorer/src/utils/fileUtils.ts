/**
 * Get file extension from filename or path
 */
export function getExtension(name: string): string | null {
  const lastDot = name.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0 || lastDot === name.length - 1) {
    return null;
  }
  return name.substring(lastDot).toLowerCase();
}

/**
 * Get parent path from full path
 */
export function getParentPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return '/';
  return normalized.substring(0, lastSlash);
}

/**
 * Get name from path
 */
export function getNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || '/';
}

/**
 * Get depth from path
 */
export function getDepth(path: string): number {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).length;
}

/**
 * Normalize path separators
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Get path segments
 */
export function getPathSegments(path: string): string[] {
  const normalized = normalizePath(path);
  return normalized.split('/').filter(Boolean);
}

/**
 * Generate unique ID for entry
 */
export function generateId(path: string, index: number): string {
  return `${index}-${path.replace(/[^a-zA-Z0-9]/g, '-')}`;
}

/**
 * Download content as file
 */
export function downloadFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate CSV from entries
 */
export function generateCSV(
  entries: Array<Record<string, unknown>>,
  columns?: string[]
): string {
  if (entries.length === 0) return '';

  const headers = columns || Object.keys(entries[0]);
  const rows = entries.map(entry =>
    headers.map(h => {
      const val = entry[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      // Escape quotes and wrap in quotes if contains comma, newline, or quote
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}
