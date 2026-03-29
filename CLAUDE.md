# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Material Docs for dbt is a modern, mobile-responsive alternative to dbt docs with enhanced UI and better UX. It's a single-file web application that works entirely client-side, loading dbt's `manifest.json` and `catalog.json` files to display interactive documentation.

**Key Tech Stack:**
- Svelte 4 (not Svelte 5 - see note below)
- Vite 5 (build tool with HMR)
- Tailwind CSS 3 with custom OKLCH color system
- D3.js v7 (for lineage graph visualization)
- vite-plugin-singlefile (bundles everything into one HTML file)

## Common Development Commands

### Development
```bash
npm run dev
```
Starts development server at http://localhost:5173 with hot reload.

**Development Data:** Place `manifest.json` and `catalog.json` in the `data/` directory for local testing. The app tries multiple paths to load these files, supporting different deployment scenarios.

### Build
```bash
npm run build
```
Generates a single `dist/index.html` file (~198KB, ~55KB gzipped) with all JS and CSS inlined. This is the production artifact.

### Preview
```bash
npm run preview
```
Preview the production build locally.

## Architecture

### Svelte 4 Requirement
**Critical:** This project uses Svelte 4, not Svelte 5. The new runes API in Svelte 5 has issues with `effect_orphan` errors in standalone bundles. Svelte 4 provides battle-tested stability for single-file builds.

**Reactive Syntax:** Use Svelte 4's `$:` reactive declarations, not Svelte 5's `$state` or `$derived` runes.

### Component Structure

**App.svelte** - Main application component (~1500 lines)
- Manages all application state (manifest, catalog, UI state, filters)
- Handles data fetching from manifest.json/catalog.json
- Implements mobile-first responsive layout with sidebar navigation
- Uses Svelte directives for reactive updates (`$:`, `#if`, `#each`, `bind:`)
- Key features: search, tag filtering, materialization filtering, favorites, recents

**LineageGraph.svelte** - D3.js force-directed graph visualization
- Renders interactive dependency graph with zoom/pan
- Implements force-directed layout with left-to-right flow
- Filter by resource type (models, sources, seeds, tests, snapshots)
- Mobile-responsive (200px tables on mobile, 300px on desktop)
- Uses D3.js v7 for simulation and rendering

### Data Flow

1. **Data Loading:** App.svelte fetches manifest.json and catalog.json on mount
2. **State Management:** All state is reactive Svelte variables using `$:`
3. **Filtering:** Client-side filtering by tags, materialization, search query
4. **Navigation:** Breadcrumb-based navigation with model detail views

### Styling System

**OKLCH Color Tokens:** The app uses a custom OKLCH color system defined in `src/app.css`:
- Warm neutral palette with amber accent
- Design tokens in `:root` for light mode, `.dark` for dark mode
- Custom utility classes: `.surface`, `.surface-raised`, `.badge`, `.card`

**Tailwind Integration:** Tailwind is configured to use custom color tokens via CSS variables. Use Tailwind utilities for layout (flex, grid, spacing) and custom CSS for themed colors.

### Build Configuration

**vite.config.js:**
- `vite-plugin-singlefile` - Inlines all assets into single HTML
- Asset inline limit: 100MB (ensures everything is bundled)
- Proxy configuration for development: maps `/manifest.json` and `/catalog.json` to `/data/`

**svelte.config.js:** Uses `vitePreprocess()` for Vite integration.

## Key Implementation Patterns

### Reactive Filtering
```svelte
$: filteredModels = models.filter(model => {
  const matchesSearch = searchQuery === '' ||
    model.name.toLowerCase().includes(searchQuery.toLowerCase());
  const matchesTags = selectedTags.length === 0 ||
    (model.tags && selectedTags.every(tag => model.tags.includes(tag)));
  return matchesSearch && matchesTags;
});
```

### Mobile-First Responsive Design
- Mobile breakpoints: < 640px (sm)
- Tablet: 640px - 1024px (sm-lg)
- Desktop: ≥ 1024px (lg)
- Sidebar: Full-screen overlay on mobile, docked on desktop
- Tables: Card layout on mobile, traditional table on desktop

### D3.js Force Simulation
The lineage graph uses a flowchart-style layout with:
- Strong left-to-right horizontal positioning (depth-based)
- Weak vertical positioning (allows stacking)
- Collision detection for responsive table widths
- Animated arrows showing data flow direction

### Local Storage Persistence
- Recent models (max 10)
- Favorite models
- Dark mode preference

## Working with dbt Artifacts

**manifest.json** - Contains dbt project metadata:
- `nodes` - models, sources, seeds, snapshots, analyses, tests
- `exposures` - downstream exposure definitions
- `metrics` - metric definitions
- `metadata.generated_at` - timestamp for docs generation

**catalog.json** - Contains column-level statistics:
- `nodes` - column stats (types, descriptions, comment)
- Must be kept in sync with manifest.json

**Data Loading Pattern:** The app tries multiple paths to support different deployments:
```javascript
const paths = [
  { manifest: './manifest.json', catalog: './catalog.json' },
  { manifest: 'manifest.json', catalog: 'catalog.json' },
  { manifest: '/demo/manifest.json', catalog: '/demo/catalog.json' },
  { manifest: '/manifest.json', catalog: '/catalog.json' }
];
```

## Testing Locally

To test with real dbt artifacts:
1. Run `dbt docs generate` in your dbt project
2. Copy `target/manifest.json` and `target/catalog.json` to `data/` directory
3. Run `npm run dev`
4. The app will load from the development server with proxy configuration

## Deployment

The built `dist/index.html` is a self-contained file. To use:
1. Run `npm run build`
2. Copy `dist/index.html` to your dbt project's `target/` directory
3. Ensure `manifest.json` and `catalog.json` are in the same directory
4. Open the HTML file in a browser or serve via HTTP

## Known Limitations

- Single-file build requires Svelte 4 (not Svelte 5)
- Large projects (>1000 models) may experience slow initial render
- D3 graph performance degrades with >500 nodes (use filters to reduce)
- Mobile Safari may have layout issues with very wide graphs
