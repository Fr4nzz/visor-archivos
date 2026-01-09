import { FolderTree, LayoutGrid, BarChart3, Search } from 'lucide-react';
import { useUIStore, type TabId } from '../../stores/uiStore';
import { clsx } from 'clsx';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: Tab[] = [
  { id: 'navigator', label: 'Navigator', icon: FolderTree },
  { id: 'treemap', label: 'Treemap', icon: LayoutGrid },
  { id: 'stats', label: 'Statistics', icon: BarChart3 },
  { id: 'search', label: 'Search', icon: Search },
];

export function TabNavigation() {
  const { activeTab, setActiveTab } = useUIStore();

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="flex">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2',
                isActive
                  ? 'text-blue-600 border-blue-600 bg-blue-50'
                  : 'text-gray-600 border-transparent hover:text-gray-900 hover:bg-gray-50'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
