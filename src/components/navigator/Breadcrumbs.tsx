import { ChevronRight, Home } from 'lucide-react';
import { getBreadcrumbs } from '../../utils/treeUtils';

interface BreadcrumbsProps {
  path: string;
  onNavigate: (path: string) => void;
}

export function Breadcrumbs({ path, onNavigate }: BreadcrumbsProps) {
  const breadcrumbs = getBreadcrumbs(path);

  return (
    <div className="flex items-center gap-1 px-4 py-2 bg-gray-50 border-b border-gray-200">
      <button
        onClick={() => onNavigate('/')}
        className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded"
      >
        <Home className="w-4 h-4" />
        Root
      </button>

      {breadcrumbs.map((crumb) => (
        <div key={crumb.path} className="flex items-center">
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <button
            onClick={() => onNavigate(crumb.path)}
            className="px-2 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded truncate max-w-[200px]"
          >
            {crumb.name}
          </button>
        </div>
      ))}
    </div>
  );
}
