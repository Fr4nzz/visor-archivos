# Inventory Explorer (Visor de Archivos)

Web app for visualizing large file inventories. Designed to handle CSV files with hundreds of thousands of rows.

**Live Demo:** https://fr4nzz.github.io/visor-archivos/

## Features

- **Drag & Drop CSV Upload** - Load inventory files instantly
- **Storage Growth Projections** - 10-year forecasts with linear/logistic models
- **Duplicate Detection** - Identify wasted storage via content hash analysis
- **Metadata Visualization** - Taxonomy, projects, species distribution charts
- **Interactive Treemap** - SpaceSniffer-style folder exploration
- **Data Table** - View raw metadata (taxa, dates, equipment) for debugging extraction
- **Search & Export** - Filter and export subsets to CSV

## Quick Start

1. Visit https://fr4nzz.github.io/visor-archivos/
2. Drag your `inventory_enriched.csv` file onto the page
3. Verify column mapping and click "Continue"
4. Explore tabs: Navigator, Treemap, Stats, Search, Data

## Key Features Explained

### Stats Tab - Growth Projections
- Shows historical storage growth with 10-year projection
- Toggle "Ignorar duplicados" checkbox to see deduplicated estimates
- Choose Linear or Logistic projection models
- Useful for capacity planning and cloud storage requests

### Stats Tab - Duplicate Analysis
- Identifies files with identical content_hash values
- Shows wasted storage per duplicate group
- Click "Load more" to see additional duplicate groups

### Data Tab - Metadata Debugging
- View raw extracted metadata columns:
  - **Taxon (Original)** / **Taxon (Interpreted)** - See what text was matched and the resolved species
  - **Fecha Extraida** / **Formato Fecha** - Check date extraction accuracy
  - **Project**, **Equipment**, **Location** - Verify automatic classification
- Filter by any column to find extraction errors
- Export filtered results for manual review

## CSV Format

Minimum required columns:

| Column | Description |
|--------|-------------|
| path | Full file path |
| type | "file" or "folder" |
| size_bytes | File size in bytes |

Optional enriched columns (from `extract_metadata.py`):

| Column | Description |
|--------|-------------|
| content_hash | Dropbox content hash (for deduplication) |
| extracted_date | ISO date extracted from path/filename |
| species | Scientific name |
| kingdom, family, genus | Taxonomic hierarchy |
| project | Project name |
| equipment | Camera/drone type |

## Development

### Run Locally

```bash
git clone https://github.com/Fr4nzz/visor-archivos.git
cd visor-archivos
npm install
npm run dev
```

### Project Structure

```
src/
├── components/
│   ├── stats/StatsDashboard.tsx    # Growth charts, projections, duplicates
│   ├── data/DataTableView.tsx      # Metadata table with filtering
│   ├── navigator/FolderTree.tsx    # Folder browser
│   ├── treemap/TreemapView.tsx     # D3 treemap visualization
│   └── search/SearchView.tsx       # Search interface
├── stores/
│   └── inventoryStore.ts           # Zustand state management
├── workers/
│   └── csvParser.worker.ts         # Web Worker for CSV processing
└── utils/
    └── formatters.ts               # Size/number formatting
```

### Adding New Charts

1. Edit `src/components/stats/StatsDashboard.tsx`
2. Add chart data computation in `useMemo` hook
3. Add Recharts component in the return JSX
4. Available data: `stats`, `entries`, `historicalData`, `projectionData`

### Adding Data Table Columns

1. Edit `src/components/data/DataTableView.tsx`
2. Add column definition to `COLUMNS` array:
   ```typescript
   { key: 'new_field', label: 'New Field', labelEs: 'Nuevo Campo', width: 120, metadata: true, filterType: 'dropdown' }
   ```
3. Add value extraction in `getCellValue` function
4. Add unique values extraction in `uniqueValuesCache` if using dropdown filter

## Technologies

- **React 18** + TypeScript
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **D3.js** - Treemap visualization
- **Recharts** - Statistical charts
- **Zustand** - State management
- **Web Workers** - Background CSV processing
- **@tanstack/react-virtual** - Virtual scrolling for large lists

## License

MIT
