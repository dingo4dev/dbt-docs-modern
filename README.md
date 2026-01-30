# dbt-docs-modern

A modern, single-file alternative to dbt-docs with enhanced UI and better user experience.

## 🎯 Live Demo

See it in action with a real dbt project:  
👉 **[dbt-medallion-demo](https://github.com/dingo4dev/dbt-medallion-demo)** - Medallion architecture with dbt-duckdb

📺 **[Live Demo](https://bot.deepahub.com/demo/modern-docs.html)** - Interactive dbt docs

Download `demo/modern-docs.html` from that repo and open in your browser!

## Features

- ✨ **Modern UI** - Clean, intuitive interface built with Svelte + Tailwind CSS
- 🌙 **Dark Mode** - Automatic theme switching
- 📊 **Enhanced Stats** - Better visualization of project metrics
- 🔍 **Improved Search** - Fast, client-side search across all resources
- 📱 **Responsive** - Works great on all devices
- ⚡ **Single File** - Everything bundled into one `index.html` (~22KB)
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
2. Copy `dist/index.html` from this project to your dbt project's `target/` directory as `modern-docs.html`
3. The `manifest.json` and `catalog.json` files are already in `target/`
4. Open `modern-docs.html` in a browser or serve the directory

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

- **Svelte 4** - Reactive UI framework (stable)
- **Vite 5** - Build tool
- **Tailwind CSS 4** - Utility-first CSS
- **vite-plugin-singlefile** - Bundle everything into one HTML

## Why Svelte 4?

This project uses Svelte 4 instead of Svelte 5 for maximum compatibility with single-file builds. Svelte 5's new runes API has issues with `effect_orphan` errors when bundled into standalone HTML files. Svelte 4 provides a stable, proven foundation.

## License

MIT
