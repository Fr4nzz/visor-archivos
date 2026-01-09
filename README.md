# Inventory Explorer

Aplicación web para visualizar inventarios de archivos grandes. Diseñada para manejar archivos CSV de más de 100MB con cientos de miles de filas.

## Características

- **Carga de archivos CSV** - Arrastra y suelta o selecciona archivos CSV de inventario
- **Mapeo de columnas** - Auto-detecta y permite mapear columnas del CSV
- **Navegador de carpetas** - Explora la estructura de carpetas con lista virtualizada
- **Treemap interactivo** - Visualización estilo SpaceSniffer con expansión anidada
- **Dashboard de estadísticas** - Gráficos de distribución por tipo, extensión y tamaño
- **Búsqueda y filtros** - Busca archivos por nombre, extensión, tamaño y fecha
- **Exportación** - Exporta resultados filtrados a CSV

## Demo

La aplicación está disponible en: https://fr4nzz.github.io/visor-archivos/

## Uso

### Opción 1: Usar la aplicación web

1. Visita la [demo](https://fr4nzz.github.io/visor-archivos/)
2. Arrastra tu archivo CSV de inventario o haz clic para seleccionarlo
3. Verifica el mapeo de columnas y haz clic en "Continue"
4. Explora tu inventario usando las pestañas: Navigator, Treemap, Stats, Search

### Opción 2: Ejecutar localmente

```bash
# Clonar el repositorio
git clone https://github.com/Fr4nzz/visor-archivos.git
cd visor-archivos

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

## Crear inventario de Dropbox

El script `create_dropbox_inventory/create_inventory.py` genera un inventario CSV de tu cuenta de Dropbox.

### Requisitos

- Python 3.8+
- Token de acceso de Dropbox API

### Uso

1. Obtén un token de acceso en [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Edita `create_inventory.py` y reemplaza `YOUR_ACCESS_TOKEN_HERE` con tu token
3. Ejecuta el script:

```bash
cd create_dropbox_inventory
python create_inventory.py
```

El inventario se guardará en `inventory_output_hybrid/inventory.csv`

## Formato del CSV

El CSV debe contener al menos estas columnas (los nombres pueden variar):

| Columna | Descripción | Requerida |
|---------|-------------|-----------|
| path | Ruta completa del archivo | Sí |
| type | "file" o "folder" | Sí |
| size_bytes | Tamaño en bytes | Sí |
| name | Nombre del archivo | No |
| extension | Extensión del archivo | No |
| modified | Fecha de modificación | No |

## Tecnologías

- **React 18** + TypeScript
- **Vite** - Build tool
- **Tailwind CSS** - Estilos
- **D3.js** - Visualización treemap
- **Recharts** - Gráficos de estadísticas
- **Zustand** - Estado global
- **Web Workers** - Procesamiento de CSV en segundo plano
- **@tanstack/react-virtual** - Virtualización de listas grandes

## Estructura del proyecto

```
.
├── src/                    # Código fuente de la aplicación
│   ├── components/         # Componentes React
│   ├── stores/             # Estado global (Zustand)
│   ├── utils/              # Utilidades
│   ├── workers/            # Web Workers
│   └── types/              # Tipos TypeScript
├── create_dropbox_inventory/   # Script para crear inventario
│   └── create_inventory.py
└── public/                 # Archivos estáticos
```

## Licencia

MIT
