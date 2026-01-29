# dbt-docs-modern

A modern, single-file alternative to dbt-docs with enhanced UI and better user experience.

## Features

- ✨ **Modern UI** - Clean, intuitive interface built with Svelte + Tailwind CSS
- 🌙 **Dark Mode** - Automatic theme switching
- 📊 **Enhanced Stats** - Better visualization of project metrics
- 🔍 **Improved Search** - Fast, client-side search across all resources
- 📱 **Responsive** - Works great on all devices
- ⚡ **Single File** - Everything bundled into one `index.html` (43KB)
- 🔄 **Drop-in Replacement** - Compatible with `dbt docs serve`

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

This generates a single `dist/index.html` file that includes all JS and CSS inlined.

## Usage

### With dbt

1. Run `dbt docs generate` in your dbt project
2. Copy `dist/index.html` from this project to your dbt project's `target/` directory
3. Copy `manifest.json` and `catalog.json` to the same directory
4. Run `dbt docs serve` or open `index.html` directly

### Standalone

Place `index.html`, `manifest.json`, and `catalog.json` in the same directory and open in a browser.

## What's Included

- **Stats Dashboard** - Quick overview of models, sources, tests
- **Model Explorer** - Browse and search all models
- **Dark Mode** - Toggle between light and dark themes
- **Responsive Design** - Mobile-friendly layout
- **Fast Search** - Real-time filtering

## Coming Soon

- 📈 **Enhanced Lineage Graph** - Interactive DAG visualization
- 🏷️ **Tags & Filtering** - Better organization
- 📝 **Column Details** - Expanded metadata views
- 🔗 **Dependency Tree** - Visual dependencies
- 💾 **Export** - Download documentation as PDF
- 🎯 **Model Details** - Full model view with SQL, tests, etc.

## Tech Stack

- **Svelte** - Reactive UI framework
- **Vite** - Build tool
- **Tailwind CSS** - Utility-first CSS
- **vite-plugin-singlefile** - Bundle everything into one HTML

## License

MIT
