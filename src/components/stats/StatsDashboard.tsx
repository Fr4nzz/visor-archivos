import { useState, useMemo } from 'react';
import { File, Folder, Database, PieChart, TrendingUp, BarChart3 } from 'lucide-react';
import {
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  Legend,
  ComposedChart,
  Line,
  ReferenceLine,
  PieChart as RechartsPieChart,
  Pie,
} from 'recharts';
import { useInventoryStore } from '../../stores/inventoryStore';
import { useUIStore } from '../../stores/uiStore';
import { formatSize, formatNumber } from '../../utils/formatters';
import { getColorByExtension, getColorBySpecies, getColorByProject } from '../../utils/colorSchemes';
import { translations } from '../../utils/translations';
import type { TaxonomyLevel } from '../../types/inventory';

type ProjectionModel = 'linear' | 'logistic';

// Taxonomy level labels for dropdown
const TAXONOMY_LABELS: Record<TaxonomyLevel, { en: string; es: string }> = {
  kingdom: { en: 'Kingdom', es: 'Reino' },
  phylum: { en: 'Phylum', es: 'Filo' },
  class: { en: 'Class', es: 'Clase' },
  order: { en: 'Order', es: 'Orden' },
  family: { en: 'Family', es: 'Familia' },
  genus: { en: 'Genus', es: 'Género' },
  species: { en: 'Species', es: 'Especie' },
};

const MODEL_LABELS: Record<ProjectionModel, { en: string; es: string }> = {
  linear: { en: 'Linear', es: 'Lineal' },
  logistic: { en: 'Logistic', es: 'Logístico' },
};

interface SummaryCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  subtitle?: string;
}

