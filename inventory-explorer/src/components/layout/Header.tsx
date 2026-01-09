import { FolderOpen, Upload } from 'lucide-react';
import { useInventoryStore } from '../../stores/inventoryStore';
import { formatSize, formatNumber } from '../../utils/formatters';

export function Header() {
  const { fileName, stats, reset } = useInventoryStore();

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderOpen className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Inventory Explorer</h1>
            <p className="text-sm text-gray-500">Visualize your file inventory</p>
          </div>
        </div>

        {fileName && stats && (
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{fileName}</p>
              <p className="text-xs text-gray-500">
                {formatNumber(stats.totalFiles)} files &bull; {formatNumber(stats.totalFolders)} folders &bull; {formatSize(stats.totalSize)}
              </p>
            </div>
            <button
              onClick={reset}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload New
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
