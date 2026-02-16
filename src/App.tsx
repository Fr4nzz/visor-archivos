import { useState, useCallback } from 'react';
import { Header } from './components/layout/Header';
import { TabNavigation } from './components/layout/TabNavigation';
import { DropZone } from './components/upload/DropZone';
import { ColumnMapper } from './components/upload/ColumnMapper';
import { LoadingProgress } from './components/upload/LoadingProgress';
import { FolderTree } from './components/navigator/FolderTree';
import { TreemapView } from './components/treemap/TreemapView';
import { StatsDashboard } from './components/stats/StatsDashboard';
import { SearchView } from './components/search/SearchView';
import { DataTableView } from './components/data/DataTableView';
import { MapView } from './components/map/MapView';
import { useInventoryStore } from './stores/inventoryStore';
import { useUIStore } from './stores/uiStore';
import type { ColumnMapping } from './types/inventory';
import './index.css';

type AppState = 'upload' | 'mapping' | 'loading' | 'ready';

function App() {
  const {
    folderTree,
    columnMapping,
    loadingProgress,
    loadingStage,
    setCSVHeaders,
    setColumnMapping,
    setLoadingState,
    setError,
    setData,
  } = useInventoryStore();

  const { activeTab } = useUIStore();

  const [appState, setAppState] = useState<AppState>(folderTree ? 'ready' : 'upload');
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [rowsProcessed, setRowsProcessed] = useState(0);

  const handleFileLoaded = useCallback(
    (file: File, headers: string[], preview: Record<string, string>[]) => {
      setCurrentFile(file);
      setCsvHeaders(headers);
      setCsvPreview(preview);
      setCSVHeaders(headers);
      setAppState('mapping');
    },
    [setCSVHeaders]
  );

  const handleMappingConfirmed = useCallback(
    (mapping: ColumnMapping) => {
      if (!currentFile) return;

      setColumnMapping(mapping);
      setAppState('loading');
      setLoadingState(true, 0, 'Starting...');

      // Create Web Worker
      const worker = new Worker(
        new URL('./workers/csvParser.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (e) => {
        const { type, ...data } = e.data;

        switch (type) {
          case 'progress':
            setLoadingState(true, data.percent, data.stage);
            setRowsProcessed(data.rowsProcessed);
            break;
          case 'complete':
            setData(data.data.entries, data.data.tree, data.data.stats, currentFile.name);
            setAppState('ready');
            worker.terminate();
            break;
          case 'error':
            setError(data.error);
            setAppState('upload');
            worker.terminate();
            break;
        }
      };

      worker.postMessage({
        type: 'parse',
        file: currentFile,
        columnMapping: mapping,
      });
    },
    [currentFile, setColumnMapping, setLoadingState, setData, setError]
  );

  const renderContent = () => {
    switch (appState) {
      case 'upload':
        return <DropZone onFileLoaded={handleFileLoaded} />;

      case 'mapping':
        return (
          <ColumnMapper
            headers={csvHeaders}
            preview={csvPreview}
            onConfirm={handleMappingConfirmed}
            initialMapping={columnMapping}
          />
        );

      case 'loading':
        return (
          <LoadingProgress
            progress={loadingProgress}
            stage={loadingStage}
            rowsProcessed={rowsProcessed}
          />
        );

      case 'ready':
        switch (activeTab) {
          case 'navigator':
            return <FolderTree />;
          case 'treemap':
            return <TreemapView />;
          case 'stats':
            return <StatsDashboard />;
          case 'search':
            return <SearchView />;
          case 'data':
            return <DataTableView />;
          case 'map':
            return <MapView />;
          default:
            return <FolderTree />;
        }
    }
  };

  const handleAppReset = useCallback(() => {
    setAppState('upload');
    setCurrentFile(null);
    setCsvHeaders([]);
    setCsvPreview([]);
  }, []);

  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      <Header onReset={handleAppReset} />
      {appState === 'ready' && <TabNavigation />}
      <main className="flex-1 min-h-0 overflow-auto">{renderContent()}</main>
    </div>
  );
}

export default App;