function SummaryCard({ title, value, icon, subtitle }: SummaryCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">{icon}</div>
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

// Prediction model functions
function linearRegression(data: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = data.length;
  if (n === 0) return { slope: 0, intercept: 0 };

  const sumX = data.reduce((s, p) => s + p.x, 0);
  const sumY = data.reduce((s, p) => s + p.y, 0);
  const sumXY = data.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = data.reduce((s, p) => s + p.x * p.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope: isNaN(slope) ? 0 : slope, intercept: isNaN(intercept) ? 0 : intercept };
}

// Logistic growth: P(t) = K / (1 + ((K - P0) / P0) * e^(-r*t))
// K = carrying capacity, P0 = initial value, r = growth rate
function logisticGrowth(currentValue: number, growthRate: number, carryingCapacity: number, t: number): number {
  if (currentValue <= 0 || carryingCapacity <= currentValue) return currentValue;
  const A = (carryingCapacity - currentValue) / currentValue;
  return carryingCapacity / (1 + A * Math.exp(-growthRate * t));
}

export function StatsDashboard() {
  const { stats, entries } = useInventoryStore();
  const { language } = useUIStore();
  const t = translations[language];
  const [taxonomyLevel, setTaxonomyLevel] = useState<TaxonomyLevel>('species');
  const [showProjection, setShowProjection] = useState(false);
  const [projectionModel, setProjectionModel] = useState<ProjectionModel>('linear');

  // Extract year from date string, handling various formats including year-only
  const extractYear = (dateStr: string | null | undefined): number | null => {
    if (!dateStr || dateStr === '') return null;
    const str = String(dateStr).trim();

    // If it's just a 4-digit year
    if (/^\d{4}$/.test(str)) {
      return parseInt(str);
    }

    // Try parsing as full date (YYYY-MM-DD, etc.)
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      if (year >= 1990 && year <= 2030) return year;
    }

    // Try extracting first 4 digits if they look like a year
    const match = str.match(/^(\d{4})/);
    if (match) {
      const year = parseInt(match[1]);
      if (year >= 1990 && year <= 2030) return year;
    }

    return null;
  };

  // Calculate historical cumulative storage by year directly from entries
  const historicalData = useMemo(() => {
    if (!entries || entries.length === 0) return [];

    // Group by year - calculate actual size per year
    const byYear: Record<number, number> = {};
    let hasAnyDate = false;

    for (const entry of entries) {
      if (entry.type !== 'file') continue;

      const dateStr = entry.metadata?.extracted_date;
      const year = extractYear(dateStr);

      if (year !== null && year >= 1990 && year <= new Date().getFullYear()) {
        hasAnyDate = true;
        byYear[year] = (byYear[year] || 0) + entry.size;
      }
    }

    if (!hasAnyDate) return [];

    // Convert to cumulative, sorted by year
    const years = Object.keys(byYear).map(Number).sort();
    if (years.length === 0) return [];

    let cumulative = 0;
    const data: { year: number; size: number; sizeGB: number; sizeTB: number }[] = [];

    for (const year of years) {
      cumulative += byYear[year];
      data.push({
        year,
        size: cumulative,
        sizeGB: cumulative / (1024 * 1024 * 1024),
        sizeTB: cumulative / (1024 * 1024 * 1024 * 1024),
      });
    }

    return data;
  }, [entries]);

  // Calculate projection
  const projectionData = useMemo(() => {
    if (!showProjection || historicalData.length < 2) return [];

    const currentYear = new Date().getFullYear();
    const projectionYears = 10;

    // Use only last 5 years (2020+) for prediction - better reflects current operational capacity
    const trainingData = historicalData.filter(d => d.year >= 2020);
    if (trainingData.length < 2) return [];

    // Normalize x values for better numerical stability
    const baseYear = trainingData[0].year;
    const points = trainingData.map(d => ({ x: d.year - baseYear, y: d.sizeTB }));

    // The user mentioned starting storage for projection is 2.59 TB (for data without dates)
    const adjustedStartTB = 2.59;

    // Calculate linear growth rate from recent data
    const { slope } = linearRegression(points);
    const annualGrowthTB = Math.max(slope, 0.1); // Minimum 0.1 TB/year

    // Calculate model parameters
    let predict: (year: number) => number;

    if (projectionModel === 'linear') {
      // Linear: constant annual growth
      predict = (year: number) => adjustedStartTB + annualGrowthTB * (year - currentYear);
    } else {
      // Logistic: S-curve with carrying capacity
      // Set carrying capacity to ~2.5x current data over 10 years (reasonable estimate)
      const carryingCapacity = adjustedStartTB + annualGrowthTB * 10 * 2.5;
      // Estimate growth rate from recent slope
      const r = annualGrowthTB / adjustedStartTB;
      predict = (year: number) => logisticGrowth(adjustedStartTB, r, carryingCapacity, year - currentYear);
    }

    // Generate projection points
    const data: { year: number; projected: number; projectedLow: number; projectedHigh: number }[] = [];

    for (let y = currentYear; y <= currentYear + projectionYears; y++) {
      const projected = predict(y);
      data.push({
        year: y,
        projected,
        projectedLow: projected * 0.8,  // -20%
        projectedHigh: projected * 1.2, // +20%
      });
    }

    return data;
  }, [showProjection, projectionModel, historicalData]);

  // Combine historical and projection data for chart
  const growthChartData = useMemo(() => {
    const combined: Array<{
      year: number;
      historical?: number;
      projected?: number;
      projectedLow?: number;
      projectedHigh?: number;
    }> = [];

    // Add historical data
    for (const d of historicalData) {
      combined.push({ year: d.year, historical: d.sizeTB });
    }

    // Add projection data
    if (showProjection) {
      for (const d of projectionData) {
        const existing = combined.find(c => c.year === d.year);
        if (existing) {
          existing.projected = d.projected;
          existing.projectedLow = d.projectedLow;
          existing.projectedHigh = d.projectedHigh;
        } else {
          combined.push({
            year: d.year,
            projected: d.projected,
            projectedLow: d.projectedLow,
            projectedHigh: d.projectedHigh,
          });
        }
      }
    }

    return combined.sort((a, b) => a.year - b.year);
  }, [historicalData, projectionData, showProjection]);

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        {t.noDataLoaded}
      </div>
    );
  }

  // Prepare bar chart data (size distribution)
  const barData = stats.sizeDistribution.map((bucket) => ({
    name: bucket.label,
    count: bucket.count,
    size: bucket.totalSize,
  }));

  // Prepare project bar chart data
  const projectBarData = stats.metadataStats?.projects
    ? Object.entries(stats.metadataStats.projects)
        .sort(([, a], [, b]) => b.size - a.size)
        .map(([name, data]) => ({
          name: name || (language === 'es' ? 'Sin asignar' : 'Unassigned'),
          size: data.size,
          sizeGB: data.size / (1024 * 1024 * 1024),
          count: data.count,
          color: getColorByProject(name),
        }))
    : [];

  // Prepare largest folders bar data
  const largestFoldersBarData = stats.largestFolders.slice(0, 15).map((folder) => ({
    name: folder.name.length > 25 ? folder.name.substring(0, 22) + '...' : folder.name,
    fullName: folder.name,
    size: folder.size,
    sizeGB: folder.size / (1024 * 1024 * 1024),
    fileCount: folder.fileCount,
  }));

  // Get final projection value for display
  const finalProjection = projectionData.length > 0
    ? projectionData[projectionData.length - 1].projected
    : 0;

  return (
    <div className="h-full overflow-auto p-6 bg-gray-50">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title={t.totalFiles}
          value={formatNumber(stats.totalFiles)}
          icon={<File className="w-6 h-6" />}
        />
        <SummaryCard
          title={t.totalSize}
          value={formatSize(stats.totalSize)}
          icon={<Database className="w-6 h-6" />}
        />
        <SummaryCard
          title={t.foldersLabel}
          value={formatNumber(stats.totalFolders)}
          icon={<Folder className="w-6 h-6" />}
        />
        <SummaryCard
          title={t.fileTypes}
          value={formatNumber(Object.keys(stats.extensionCounts).length)}
          icon={<PieChart className="w-6 h-6" />}
        />
      </div>

      {/* Historical Data + Storage by Project Row */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Historical Data Collection Growth Chart */}
        {historicalData.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <h3 className="text-base font-semibold text-gray-900">
                  {language === 'es' ? 'Crecimiento Histórico' : 'Historical Growth'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showProjection}
                    onChange={(e) => setShowProjection(e.target.checked)}
                    className="w-3 h-3 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-600">
                    {language === 'es' ? 'Proyección' : 'Projection'}
                  </span>
                </label>
                {showProjection && (
                  <select
                    value={projectionModel}
                    onChange={(e) => setProjectionModel(e.target.value as ProjectionModel)}
                    className="px-2 py-0.5 text-xs border border-gray-300 rounded bg-white"
                  >
                    {(Object.keys(MODEL_LABELS) as ProjectionModel[]).map((model) => (
                      <option key={model} value={model}>
                        {language === 'es' ? MODEL_LABELS[model].es : MODEL_LABELS[model].en}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={growthChartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis
                    dataKey="year"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => v.toString()}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v.toFixed(1)} TB`}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(value, name) => {
                      const label = name === 'historical'
                        ? (language === 'es' ? 'Histórico' : 'Historical')
                        : name === 'projected'
                        ? (language === 'es' ? 'Proyectado' : 'Projected')
                        : String(name || '');
                      return [`${(value as number)?.toFixed(2) || 0} TB`, label];
                    }}
                    labelFormatter={(label) => `${language === 'es' ? 'Año' : 'Year'}: ${label}`}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 10 }}
                    formatter={(value) => {
                      if (value === 'historical') return language === 'es' ? 'Histórico' : 'Historical';
                      if (value === 'projected') return language === 'es' ? 'Proyectado' : 'Projected';
                      if (value === 'projectionRange') return '±20%';
                      return value;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="historical"
                    fill="#93C5FD"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    fillOpacity={0.6}
                    name="historical"
                    dot={{ fill: '#3B82F6', r: 2 }}
                    connectNulls={false}
                  />
                  {showProjection && (
                    <Area
                      type="monotone"
                      dataKey="projectedHigh"
                      fill="#F9A8D4"
                      stroke="none"
                      fillOpacity={0.3}
                      name="projectionRange"
                      connectNulls={false}
                    />
                  )}
                  {showProjection && (
                    <Area
                      type="monotone"
                      dataKey="projectedLow"
                      fill="#FFFFFF"
                      stroke="none"
                      fillOpacity={1}
                      connectNulls={false}
                      legendType="none"
                    />
                  )}
                  {showProjection && (
                    <Line
                      type="monotone"
                      dataKey="projected"
                      stroke="#9D174D"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ fill: '#9D174D', r: 2 }}
                      name="projected"
                      connectNulls={false}
                    />
                  )}
                  <ReferenceLine
                    x={new Date().getFullYear()}
                    stroke="#6B7280"
                    strokeDasharray="3 3"
                    label={{ value: language === 'es' ? 'Hoy' : 'Today', position: 'top', fontSize: 9, fill: '#6B7280' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {showProjection && projectionData.length > 0 && (
              <div className="mt-2 p-2 bg-pink-50 rounded border border-pink-200">
                <p className="text-xs text-pink-800">
                  <strong>{language === 'es' ? '10 años' : '10 yr'}:</strong>{' '}
                  {finalProjection.toFixed(1)} TB ({(finalProjection * 0.8).toFixed(1)} - {(finalProjection * 1.2).toFixed(1)})
                </p>
              </div>
            )}
          </div>
        )}

        {/* Storage by Project - Horizontal Bar Chart */}
        {projectBarData.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              <h3 className="text-base font-semibold text-gray-900">
                {language === 'es' ? 'Almacenamiento por Proyecto' : 'Storage by Project'}
              </h3>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={projectBarData.slice(0, 8)}
                  layout="vertical"
                  margin={{ top: 5, right: 60, left: 100, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `${(v).toFixed(0)} GB`}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    width={90}
                  />
                  <Tooltip
                    formatter={(value) => [formatSize((value as number) * 1024 * 1024 * 1024), language === 'es' ? 'Tamaño' : 'Size']}
                  />
                  <Bar
                    dataKey="sizeGB"
                    fill="#3B82F6"
                    radius={[0, 4, 4, 0]}
                    label={{
                      position: 'right',
                      formatter: (value) => `${(value as number).toFixed(0)} GB`,
                      fontSize: 9,
                      fill: '#374151',
                    }}
                  >
                    {projectBarData.slice(0, 8).map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.name === (language === 'es' ? 'Sin asignar' : 'Unassigned') ? '#9CA3AF' : '#3B82F6'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Charts Row - File Types */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Files by Type - Bar Chart with Others grouping */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {language === 'es' ? 'Archivos por Tipo' : 'Files by Type'}
          </h3>
          <div className="h-80">
            {(() => {
              // Group small categories (<2%) into "Others"
              const total = Object.values(stats.extensionCounts).reduce((a, b) => a + b, 0);
              const threshold = total * 0.02;
              const entries = Object.entries(stats.extensionCounts).sort(([, a], [, b]) => b - a);

              let othersCount = 0;
              const mainTypes: { name: string; count: number; color: string }[] = [];

              for (const [ext, count] of entries) {
                if (count >= threshold && mainTypes.length < 10) {
                  mainTypes.push({ name: ext, count, color: getColorByExtension(ext) });
                } else {
                  othersCount += count;
                }
              }

              if (othersCount > 0) {
                mainTypes.push({
                  name: language === 'es' ? 'Otros' : 'Others',
                  count: othersCount,
                  color: '#9CA3AF'
                });
              }

              return (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={mainTypes}
                    layout="vertical"
                    margin={{ top: 5, right: 80, left: 60, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis type="number" tickFormatter={(v) => formatNumber(v)} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={50} />
                    <Tooltip formatter={(value) => [formatNumber(value as number), language === 'es' ? 'Archivos' : 'Files']} />
                    <Bar
                      dataKey="count"
                      radius={[0, 4, 4, 0]}
                      label={{
                        position: 'right',
                        formatter: (value) => formatNumber(value as number),
                        fontSize: 10,
                        fill: '#374151',
                      }}
                    >
                      {mainTypes.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
        </div>

        {/* Storage by Type - Bar Chart with Others grouping */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {language === 'es' ? 'Almacenamiento por Tipo' : 'Storage by Type'}
          </h3>
          <div className="h-80">
            {(() => {
              // Group small categories (<2%) into "Others"
              const total = Object.values(stats.sizeByExtension).reduce((a, b) => a + b, 0);
              const threshold = total * 0.02;
              const entries = Object.entries(stats.sizeByExtension).sort(([, a], [, b]) => b - a);

              let othersSize = 0;
              const mainTypes: { name: string; size: number; sizeDisplay: number; color: string }[] = [];

              for (const [ext, size] of entries) {
                if (size >= threshold && mainTypes.length < 10) {
                  mainTypes.push({
                    name: ext,
                    size,
                    sizeDisplay: size / (1024 * 1024 * 1024), // GB
                    color: getColorByExtension(ext)
                  });
                } else {
                  othersSize += size;
                }
              }

              if (othersSize > 0) {
                mainTypes.push({
                  name: language === 'es' ? 'Otros' : 'Others',
                  size: othersSize,
                  sizeDisplay: othersSize / (1024 * 1024 * 1024),
                  color: '#9CA3AF'
                });
              }

              return (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={mainTypes}
                    layout="vertical"
                    margin={{ top: 5, right: 80, left: 60, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis type="number" tickFormatter={(v) => `${v.toFixed(0)} GB`} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={50} />
                    <Tooltip formatter={(_value, _name, props) => [formatSize(props.payload.size), language === 'es' ? 'Tamaño' : 'Size']} />
                    <Bar
                      dataKey="sizeDisplay"
                      radius={[0, 4, 4, 0]}
                      label={{
                        position: 'right',
                        formatter: (value) => `${(value as number).toFixed(1)} GB`,
                        fontSize: 10,
                        fill: '#374151',
                      }}
                    >
                      {mainTypes.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Size Distribution - full width */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t.fileSizeDistribution}</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => formatNumber(v)} tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(value) => [formatNumber(Number(value)), language === 'es' ? 'Archivos' : 'Files']}
              />
              <Bar
                dataKey="count"
                fill="#3B82F6"
                name={t.fileCount}
                label={{
                  position: 'top',
                  formatter: (value) => (value as number) > 0 ? formatNumber(value as number) : '',
                  fontSize: 9,
                  fill: '#374151',
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Lists */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Largest Files - List View */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t.largestFiles}</h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {stats.largestFiles.slice(0, 15).map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 rounded hover:bg-gray-50 border-b border-gray-100 last:border-0"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-sm font-medium text-gray-400 w-5">{index + 1}</span>
                  <div
                    className="w-3 h-3 rounded flex-shrink-0"
                    style={{ backgroundColor: getColorByExtension(file.extension || 'unknown') }}
                  />
                  <span className="text-sm text-gray-700 truncate" title={file.name}>
                    {file.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-100 rounded">
                    {file.extension || 'unknown'}
                  </span>
                  <span className="text-sm font-medium text-gray-900 w-20 text-right">
                    {formatSize(file.size)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Largest Folders - Horizontal Bar Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t.largestFolders}</h3>
          <div className="h-[500px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={largestFoldersBarData}
                layout="vertical"
                margin={{ top: 5, right: 60, left: 120, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => formatSize(v)}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  width={110}
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'size') return [formatSize(value as number), language === 'es' ? 'Tamaño' : 'Size'];
                    return [formatNumber(value as number), language === 'es' ? 'Archivos' : 'Files'];
                  }}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                />
                <Bar
                  dataKey="size"
                  fill="#F59E0B"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Metadata Statistics - Only shown if metadata exists */}
      {stats.metadataStats?.hasMetadata && (
        <>
          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">
            {language === 'es' ? 'Estadísticas de Metadatos' : 'Metadata Statistics'}
          </h2>

          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Taxonomy Distribution */}
            {(stats.metadataStats.hasTaxonomy || Object.keys(stats.metadataStats.species).length > 0) && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {language === 'es' ? 'Distribución por' : 'Distribution by'}
                  </h3>
                  <select
                    value={taxonomyLevel}
                    onChange={(e) => setTaxonomyLevel(e.target.value as TaxonomyLevel)}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {(Object.keys(TAXONOMY_LABELS) as TaxonomyLevel[]).map((level) => {
                      // Check if this level has data
                      const hasData = stats.metadataStats?.taxonomy?.[level]
                        ? Object.keys(stats.metadataStats.taxonomy[level]).length > 0
                        : (level === 'species' && Object.keys(stats.metadataStats?.species || {}).length > 0);
                      if (!hasData) return null;
                      return (
                        <option key={level} value={level}>
                          {language === 'es' ? TAXONOMY_LABELS[level].es : TAXONOMY_LABELS[level].en}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="h-80">
                  {(() => {
                    // Get data based on selected taxonomy level
                    const taxData = stats.metadataStats?.taxonomy?.[taxonomyLevel]
                      || (taxonomyLevel === 'species' ? stats.metadataStats?.species : {})
                      || {};
                    const sortedData = Object.entries(taxData)
                      .sort(([, a], [, b]) => b.size - a.size)
                      .slice(0, 10)
                      .map(([name, data]) => ({
                        name,
                        value: data.size,
                        count: data.count,
                        color: getColorBySpecies(name),
                      }));

                    return (
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                          <Pie
                            data={sortedData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            label={({ name, percent }) =>
                              percent && percent > 0.05 ? `${name || ''} (${(percent * 100).toFixed(0)}%)` : ''
                            }
                          >
                            {sortedData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value, name, props) => [
                              `${formatSize(Number(value))} (${props.payload.count} ${t.files})`,
                              name
                            ]}
                          />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Taxonomy Horizontal Bar Chart */}
            {(stats.metadataStats.hasTaxonomy || Object.keys(stats.metadataStats.species).length > 0) && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {language === 'es'
                    ? `Top ${TAXONOMY_LABELS[taxonomyLevel].es}`
                    : `Top ${TAXONOMY_LABELS[taxonomyLevel].en}`}
                </h3>
                <div className="h-80">
                  {(() => {
                    const taxData = stats.metadataStats?.taxonomy?.[taxonomyLevel]
                      || (taxonomyLevel === 'species' ? stats.metadataStats?.species : {})
                      || {};
                    const barData = Object.entries(taxData)
                      .sort(([, a], [, b]) => b.size - a.size)
                      .slice(0, 10)
                      .map(([name, data]) => ({
                        name: name.length > 20 ? name.substring(0, 17) + '...' : name,
                        fullName: name,
                        sizeGB: data.size / (1024 * 1024 * 1024),
                        count: data.count,
                        color: getColorBySpecies(name),
                      }));

                    return (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={barData}
                          layout="vertical"
                          margin={{ top: 5, right: 60, left: 100, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                          <XAxis
                            type="number"
                            tickFormatter={(v) => `${v.toFixed(1)} GB`}
                            tick={{ fontSize: 10 }}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            tick={{ fontSize: 10 }}
                            width={90}
                          />
                          <Tooltip
                            formatter={(value) => [`${(value as number).toFixed(2)} GB`, language === 'es' ? 'Tamaño' : 'Size']}
                            labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                          />
                          <Bar
                            dataKey="sizeGB"
                            radius={[0, 4, 4, 0]}
                          >
                            {barData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Extension breakdown - List View */}
      <div className="mt-6 bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t.allFileTypes}</h3>
        <div className="grid grid-cols-2 gap-4 max-h-[500px] overflow-y-auto">
          {Object.entries(stats.sizeByExtension)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 30)
            .map(([ext, size], index) => (
              <div
                key={ext}
                className="flex items-center justify-between p-2 rounded hover:bg-gray-50 border border-gray-100"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-400 w-5">{index + 1}</span>
                  <div
                    className="w-3 h-3 rounded flex-shrink-0"
                    style={{ backgroundColor: getColorByExtension(ext) }}
                  />
                  <span className="text-sm font-medium text-gray-700">{ext}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {formatNumber(stats.extensionCounts[ext] || 0)} {t.files}
                  </span>
                  <span className="text-sm font-medium text-gray-900 w-20 text-right">
                    {formatSize(size)}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
