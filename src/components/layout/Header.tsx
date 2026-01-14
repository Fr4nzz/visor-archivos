import { FolderOpen, Upload, Globe } from 'lucide-react';
import { useInventoryStore } from '../../stores/inventoryStore';
import { useUIStore } from '../../stores/uiStore';
import { formatSize, formatNumber } from '../../utils/formatters';
import { translations } from '../../utils/translations';

interface HeaderProps {
  onReset?: () => void;
}

export function Header({ onReset }: HeaderProps) {
  const { fileName, stats, reset } = useInventoryStore();
  const { language, setLanguage } = useUIStore();
  const t = translations[language];

  const handleReset = () => {
    reset();
    onReset?.();
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderOpen className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t.appTitle}</h1>
            <p className="text-sm text-gray-500">{t.appSubtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Language Toggle */}
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-gray-500" />
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setLanguage('en')}
                className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                  language === 'en'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLanguage('es')}
                className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                  language === 'es'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                ES
              </button>
            </div>
          </div>

          {fileName && stats && (
            <>
              <div className="w-px h-8 bg-gray-200" />
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{fileName}</p>
                <p className="text-xs text-gray-500">
                  {formatNumber(stats.totalFiles)} {t.files} &bull; {formatNumber(stats.totalFolders)} {t.folders} &bull; {formatSize(stats.totalSize)}
                </p>
              </div>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Upload className="w-4 h-4" />
                {t.uploadNew}
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
