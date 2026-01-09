import { ChevronRight, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import type { FlattenedTreeNode } from '../../types/inventory';
import { formatSize, formatNumber, formatPercentage, percentage } from '../../utils/formatters';
import { FileIcon } from '../common/FileIcon';
import { SizeBar } from '../common/SizeBar';
import { getColorByExtension } from '../../utils/colorSchemes';

interface FolderRowProps {
  item: FlattenedTreeNode;
  totalSize: number;
  onToggle: () => void;
}

export function FolderRow({ item, totalSize, onToggle }: FolderRowProps) {
  const isFolder = item.type === 'folder';
  const sizePercent = percentage(item.size, totalSize);

  // Get top extensions for folder
  const topExtensions = isFolder && item.extensionStats
    ? Array.from(item.extensionStats.entries())
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, 4)
        .map(([ext, stats]) => ({
          ext,
          percent: percentage(stats.size, item.size),
        }))
    : [];

  return (
    <div
      className={clsx(
        'flex items-center h-full px-4 border-b border-gray-100 hover:bg-gray-50 transition-colors',
        isFolder && 'cursor-pointer'
      )}
      onClick={isFolder ? onToggle : undefined}
      style={{ paddingLeft: `${item.depth * 24 + 16}px` }}
    >
      {/* Expand/Collapse toggle */}
      <div className="w-5 flex-shrink-0">
        {isFolder && item.hasChildren && (
          item.isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )
        )}
      </div>

      {/* Icon */}
      <FileIcon type={item.type} className="w-5 h-5 flex-shrink-0 mr-2" />

      {/* Name and info */}
      <div className="flex-1 min-w-0 mr-4">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 truncate">{item.name}</span>
          {isFolder && item.fileCount !== undefined && (
            <span className="text-xs text-gray-500">
              {formatNumber(item.fileCount)} files
            </span>
          )}
        </div>

        {/* Extension breakdown for folders */}
        {isFolder && topExtensions.length > 0 && (
          <div className="flex items-center gap-1 mt-0.5">
            {topExtensions.map(({ ext, percent }) => (
              <span
                key={ext}
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: `${getColorByExtension(ext)}20`,
                  color: getColorByExtension(ext),
                }}
              >
                {ext} ({Math.round(percent)}%)
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Size */}
      <div className="w-24 text-right mr-4">
        <span className="text-sm font-medium text-gray-900">{formatSize(item.size)}</span>
      </div>

      {/* Size bar */}
      <div className="w-32">
        <SizeBar percentage={sizePercent} />
        <span className="text-[10px] text-gray-500">{formatPercentage(sizePercent)}</span>
      </div>
    </div>
  );
}
