import { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { COLUMN_ALIASES, type ColumnMapping } from '../../types/inventory';
import { useUIStore } from '../../stores/uiStore';
import { translations } from '../../utils/translations';

interface ColumnMapperProps {
  headers: string[];
  preview: Record<string, string>[];
  onConfirm: (mapping: ColumnMapping) => void;
  initialMapping?: ColumnMapping | null;
}

type FieldKey = keyof typeof COLUMN_ALIASES;

const requiredFields: FieldKey[] = ['path', 'type', 'size'];
const optionalFields: FieldKey[] = ['name', 'extension', 'modified', 'parent', 'depth', 'hash'];

function autoDetectColumn(headers: string[], field: FieldKey): string | null {
  const aliases = COLUMN_ALIASES[field];
  const lowerHeaders = headers.map((h) => h.toLowerCase());

  for (const alias of aliases) {
    const index = lowerHeaders.indexOf(alias.toLowerCase());
    if (index !== -1) {
      return headers[index];
    }
  }

  // Fuzzy match
  for (const alias of aliases) {
    const index = lowerHeaders.findIndex((h) => h.includes(alias.toLowerCase()));
    if (index !== -1) {
      return headers[index];
    }
  }

  return null;
}

export function ColumnMapper({ headers, preview, onConfirm, initialMapping }: ColumnMapperProps) {
  const { language } = useUIStore();
  const t = translations[language];

  const [mapping, setMapping] = useState<Record<FieldKey, string | null>>(() => {
    const initial: Record<FieldKey, string | null> = {
      path: null,
      type: null,
      size: null,
      name: null,
      extension: null,
      modified: null,
      parent: null,
      depth: null,
      hash: null,
    };

    // Use initial mapping if provided
    if (initialMapping) {
      return {
        ...initial,
        ...initialMapping,
      };
    }

    // Auto-detect columns
    for (const field of [...requiredFields, ...optionalFields]) {
      initial[field] = autoDetectColumn(headers, field);
    }

    return initial;
  });

  const [autoDetected, setAutoDetected] = useState<Set<FieldKey>>(new Set());

  useEffect(() => {
    const detected = new Set<FieldKey>();
    for (const field of [...requiredFields, ...optionalFields]) {
      const auto = autoDetectColumn(headers, field);
      if (auto && mapping[field] === auto) {
        detected.add(field);
      }
    }
    setAutoDetected(detected);
  }, [headers, mapping]);

  const isValid = useMemo(() => {
    return requiredFields.every((field) => mapping[field] !== null);
  }, [mapping]);

  const handleChange = (field: FieldKey, value: string) => {
    setMapping((prev) => ({
      ...prev,
      [field]: value || null,
    }));
  };

  const handleConfirm = () => {
    if (!isValid) return;

    const columnMapping: ColumnMapping = {
      path: mapping.path!,
      type: mapping.type!,
      size: mapping.size!,
      name: mapping.name || undefined,
      extension: mapping.extension || undefined,
      modified: mapping.modified || undefined,
      parent: mapping.parent || undefined,
      depth: mapping.depth || undefined,
      hash: mapping.hash || undefined,
    };

    onConfirm(columnMapping);
  };

  const fieldLabels: Record<FieldKey, string> = {
    path: t.filePath,
    type: t.itemType,
    size: t.fileSize,
    name: t.fileName,
    extension: t.extensionField,
    modified: t.modifiedDate,
    parent: t.parentFolder,
    depth: language === 'es' ? 'Profundidad de Carpeta' : 'Folder Depth',
    hash: language === 'es' ? 'Hash de Contenido' : 'Content Hash',
  };

  const required = language === 'es' ? 'Requerido' : 'Required';
  const selectColumnText = language === 'es' ? '-- Seleccionar columna --' : '-- Select column --';
  const notMappedText = language === 'es' ? '-- Sin mapear --' : '-- Not mapped --';
  const previewText = language === 'es' ? 'Vista previa (primeras 5 filas)' : 'Preview (first 5 rows)';
  const continueText = language === 'es' ? 'Continuar' : 'Continue';

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-2">{t.mapColumns}</h2>
        <p className="text-gray-500 mb-6">
          {t.mapColumnsDesc}
        </p>

        {/* Detected columns */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm font-medium text-gray-700 mb-2">{t.yourCsvColumns}</p>
          <div className="flex flex-wrap gap-2">
            {headers.map((header) => (
              <span
                key={header}
                className="px-2 py-1 text-xs font-mono bg-white border border-gray-200 rounded"
              >
                {header}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {/* Required fields */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t.requiredMappings}</h3>
            <div className="space-y-3">
              {requiredFields.map((field) => (
                <div key={field} className="flex items-center gap-4">
                  <label className="w-32 text-sm font-medium text-gray-700">
                    {fieldLabels[field]}
                  </label>
                  <select
                    value={mapping[field] || ''}
                    onChange={(e) => handleChange(field, e.target.value)}
                    className={clsx(
                      'flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                      mapping[field] ? 'border-gray-300' : 'border-red-300 bg-red-50'
                    )}
                  >
                    <option value="">{selectColumnText}</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                  {mapping[field] && autoDetected.has(field) && (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="w-4 h-4" />
                      {t.autoDetected}
                    </span>
                  )}
                  {!mapping[field] && (
                    <span className="flex items-center gap-1 text-xs text-red-600">
                      <AlertCircle className="w-4 h-4" />
                      {required}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Optional fields */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t.optionalMappings}</h3>
            <div className="space-y-3">
              {optionalFields.map((field) => (
                <div key={field} className="flex items-center gap-4">
                  <label className="w-32 text-sm font-medium text-gray-500">
                    {fieldLabels[field]}
                  </label>
                  <select
                    value={mapping[field] || ''}
                    onChange={(e) => handleChange(field, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">{notMappedText}</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                  {mapping[field] && autoDetected.has(field) && (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="w-4 h-4" />
                      {t.autoDetected}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{previewText}</h3>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {requiredFields.map((field) =>
                    mapping[field] ? (
                      <th key={field} className="px-3 py-2 text-left font-medium text-gray-600">
                        {fieldLabels[field]}
                      </th>
                    ) : null
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {preview.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {requiredFields.map((field) =>
                      mapping[field] ? (
                        <td key={field} className="px-3 py-2 text-gray-900 max-w-xs truncate">
                          {row[mapping[field]!] || '-'}
                        </td>
                      ) : null
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Confirm button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className={clsx(
              'flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors',
              isValid
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            )}
          >
            {continueText}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
