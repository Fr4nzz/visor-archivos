import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import Papa from 'papaparse';
import { useInventoryStore } from '../../stores/inventoryStore';
import { useUIStore, type GeoJSONLayer } from '../../stores/uiStore';
import { translations } from '../../utils/translations';
import { detectLayerType } from '../../utils/geojsonUtils';

interface DropZoneProps {
  onFileLoaded: (file: File, headers: string[], preview: Record<string, string>[]) => void;
}

export function DropZone({ onFileLoaded }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isLoading } = useInventoryStore();
  const { language, addGeoJSONLayers } = useUIStore();
  const t = translations[language];

  const handleGeoJSONFiles = useCallback((files: File[]) => {
    const layers: GeoJSONLayer[] = [];

    Promise.all(
      files.map(
        (file) =>
          new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              try {
                const data = JSON.parse(e.target?.result as string);
                if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
                  const layerType = detectLayerType(file.name, data);
                  layers.push({
                    name: file.name.replace(/\.geojson$/i, ''),
                    data,
                    visible: true,
                    layerType,
                  });
                }
              } catch {
                // Skip invalid JSON files silently
              }
              resolve();
            };
            reader.onerror = () => resolve();
            reader.readAsText(file);
          })
      )
    ).then(() => {
      if (layers.length > 0) {
        addGeoJSONLayers(layers);
      }
    });
  }, [addGeoJSONLayers]);

  const handleFile = useCallback((file: File) => {
    setError(null);

    if (!file.name.endsWith('.csv')) {
      setError(t.pleaseUploadCSV);
      return;
    }

    // Parse just the first few rows to get headers and preview
    Papa.parse(file, {
      header: true,
      preview: 10,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setError(`Error parsing CSV: ${results.errors[0].message}`);
          return;
        }

        const headers = results.meta.fields || [];
        if (headers.length === 0) {
          setError('CSV file appears to be empty or has no headers');
          return;
        }

        onFileLoaded(file, headers, results.data as Record<string, string>[]);
      },
      error: (err) => {
        setError(`Error reading file: ${err.message}`);
      },
    });
  }, [onFileLoaded, t.pleaseUploadCSV]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const csvFile = files.find((f) => f.name.toLowerCase().endsWith('.csv'));
    const geojsonFiles = files.filter((f) => f.name.toLowerCase().endsWith('.geojson'));

    // Process GeoJSON files alongside CSV
    if (geojsonFiles.length > 0) {
      handleGeoJSONFiles(geojsonFiles);
    }

    if (csvFile) {
      handleFile(csvFile);
    } else if (geojsonFiles.length === 0) {
      setError(t.pleaseUploadCSV);
    }
  }, [handleFile, handleGeoJSONFiles, t.pleaseUploadCSV]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the drop zone entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragging(false);
    }
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        className={clsx(
          'w-full max-w-2xl p-12 border-2 border-dashed rounded-xl transition-all cursor-pointer',
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50',
          isLoading && 'pointer-events-none opacity-50'
        )}
      >
        <input
          type="file"
          accept=".csv"
          onChange={handleInputChange}
          className="hidden"
          id="file-input"
          disabled={isLoading}
        />
        <label
          htmlFor="file-input"
          className="flex flex-col items-center justify-center cursor-pointer"
        >
          <div className={clsx(
            'w-16 h-16 rounded-full flex items-center justify-center mb-4',
            isDragging ? 'bg-blue-100' : 'bg-gray-100'
          )}>
            {isDragging ? (
              <FileSpreadsheet className="w-8 h-8 text-blue-600" />
            ) : (
              <Upload className="w-8 h-8 text-gray-600" />
            )}
          </div>

          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {isDragging ? t.dropFile : t.dragDropTitle}
          </h2>

          <p className="text-gray-500 text-center mb-2">
            {t.clickToBrowse}
          </p>

          <p className="text-sm text-gray-400 mb-1">
            {t.supportsFiles}
          </p>

          <p className="text-xs text-gray-400">
            {t.orDropGeoJSON}
          </p>
        </label>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          {t.noInventoryFile}{' '}
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {t.learnHow}
          </a>
        </p>
      </div>
    </div>
  );
}
