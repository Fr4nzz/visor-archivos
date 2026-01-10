import { useState, useMemo } from 'react';
import { File, Folder, Database, PieChart, TrendingUp, BarChart3 } from 'lucide-react';
import {
  PieChart as RechartsPieChart,
  Pie,
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
} from 'recharts';
import { useInventoryStore } from '../../stores/inventoryStore';
import { useUIStore } from '../../stores/uiStore';
import { formatSize, formatNumber } from '../../utils/formatters';
import { getColorByExtension, getColorBySpecies, getColorByProject } from '../../utils/colorSchemes';
import { translations } from '../../utils/translations';
import type { TaxonomyLevel } from '../../types/inventory';

type PieChartMode = 'size' | 'count';
type ProjectionModel = 'linear' | 'exponential' | 'polynomial';

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
  exponential: { en: 'Exponential', es: 'Exponencial' },
  polynomial: { en: 'Polynomial (2°)', es: 'Polinomial (2°)' },
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

function exponentialRegression(data: { x: number; y: number }[]): { a: number; b: number } {
  // Transform to linear: ln(y) = ln(a) + b*x
  const logData = data.filter(p => p.y > 0).map(p => ({ x: p.x, y: Math.log(p.y) }));
  if (logData.length < 2) return { a: 1, b: 0 };

  const { slope, intercept } = linearRegression(logData);
  return { a: Math.exp(intercept), b: slope };
}

function polynomialRegression(data: { x: number; y: number }[]): { a: number; b: number; c: number } {
  // Quadratic fit: y = ax² + bx + c
  const n = data.length;
  if (n < 3) {
    const { slope, intercept } = linearRegression(data);
    return { a: 0, b: slope, c: intercept };
  }

  // Using least squares for degree 2
  let sumX = 0, sumX2 = 0, sumX3 = 0, sumX4 = 0;
  let sumY = 0, sumXY = 0, sumX2Y = 0;

  for (const p of data) {
    const x = p.x, y = p.y;
    sumX += x;
    sumX2 += x * x;
    sumX3 += x * x * x;
    sumX4 += x * x * x * x;
    sumY += y;
    sumXY += x * y;
    sumX2Y += x * x * y;
  }

  // Solve system of equations using Cramer's rule
  const det = n * (sumX2 * sumX4 - sumX3 * sumX3) - sumX * (sumX * sumX4 - sumX2 * sumX3) + sumX2 * (sumX * sumX3 - sumX2 * sumX2);

  if (Math.abs(det) < 1e-10) {
    const { slope, intercept } = linearRegression(data);
    return { a: 0, b: slope, c: intercept };
  }

  const a = (sumY * (sumX2 * sumX4 - sumX3 * sumX3) - sumX * (sumXY * sumX4 - sumX2Y * sumX3) + sumX2 * (sumXY * sumX3 - sumX2Y * sumX2)) / det;
  const b = (n * (sumXY * sumX4 - sumX2Y * sumX3) - sumY * (sumX * sumX4 - sumX2 * sumX3) + sumX2 * (sumX * sumX2Y - sumX2 * sumXY)) / det;
  const c = (n * (sumX2 * sumX2Y - sumX3 * sumXY) - sumX * (sumX * sumX2Y - sumX2 * sumXY) + sumY * (sumX * sumX3 - sumX2 * sumX2)) / det;

  return { a: isNaN(a) ? 0 : a, b: isNaN(b) ? 0 : b, c: isNaN(c) ? 0 : c };
}

