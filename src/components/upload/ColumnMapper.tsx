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
const metadataFields: FieldKey[] = [
  // Date fields
  'extracted_date', 'date_precision', 'date_format_hint', 'date_confidence',
  // Taxonomy
  'taxa_verbatim', 'taxa_interpreted', 'taxa_rank', 'taxa_kingdom', 'taxa_phylum',
  'taxa_class', 'taxa_order', 'taxa_family', 'taxa_genus', 'taxa_species',
  'taxa_common_name', 'taxa_gbif_key', 'taxa_source',
  // Legacy species
  'species', 'species_source',
  // Equipment & Location
  'equipment', 'location', 'zone', 'project', 'data_type',
  // Specialized
  'climate_variable', 'climate_extent', 'camera_id', 'sequence_number',
  'deforestation_period', 'is_system_file',
  // Cross-reference enrichment
  'xref_source', 'xref_latitude', 'xref_longitude', 'xref_comment'
];

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
      // Date fields
      extracted_date: null,
      date_precision: null,
      date_format_hint: null,
      date_confidence: null,
      // Taxonomy
      taxa_verbatim: null,
      taxa_interpreted: null,
      taxa_rank: null,
      taxa_kingdom: null,
      taxa_phylum: null,
      taxa_class: null,
      taxa_order: null,
      taxa_family: null,
      taxa_genus: null,
      taxa_species: null,
      taxa_common_name: null,
      taxa_gbif_key: null,
      taxa_source: null,
      // Legacy species
      species: null,
      species_source: null,
      // Equipment & Location
      equipment: null,
      location: null,
      zone: null,
      project: null,
      data_type: null,
      // Specialized
      climate_variable: null,
      climate_extent: null,
      camera_id: null,
      sequence_number: null,
      deforestation_period: null,
      is_system_file: null,
      // Cross-reference enrichment
      xref_source: null,
      xref_latitude: null,
      xref_longitude: null,
      xref_comment: null,
    };

    // Auto-detect columns first
    for (const field of [...requiredFields, ...optionalFields, ...metadataFields]) {
      initial[field] = autoDetectColumn(headers, field);
    }

    // Merge with initial mapping if provided (only for fields that were previously mapped)
    if (initialMapping) {
      for (const field of [...requiredFields, ...optionalFields, ...metadataFields]) {
        const mappedValue = initialMapping[field as keyof typeof initialMapping];
        // Only use initialMapping value if it's set AND the column exists in current headers
        if (mappedValue && headers.includes(mappedValue)) {
          initial[field] = mappedValue;
        }
      }
    }

    return initial;
  });

  const [autoDetected, setAutoDetected] = useState<Set<FieldKey>>(new Set());

  useEffect(() => {
    const detected = new Set<FieldKey>();
    for (const field of [...requiredFields, ...optionalFields, ...metadataFields]) {
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
      // Date fields
      extracted_date: mapping.extracted_date || undefined,
      date_precision: mapping.date_precision || undefined,
      date_format_hint: mapping.date_format_hint || undefined,
      date_confidence: mapping.date_confidence || undefined,
      // Taxonomy
      taxa_verbatim: mapping.taxa_verbatim || undefined,
      taxa_interpreted: mapping.taxa_interpreted || undefined,
      taxa_rank: mapping.taxa_rank || undefined,
      taxa_kingdom: mapping.taxa_kingdom || undefined,
      taxa_phylum: mapping.taxa_phylum || undefined,
      taxa_class: mapping.taxa_class || undefined,
      taxa_order: mapping.taxa_order || undefined,
      taxa_family: mapping.taxa_family || undefined,
      taxa_genus: mapping.taxa_genus || undefined,
      taxa_species: mapping.taxa_species || undefined,
      taxa_common_name: mapping.taxa_common_name || undefined,
      taxa_gbif_key: mapping.taxa_gbif_key || undefined,
      taxa_source: mapping.taxa_source || undefined,
      // Legacy species
      species: mapping.species || undefined,
      species_source: mapping.species_source || undefined,
      // Equipment & Location
      equipment: mapping.equipment || undefined,
      location: mapping.location || undefined,
      zone: mapping.zone || undefined,
      project: mapping.project || undefined,
      data_type: mapping.data_type || undefined,
      // Specialized
      climate_variable: mapping.climate_variable || undefined,
      climate_extent: mapping.climate_extent || undefined,
      camera_id: mapping.camera_id || undefined,
      sequence_number: mapping.sequence_number || undefined,
      deforestation_period: mapping.deforestation_period || undefined,
      is_system_file: mapping.is_system_file || undefined,
      // Cross-reference enrichment
      xref_source: mapping.xref_source || undefined,
      xref_latitude: mapping.xref_latitude || undefined,
      xref_longitude: mapping.xref_longitude || undefined,
      xref_comment: mapping.xref_comment || undefined,
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
    // Date fields
    extracted_date: language === 'es' ? 'Fecha Extraída' : 'Extracted Date',
    date_precision: language === 'es' ? 'Precisión de Fecha' : 'Date Precision',
    date_format_hint: language === 'es' ? 'Formato de Fecha' : 'Date Format',
    date_confidence: language === 'es' ? 'Confianza de Fecha' : 'Date Confidence',
    // Taxonomy
    taxa_verbatim: language === 'es' ? 'Taxón (Original)' : 'Taxon (Original)',
    taxa_interpreted: language === 'es' ? 'Taxón (Interpretado)' : 'Taxon (Interpreted)',
    taxa_rank: language === 'es' ? 'Rango Taxonómico' : 'Taxonomic Rank',
    taxa_kingdom: language === 'es' ? 'Reino' : 'Kingdom',
    taxa_phylum: language === 'es' ? 'Filo' : 'Phylum',
    taxa_class: language === 'es' ? 'Clase' : 'Class',
    taxa_order: language === 'es' ? 'Orden' : 'Order',
    taxa_family: language === 'es' ? 'Familia' : 'Family',
    taxa_genus: language === 'es' ? 'Género' : 'Genus',
    taxa_species: language === 'es' ? 'Especie (Epíteto)' : 'Species (Epithet)',
    taxa_common_name: language === 'es' ? 'Nombre Común' : 'Common Name',
    taxa_gbif_key: language === 'es' ? 'ID GBIF' : 'GBIF ID',
    taxa_source: language === 'es' ? 'Fuente del Taxón' : 'Taxon Source',
    // Legacy species
    species: language === 'es' ? 'Especie' : 'Species',
    species_source: language === 'es' ? 'Fuente de Especie' : 'Species Source',
    // Equipment & Location
    equipment: language === 'es' ? 'Equipo' : 'Equipment',
    location: language === 'es' ? 'Ubicación' : 'Location',
    zone: language === 'es' ? 'Zona' : 'Zone',
    project: language === 'es' ? 'Proyecto' : 'Project',
    data_type: language === 'es' ? 'Tipo de Datos' : 'Data Type',
    // Specialized
    climate_variable: language === 'es' ? 'Variable Climática' : 'Climate Variable',
    climate_extent: language === 'es' ? 'Extensión Climática' : 'Climate Extent',
    camera_id: language === 'es' ? 'ID de Cámara' : 'Camera ID',
    sequence_number: language === 'es' ? 'Número de Secuencia' : 'Sequence Number',
    deforestation_period: language === 'es' ? 'Período Deforestación' : 'Deforestation Period',
    is_system_file: language === 'es' ? 'Archivo de Sistema' : 'System File',
    // Cross-reference enrichment
    xref_source: language === 'es' ? 'Fuente Cruzada' : 'Xref Source',
    xref_latitude: language === 'es' ? 'Latitud' : 'Latitude',
    xref_longitude: language === 'es' ? 'Longitud' : 'Longitude',
    xref_comment: language === 'es' ? 'Comentario Cruzado' : 'Xref Comment',
  };

  const required = language === 'es' ? 'Requerido' : 'Required';
  const selectColumnText = language === 'es' ? '-- Seleccionar columna --' : '-- Select column --';
  const notMappedText = language === 'es' ? '-- Sin mapear --' : '-- Not mapped --';
  const previewText = language === 'es' ? 'Vista previa (primeras 5 filas)' : 'Preview (first 5 rows)';
  const continueText = language === 'es' ? 'Continuar' : 'Continue';

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold text-gray-900">{t.mapColumns}</h2>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors text-sm',
              isValid
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            )}
          >
            {continueText}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
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

          {/* Metadata fields */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              {language === 'es' ? 'Metadatos (Extraídos de nombres de archivo)' : 'Metadata (Extracted from filenames)'}
            </h3>
            <div className="space-y-3">
              {metadataFields.map((field) => (
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
