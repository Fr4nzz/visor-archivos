import { useState } from 'react';
import { File, Folder, Database, PieChart } from 'lucide-react';
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
} from 'recharts';
import { useInventoryStore } from '../../stores/inventoryStore';
import { useUIStore } from '../../stores/uiStore';
import { formatSize, formatNumber } from '../../utils/formatters';
import { getColorByExtension, getColorBySpecies, getColorByProject } from '../../utils/colorSchemes';
import { translations } from '../../utils/translations';

type PieChartMode = 'size' | 'count';

interface SummaryCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
}

function SummaryCard({ title, value, icon }: SummaryCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">{icon}</div>
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

export function StatsDashboard() {
  const { stats } = useInventoryStore();
  const { language } = useUIStore();
  const t = translations[language];
  const [pieChartMode, setPieChartMode] = useState<PieChartMode>('size');

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

      {/* Top Lists */}
      <div className="grid grid-cols-2 gap-6">
        {/* Largest Files */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t.largestFiles}</h3>
          <div className="space-y-2 max-h-96 overflow-auto">
            {stats.largestFiles.slice(0, 15).map((file, i) => (
              <div
                key={file.id}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-gray-400 w-6">{i + 1}.</span>
                  <span className="text-sm text-gray-900 truncate" title={file.path}>
                    {file.name}
                  </span>
                  {file.extension && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: `${getColorByExtension(file.extension)}20`,
                        color: getColorByExtension(file.extension),
                      }}
                    >
                      {file.extension}
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-700 ml-2 flex-shrink-0">
                  {formatSize(file.size)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Largest Folders */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t.largestFolders}</h3>
          <div className="space-y-2 max-h-96 overflow-auto">
            {stats.largestFolders.slice(0, 15).map((folder, i) => (
              <div
                key={folder.path}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-gray-400 w-6">{i + 1}.</span>
                  <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span className="text-sm text-gray-900 truncate" title={folder.path}>
                    {folder.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    ({formatNumber(folder.fileCount)} {t.files})
                  </span>
                </div>
                <span className="text-sm font-medium text-gray-700 ml-2 flex-shrink-0">
                  {formatSize(folder.size)}
                </span>
              </div>
            ))}
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
            {/* Species Distribution */}
            {Object.keys(stats.metadataStats.species).length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {language === 'es' ? 'Distribución por Especie' : 'Distribution by Species'}
                </h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={Object.entries(stats.metadataStats.species)
                          .sort(([, a], [, b]) => b.size - a.size)
                          .slice(0, 10)
                          .map(([name, data]) => ({
                            name,
                            value: data.size,
                            count: data.count,
                            color: getColorBySpecies(name),
                          }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) =>
                          percent && percent > 0.05 ? `${name || ''} (${(percent * 100).toFixed(0)}%)` : ''
                        }
                      >
                        {Object.entries(stats.metadataStats.species)
                          .sort(([, a], [, b]) => b.size - a.size)
                          .slice(0, 10)
                          .map(([name], index) => (
                            <Cell key={`cell-${index}`} fill={getColorBySpecies(name)} />
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
                </div>
              </div>
            )}

            {/* Project Distribution */}
            {Object.keys(stats.metadataStats.projects).length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {language === 'es' ? 'Distribución por Proyecto' : 'Distribution by Project'}
                </h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={Object.entries(stats.metadataStats.projects)
                          .sort(([, a], [, b]) => b.size - a.size)
                          .slice(0, 10)
                          .map(([name, data]) => ({
                            name,
                            value: data.size,
                            count: data.count,
                            color: getColorByProject(name),
                          }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) =>
                          percent && percent > 0.05 ? `${name || ''} (${(percent * 100).toFixed(0)}%)` : ''
                        }
                      >
                        {Object.entries(stats.metadataStats.projects)
                          .sort(([, a], [, b]) => b.size - a.size)
                          .slice(0, 10)
                          .map(([name], index) => (
                            <Cell key={`cell-${index}`} fill={getColorByProject(name)} />
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
                </div>
              </div>
            )}
          </div>

          {/* Species Table */}
          {Object.keys(stats.metadataStats.species).length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {language === 'es' ? 'Todas las Especies' : 'All Species'}
              </h3>
              <div className="overflow-x-auto max-h-64">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">
                        {language === 'es' ? 'Especie' : 'Species'}
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">{t.count}</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">{t.totalSize}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {Object.entries(stats.metadataStats.species)
                      .sort(([, a], [, b]) => b.size - a.size)
                      .map(([species, data]) => (
                        <tr key={species} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                              style={{
                                backgroundColor: `${getColorBySpecies(species)}20`,
                                color: getColorBySpecies(species),
                              }}
                            >
                              {species}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-gray-900">{formatNumber(data.count)}</td>
                          <td className="px-4 py-2 text-right text-gray-900">{formatSize(data.size)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Projects Table */}
          {Object.keys(stats.metadataStats.projects).length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {language === 'es' ? 'Todos los Proyectos' : 'All Projects'}
              </h3>
              <div className="overflow-x-auto max-h-64">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">
                        {language === 'es' ? 'Proyecto' : 'Project'}
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">{t.count}</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">{t.totalSize}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {Object.entries(stats.metadataStats.projects)
                      .sort(([, a], [, b]) => b.size - a.size)
                      .map(([project, data]) => (
                        <tr key={project} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                              style={{
                                backgroundColor: `${getColorByProject(project)}20`,
                                color: getColorByProject(project),
                              }}
                            >
                              {project}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-gray-900">{formatNumber(data.count)}</td>
                          <td className="px-4 py-2 text-right text-gray-900">{formatSize(data.size)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Extension breakdown table */}
      <div className="mt-6 bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t.allFileTypes}</h3>
        <div className="overflow-x-auto max-h-96">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600">{t.extension}</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">{t.count}</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">{t.totalSize}</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">{t.avgSize}</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">{t.percentOfTotal}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Object.entries(stats.sizeByExtension)
                .sort(([, a], [, b]) => b - a)
                .map(([ext, size]) => {
                  const count = stats.extensionCounts[ext] || 0;
                  const avgSize = count > 0 ? size / count : 0;
                  const percent = ((size / stats.totalSize) * 100).toFixed(1);

                  return (
                    <tr key={ext} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `${getColorByExtension(ext)}20`,
                            color: getColorByExtension(ext),
                          }}
                        >
                          {ext}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-900">{formatNumber(count)}</td>
                      <td className="px-4 py-2 text-right text-gray-900">{formatSize(size)}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{formatSize(avgSize)}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{percent}%</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