export function StatsDashboard() {
  const { stats, entries } = useInventoryStore();
  const { language } = useUIStore();
  const t = translations[language];
  const [pieChartMode, setPieChartMode] = useState<PieChartMode>('size');
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

    // For linear model, use only last 5 years (2020+)
    const trainingData = projectionModel === 'linear'
      ? historicalData.filter(d => d.year >= 2020)
      : historicalData;

    if (trainingData.length < 2) return [];

    // Normalize x values for better numerical stability
    const baseYear = trainingData[0].year;
    const points = trainingData.map(d => ({ x: d.year - baseYear, y: d.sizeTB }));

    // The user mentioned starting storage for projection is 2.59 TB (for data without dates)
    // So we adjust the last known value
    const lastHistorical = historicalData[historicalData.length - 1];
    const adjustedStartTB = Math.max(lastHistorical?.sizeTB || 0, 2.59);

    // Calculate model parameters
    let predict: (year: number) => number;

    if (projectionModel === 'linear') {
      const { slope } = linearRegression(points);
      // Adjust intercept to match current data
      const adjustedIntercept = adjustedStartTB - slope * (currentYear - baseYear);
      predict = (year: number) => Math.max(0, slope * (year - baseYear) + adjustedIntercept);
    } else if (projectionModel === 'exponential') {
      const { a, b } = exponentialRegression(points);
      // Adjust to match current value
      const currentPredicted = a * Math.exp(b * (currentYear - baseYear));
      const factor = currentPredicted > 0 ? adjustedStartTB / currentPredicted : 1;
      predict = (year: number) => Math.max(0, factor * a * Math.exp(b * (year - baseYear)));
    } else {
      const { a, b, c } = polynomialRegression(points);
      // Adjust to match current value
      const currentPredicted = a * Math.pow(currentYear - baseYear, 2) + b * (currentYear - baseYear) + c;
      const offset = adjustedStartTB - currentPredicted;
      predict = (year: number) => {
        const x = year - baseYear;
        return Math.max(0, a * x * x + b * x + c + offset);
      };
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

  // Prepare pie chart data (top 10 extensions by size or count)
  const pieData = pieChartMode === 'size'
    ? Object.entries(stats.sizeByExtension)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([ext, size]) => ({
          name: ext,
          value: size,
          color: getColorByExtension(ext),
        }))
    : Object.entries(stats.extensionCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([ext, count]) => ({
          name: ext,
          value: count,
          color: getColorByExtension(ext),
        }));

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

  // Prepare largest files bar data
  const largestFilesBarData = stats.largestFiles.slice(0, 15).map((file) => ({
    name: file.name.length > 25 ? file.name.substring(0, 22) + '...' : file.name,
    fullName: file.name,
    size: file.size,
    sizeGB: file.size / (1024 * 1024 * 1024),
    extension: file.extension,
    color: getColorByExtension(file.extension || 'unknown'),
  }));

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

      {/* Historical Data Collection Growth Chart */}
      {historicalData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">
                {showProjection
                  ? (language === 'es' ? 'Proyección de Almacenamiento a 10 Años' : '10-Year Storage Projection')
                  : (language === 'es' ? 'Crecimiento Histórico de Datos' : 'Historical Data Collection Growth')}
              </h3>
            </div>
            <div className="flex items-center gap-4">
              {/* Show Projection Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showProjection}
                  onChange={(e) => setShowProjection(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">
                  {language === 'es' ? 'Mostrar proyección' : 'Show projection'}
                </span>
              </label>

              {/* Model Selection */}
              {showProjection && (
                <select
                  value={projectionModel}
                  onChange={(e) => setProjectionModel(e.target.value as ProjectionModel)}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500"
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

          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={growthChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => v.toString()}
                />
                <YAxis
                  tickFormatter={(v) => `${v.toFixed(1)} TB`}
                  tick={{ fontSize: 12 }}
                  label={{
                    value: language === 'es' ? 'Almacenamiento (TB)' : 'Cumulative Storage (TB)',
                    angle: -90,
                    position: 'insideLeft',
                    style: { textAnchor: 'middle', fontSize: 12 }
                  }}
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
                  formatter={(value) => {
                    if (value === 'historical') return language === 'es' ? 'Datos Históricos' : 'Historical Data';
                    if (value === 'projected') return language === 'es' ? 'Crecimiento Proyectado' : 'Projected Growth';
                    if (value === 'projectionRange') return language === 'es' ? 'Rango (±20%)' : 'Range (±20%)';
                    return value;
                  }}
                />

                {/* Historical area */}
                <Area
                  type="monotone"
                  dataKey="historical"
                  fill="#93C5FD"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fillOpacity={0.6}
                  name="historical"
                  dot={{ fill: '#3B82F6', strokeWidth: 2 }}
                  connectNulls={false}
                />

                {/* Projection range area */}
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

                {/* Projection line */}
                {showProjection && (
                  <Line
                    type="monotone"
                    dataKey="projected"
                    stroke="#9D174D"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: '#9D174D', strokeWidth: 2 }}
                    name="projected"
                    connectNulls={false}
                  />
                )}

                {/* Current year reference line */}
                <ReferenceLine
                  x={new Date().getFullYear()}
                  stroke="#6B7280"
                  strokeDasharray="3 3"
                  label={{
                    value: language === 'es' ? 'Hoy' : 'Today',
                    position: 'top',
                    fontSize: 11,
                    fill: '#6B7280'
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Projection summary */}
          {showProjection && projectionData.length > 0 && (
            <div className="mt-4 p-3 bg-pink-50 rounded-lg border border-pink-200">
              <p className="text-sm text-pink-800">
                <strong>{language === 'es' ? 'Proyección a 10 años' : '10-year projection'}:</strong>{' '}
                {finalProjection.toFixed(1)} TB ({language === 'es' ? 'rango' : 'range'}: {(finalProjection * 0.8).toFixed(1)} - {(finalProjection * 1.2).toFixed(1)} TB)
                {projectionModel === 'linear' && (
                  <span className="text-pink-600 ml-2">
                    ({language === 'es' ? 'basado en datos desde 2020' : 'based on data from 2020'})
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* File Type Pie Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {pieChartMode === 'size' ? t.storageByFileType : t.filesByType}
            </h3>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setPieChartMode('size')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  pieChartMode === 'size'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t.bySize}
              </button>
              <button
                onClick={() => setPieChartMode('count')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  pieChartMode === 'count'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t.byCount}
              </button>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) =>
                    percent && percent > 0.05 ? `${name || ''} (${(percent * 100).toFixed(0)}%)` : ''
                  }
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) =>
                    pieChartMode === 'size'
                      ? formatSize(Number(value))
                      : `${formatNumber(Number(value))} ${t.files}`
                  }
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Size Distribution Bar Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t.fileSizeDistribution}</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => formatNumber(v)} />
                <Tooltip
                  formatter={(value, name) =>
                    name === 'count' ? formatNumber(Number(value)) : formatSize(Number(value))
                  }
                />
                <Bar dataKey="count" fill="#3B82F6" name={t.fileCount} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Storage by Project - Horizontal Bar Chart */}
      {projectBarData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              {language === 'es' ? 'Almacenamiento por Proyecto' : 'Storage by Research Project'}
            </h3>
          </div>
          <div style={{ height: Math.max(300, projectBarData.length * 45) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={projectBarData}
                layout="vertical"
                margin={{ top: 5, right: 80, left: 150, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `${(v).toFixed(0)} GB`}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  width={140}
                />
                <Tooltip
                  formatter={(value) => [formatSize((value as number) * 1024 * 1024 * 1024), language === 'es' ? 'Tamaño' : 'Size']}
                  labelStyle={{ fontWeight: 'bold' }}
                />
                <Bar
                  dataKey="sizeGB"
                  fill="#3B82F6"
                  radius={[0, 4, 4, 0]}
                  label={{
                    position: 'right',
                    formatter: (value) => `${(value as number).toFixed(1)} GB`,
                    fontSize: 11,
                    fill: '#374151',
                  }}
                >
                  {projectBarData.map((entry, index) => (
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

      {/* Top Lists as Bar Charts */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Largest Files - Horizontal Bar Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t.largestFiles}</h3>
          <div className="h-[500px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={largestFilesBarData}
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
                  formatter={(value) => [formatSize(value as number), language === 'es' ? 'Tamaño' : 'Size']}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                />
                <Bar
                  dataKey="size"
                  radius={[0, 4, 4, 0]}
                >
                  {largestFilesBarData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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

      {/* Extension breakdown - Horizontal Bar Chart */}
      <div className="mt-6 bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t.allFileTypes}</h3>
        <div className="h-[600px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={Object.entries(stats.sizeByExtension)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 20)
                .map(([ext, size]) => ({
                  name: ext,
                  size,
                  sizeGB: size / (1024 * 1024 * 1024),
                  count: stats.extensionCounts[ext] || 0,
                  color: getColorByExtension(ext),
                }))}
              layout="vertical"
              margin={{ top: 5, right: 80, left: 80, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => `${v.toFixed(0)} GB`}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                width={70}
              />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'sizeGB') return [`${(value as number).toFixed(2)} GB`, language === 'es' ? 'Tamaño' : 'Size'];
                  return [formatNumber(value as number), language === 'es' ? 'Archivos' : 'Files'];
                }}
              />
              <Bar
                dataKey="sizeGB"
                radius={[0, 4, 4, 0]}
                label={{
                  position: 'right',
                  formatter: (value) => `${(value as number).toFixed(1)} GB`,
                  fontSize: 10,
                  fill: '#374151',
                }}
              >
                {Object.entries(stats.sizeByExtension)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 20)
                  .map(([ext], index) => (
                    <Cell key={`cell-${index}`} fill={getColorByExtension(ext)} />
                  ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
