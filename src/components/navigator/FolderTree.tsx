import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FolderMinus, FolderPlus, Eye, EyeOff } from 'lucide-react';
import { useInventoryStore } from '../../stores/inventoryStore';
import { FolderRow } from './FolderRow';

export function FolderTree() {
  const {
    flattenedTree,
    toggleFolder,
    expandAll,
    collapseAll,
    showFiles,
    toggleShowFiles,
    stats,
  } = useInventoryStore();

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: flattenedTree.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 20,
  });

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded"
            title="Expand all folders"
          >
            <FolderPlus className="w-4 h-4" />
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded"
            title="Collapse all folders"
          >
            <FolderMinus className="w-4 h-4" />
            Collapse All
          </button>
          <div className="w-px h-4 bg-gray-300" />
          <button
            onClick={toggleShowFiles}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded"
            title={showFiles ? 'Hide files' : 'Show files'}
          >
            {showFiles ? (
              <>
                <EyeOff className="w-4 h-4" />
                Hide Files
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" />
                Show Files
              </>
            )}
          </button>
        </div>

        <div className="text-xs text-gray-500">
          {flattenedTree.length.toLocaleString()} items visible
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
            const item = flattenedTree[virtualRow.index];
            const totalSize = stats?.totalSize || 1;

            return (
              <div
                key={item.path}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <FolderRow
                  item={item}
                  totalSize={totalSize}
                  onToggle={() => toggleFolder(item.path)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
