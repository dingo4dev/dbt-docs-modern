# Material Docs for dbt

A modern, mobile-responsive alternative to dbt docs with enhanced UI and better UX.

## 🎯 Live Demo

See it in action with a real dbt project:  
👉 **[dbt-medallion-demo](https://github.com/dingo4dev/dbt-medallion-demo)** - Medallion architecture with dbt-duckdb

📺 **[Live Demo](https://bot.deepahub.com/demo/modern-docs.html)** - Interactive dbt documentation viewer

Download `demo/modern-docs.html` from that repo and open in your browser!

## ✨ Features

### 📱 Mobile-First Design
- **Fully Responsive** - Optimized for mobile, tablet, and desktop
- **Touch-Friendly** - Large tap targets, swipe gestures
- **Progressive Sizing** - Text and icons scale across breakpoints
- **Compact Tables** - Card layout on mobile, traditional table on desktop
- **Collapsible Sidebar** - Full-screen overlay on mobile, docked on desktop

### 🎨 Modern UI
- **Clean Interface** - Built with Svelte + Tailwind CSS
- **Dark Mode** - Automatic theme switching with system preference detection
- **Custom Logo** - M-shaped stacked layers representing materialized data layers
- **Smooth Animations** - Transitions and hover effects throughout
- **Hierarchical Navigation** - Folder structure with auto-expand/collapse

### 🔍 Enhanced Discovery
- **Fast Search** - Real-time client-side filtering
- **Tag Filtering** - Multi-select tags with +more compact mode
- **Materialization Filters** - Filter by view, table, incremental, etc.
- **Recent Models** - Quick access to last 10 viewed models
- **Favorites** - Star models for easy access (persistent in localStorage)
- **Sort Options** - By name, recently updated, or dependency count
- **Group By** - Organize by schema or database

### 📊 Interactive Lineage
- **D3.js DAG Visualization** - Force-directed graph with zoom/pan
- **Drag & Reposition** - Move nodes to customize layout
- **Click to Navigate** - Jump to any model from the graph
- **Hover Highlighting** - See upstream/downstream connections
- **Dependency Links** - Navigate between models via clickable refs

### 📋 Model Details
- **Full Model View** - SQL code, columns, tests, metadata
- **Clickable Dependencies** - Navigate upstream and downstream
- **Column Schema** - Data types, descriptions, constraints
- **Test Coverage** - View all tests for a model
- **Breadcrumb Navigation** - Track your path through models
- **Copy SQL** - One-click copy to clipboard

### 🚀 Performance
- **Single File** - Everything bundled into one `index.html` (~198KB, ~55KB gzipped)
- **No Backend** - Pure client-side, works offline
- **Fast Load** - Optimized bundle with code splitting
- **Efficient Rendering** - Virtual scrolling for large model lists

## 📦 Installation

```bash
npm install
```

## 🛠️ Development

```bash
npm run dev
```

Open http://localhost:5173 to see the app. Hot reload is enabled.

## 🏗️ Build

```bash
npm run build
```

This generates a single `dist/index.html` file with all JS and CSS inlined.

## 📖 Usage

### With dbt

1. Run `dbt docs generate` in your dbt project
2. Copy `dist/index.html` to your dbt project's `target/` directory (rename as needed)
3. The `manifest.json` and `catalog.json` are already in `target/`
4. Open the HTML file in a browser or serve via HTTP

### Standalone

Place `index.html`, `manifest.json`, and `catalog.json` in the same directory and open in browser.

### With dbt docs serve

Replace the default `index.html` in your dbt installation's docs templates.

## 🎯 Responsive Breakpoints

- **Mobile:** < 640px (sm) - Stacked layout, fullscreen overlays
- **Tablet:** 640px - 1024px (sm-lg) - Hybrid layout
- **Desktop:** ≥ 1024px (lg) - Full layout with sidebar

## 🎨 Branding

**Name:** Material Docs for dbt  
**Logo:** M-shaped stacked layers (orange gradient)  
**Concept:** Represents materialized data layers in the medallion architecture

**Trademark Compliance:**  
This project uses "for dbt" as descriptive use under Apache License 2.0. The custom logo and branding clearly differentiate from dbt Labs official products.

## 🔮 Roadmap

- [ ] Column-level lineage
- [ ] Test result history
- [ ] Export to PDF/Markdown
- [ ] Graph layout options (tree, circular, hierarchical)
- [ ] OpenLineage API integration
- [ ] Model comparison view
- [ ] Custom themes

## 🛠️ Tech Stack

- **Svelte 4** - Reactive UI framework (stable)
- **Vite 5** - Build tool with HMR
- **Tailwind CSS 3** - Utility-first CSS framework
- **D3.js v7** - Graph visualization & layouts
- **vite-plugin-singlefile** - Single HTML bundler

## 💡 Why Svelte 4?

We use Svelte 4 (not 5) for maximum compatibility with single-file HTML builds. Svelte 5's new runes API has issues with `effect_orphan` errors in standalone bundles. Svelte 4 provides battle-tested stability.

## 📄 License

MIT

## 🙏 Credits

Built by [Stanley Law](https://github.com/dingo4dev)  
Inspired by the official [dbt-docs](https://github.com/dbt-labs/dbt-docs)

## 🔗 Links

- [Live Demo](https://bot.deepahub.com/demo/modern-docs.html)
- [Example Project](https://github.com/dingo4dev/dbt-medallion-demo)
- [dbt Documentation](https://docs.getdbt.com/)
