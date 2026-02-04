<script>
  import { onMount } from 'svelte';
  import LineageGraph from './LineageGraph.svelte';
  
  let manifest = null;
  let catalog = null;
  let loading = true;
  let error = null;
  let darkMode = false;
  let searchQuery = '';
  let selectedNode = null;
  let view = 'overview'; // 'overview' or 'detail'
  let selectedTags = []; // For tag filtering
  let selectedMaterializations = []; // For materialization filtering
  let copiedCode = false; // For copy feedback
  let groupBy = 'none'; // 'none', 'schema', 'database'
  let sortBy = 'name'; // 'name', 'updated', 'dependencies'
  let showLineage = false; // Show lineage graph
  let lineageModel = null; // Model for lineage view
  
  // Recent & Favorites
  let recentModels = []; // Array of model unique_ids
  let favoriteModels = []; // Array of model unique_ids
  let showRecents = false;
  let showFavorites = false;
  
  // Tag filter UI state
  let showAllTags = false;
  const MAX_VISIBLE_TAGS = 5; // Show first 5 tags on mobile
  
  // Navigation breadcrumb
  let breadcrumb = []; // Array of { type, name, id }
  
  // Sidebar navigation (default closed on mobile, open on desktop)
  let sidebarOpen = true;
  let expandedFolders = new Set(); // Set of expanded folder paths (e.g., "models.staging")

  // Load manifest and catalog
  onMount(async () => {
    try {
      // Initialize dark mode from system preference or localStorage
      const savedDarkMode = localStorage.getItem('dbt-docs-dark-mode');
      if (savedDarkMode !== null) {
        darkMode = savedDarkMode === 'true';
      } else {
        darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      if (darkMode) {
        document.documentElement.classList.add('dark');
      }
      
      // Load recent/favorites from localStorage
      const savedRecents = localStorage.getItem('dbt-docs-recents');
      const savedFavorites = localStorage.getItem('dbt-docs-favorites');
      
      if (savedRecents) recentModels = JSON.parse(savedRecents);
      if (savedFavorites) favoriteModels = JSON.parse(savedFavorites);
      
      // Try multiple paths to support different deployments
      const paths = [
        { manifest: './manifest.json', catalog: './catalog.json' },
        { manifest: 'manifest.json', catalog: 'catalog.json' },
        { manifest: '/demo/manifest.json', catalog: '/demo/catalog.json' },
        { manifest: '/manifest.json', catalog: '/catalog.json' }
      ];
      
      let loaded = false;
      let lastError = null;
      
      for (const path of paths) {
        try {
          const [manifestRes, catalogRes] = await Promise.all([
            fetch(path.manifest, { 
              cache: 'no-cache',
              headers: { 'Accept': 'application/json' }
            }),
            fetch(path.catalog, { 
              cache: 'no-cache',
              headers: { 'Accept': 'application/json' }
            })
          ]);
          
          if (!manifestRes.ok || !catalogRes.ok) {
            throw new Error(`HTTP error! manifest: ${manifestRes.status}, catalog: ${catalogRes.status}`);
          }
          
          manifest = await manifestRes.json();
          catalog = await catalogRes.json();
          loaded = true;
          break;
        } catch (err) {
          lastError = err;
          console.warn(`Failed to load from ${path.manifest}:`, err);
          continue;
        }
      }
      
      if (!loaded) {
        throw lastError || new Error('Failed to load from all paths');
      }
      
      loading = false;
    } catch (err) {
      console.error('Error loading dbt docs:', err);
      error = `Failed to load dbt documentation files. Make sure manifest.json and catalog.json exist in the same directory.\n\nDetails: ${err.message}`;
      loading = false;
    }
    
    // Handle window resize to auto-close sidebar on mobile
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        sidebarOpen = false;
      }
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });
  
  // Add to recent models (max 10)
  function addToRecent(modelId) {
    recentModels = [modelId, ...recentModels.filter(id => id !== modelId)].slice(0, 10);
    localStorage.setItem('dbt-docs-recents', JSON.stringify(recentModels));
  }
  
  // Toggle favorite
  function toggleFavorite(modelId) {
    if (favoriteModels.includes(modelId)) {
      favoriteModels = favoriteModels.filter(id => id !== modelId);
    } else {
      favoriteModels = [modelId, ...favoriteModels];
    }
    localStorage.setItem('dbt-docs-favorites', JSON.stringify(favoriteModels));
  }
  
  // Check if model is favorite
  function isFavorite(modelId) {
    return favoriteModels.includes(modelId);
  }
  
  // Update breadcrumb
  function updateBreadcrumb(type, name, id) {
    if (type === 'home') {
      breadcrumb = [];
    } else {
      // Replace entire breadcrumb with new item (not append)
      breadcrumb = [{ type, name, id }];
    }
  }
  
  // Navigate via breadcrumb
  function navigateBreadcrumb(index) {
    if (index === -1) {
      // Home
      selectedNode = null;
      view = 'overview';
      breadcrumb = [];
    } else {
      breadcrumb = breadcrumb.slice(0, index + 1);
      const item = breadcrumb[index];
      if (item.type === 'model') {
        selectModel(manifest.nodes[item.id]);
      }
    }
  }

  // Get models from manifest
  $: models = manifest ? Object.values(manifest.nodes || {})
    .filter(node => node.resource_type === 'model') : [];
  
  // Build folder tree from models
  $: folderTree = models.reduce((tree, model) => {
    // Get folder path from model (use schema or package name)
    const folderName = model.schema || model.package_name || 'default';
    
    if (!tree[folderName]) {
      tree[folderName] = { models: [] };
    }
    
    tree[folderName].models.push(model);
    return tree;
  }, {});
  
  $: sources = manifest ? Object.values(manifest.sources || {}) : [];
  
  $: tests = manifest ? Object.values(manifest.nodes || {})
    .filter(node => node.resource_type === 'test') : [];

  // Get all unique tags from models
  $: allTags = models.reduce((tags, model) => {
    if (model.tags && model.tags.length > 0) {
      model.tags.forEach(tag => {
        if (!tags.includes(tag)) tags.push(tag);
      });
    }
    return tags;
  }, []).sort();

  // Get all unique materialization types
  $: allMaterializations = models.reduce((types, model) => {
    const mat = model.config?.materialized || 'view';
    if (!types.includes(mat)) types.push(mat);
    return types;
  }, []).sort();

  // Search and tag filtering
  $: filteredModels = models.filter(model => {
    // Search filter
    const matchesSearch = searchQuery === '' || 
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (model.description && model.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // Tag filter
    const matchesTags = selectedTags.length === 0 ||
      (model.tags && selectedTags.every(tag => model.tags.includes(tag)));
    
    // Materialization filter
    const mat = model.config?.materialized || 'view';
    const matchesMat = selectedMaterializations.length === 0 ||
      selectedMaterializations.includes(mat);
    
    return matchesSearch && matchesTags && matchesMat;
  });
  
  // Build folder tree from models (based on file paths)
  $: folderTree = (() => {
    const tree = {};
    
    models.forEach(model => {
      // Parse file path to create folder structure
      const filePath = model.original_file_path || model.path || model.name;
      const pathParts = filePath.split('/');
      
      // Use first part as root (models, staging, etc.) or 'models' as default
      const rootType = pathParts.length > 1 ? pathParts[0] : 'models';
      
      if (!tree[rootType]) {
        tree[rootType] = { name: rootType, children: {}, models: [] };
      }
      
      let current = tree[rootType];
      
      // Build folder hierarchy (skip root and filename)
      if (pathParts.length > 2) {
        for (let i = 1; i < pathParts.length - 1; i++) {
          const folder = pathParts[i];
          if (!current.children[folder]) {
            current.children[folder] = { name: folder, children: {}, models: [], path: pathParts.slice(0, i + 1).join('/') };
          }
          current = current.children[folder];
        }
      }
      
      // Add model to current folder (either root or leaf subfolder)
      current.models.push(model);
    });
    
    return tree;
  })();
  
  // Auto-expand all root folders when tree is built
  $: if (Object.keys(folderTree).length > 0 && expandedFolders.size === 0) {
    Object.keys(folderTree).forEach(rootName => {
      expandedFolders.add(rootName);
      
      // Also expand all subfolders
      const rootFolder = folderTree[rootName];
      Object.entries(rootFolder.children || {}).forEach(([childName, childFolder]) => {
        expandedFolders.add(childFolder.path || `${rootName}/${childName}`);
      });
    });
    expandedFolders = expandedFolders;
  }
  
  // Toggle folder expansion
  function toggleFolder(path) {
    if (expandedFolders.has(path)) {
      expandedFolders.delete(path);
    } else {
      expandedFolders.add(path);
    }
    expandedFolders = expandedFolders; // Trigger reactivity
  }
  
  // Count total models in folder (including subfolders)
  function countModels(folder) {
    let count = folder.models.length;
    Object.values(folder.children || {}).forEach(child => {
      count += countModels(child);
    });
    return count;
  }

  // Group filtered models
  $: groupedModels = (() => {
    // First sort the filtered models
    let sorted = [...filteredModels];
    
    if (sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'updated') {
      sorted.sort((a, b) => {
        const aTime = a.build_time || 0;
        const bTime = b.build_time || 0;
        return bTime - aTime; // Most recent first
      });
    } else if (sortBy === 'dependencies') {
      sorted.sort((a, b) => {
        const aDeps = a.depends_on?.nodes?.length || 0;
        const bDeps = b.depends_on?.nodes?.length || 0;
        return bDeps - aDeps; // Most dependencies first
      });
    }
    
    // Then group
    if (groupBy === 'none') {
      return { '': sorted };
    } else if (groupBy === 'schema') {
      return sorted.reduce((groups, model) => {
        const key = model.schema || 'unknown';
        if (!groups[key]) groups[key] = [];
        groups[key].push(model);
        return groups;
      }, {});
    } else if (groupBy === 'database') {
      return sorted.reduce((groups, model) => {
        const key = model.database || 'unknown';
        if (!groups[key]) groups[key] = [];
        groups[key].push(model);
        return groups;
      }, {});
    }
    return { '': sorted };
  })();

  // Toggle dark mode
  function toggleDarkMode() {
    darkMode = !darkMode;
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('dbt-docs-dark-mode', String(darkMode));
  }

  // Format timestamp
  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString();
  }

  // Show model details
  function showModelDetail(model) {
    selectedNode = model;
    view = 'detail';
    
    // Add to recent models
    addToRecent(model.unique_id);
    
    // Update breadcrumb
    updateBreadcrumb('model', model.name, model.unique_id);
    
    // Close sidebar on mobile
    if (window.innerWidth < 1024) {
      sidebarOpen = false;
    }
  }

  // Back to overview
  function backToOverview() {
    selectedNode = null;
    view = 'overview';
    breadcrumb = [];
  }

  // Toggle tag filter
  function toggleTag(tag) {
    if (selectedTags.includes(tag)) {
      selectedTags = selectedTags.filter(t => t !== tag);
    } else {
      selectedTags = [...selectedTags, tag];
    }
  }

  // Clear all tag filters
  function clearTags() {
    selectedTags = [];
  }

  // Toggle materialization filter
  function toggleMaterialization(mat) {
    if (selectedMaterializations.includes(mat)) {
      selectedMaterializations = selectedMaterializations.filter(m => m !== mat);
    } else {
      selectedMaterializations = [...selectedMaterializations, mat];
    }
  }

  // Clear all filters
  function clearAllFilters() {
    selectedTags = [];
    selectedMaterializations = [];
    searchQuery = '';
  }

  // Get columns for a model from catalog
  function getColumns(model) {
    if (!catalog || !catalog.nodes) return [];
    const catalogNode = catalog.nodes[model.unique_id];
    if (!catalogNode || !catalogNode.columns) return [];
    return Object.values(catalogNode.columns);
  }

  // Get upstream dependencies
  function getUpstreamDeps(model) {
    if (!model.depends_on || !model.depends_on.nodes) return [];
    return model.depends_on.nodes
      .map(nodeId => {
        const node = manifest.nodes[nodeId] || manifest.sources[nodeId];
        return node ? { id: nodeId, name: node.name, type: node.resource_type, node: node } : null;
      })
      .filter(Boolean);
  }

  // Get tests for a model
  function getModelTests(model) {
    return tests.filter(test => 
      test.depends_on && test.depends_on.nodes && 
      test.depends_on.nodes.includes(model.unique_id)
    );
  }

  // Get downstream dependencies (models that depend on this one)
  function getDownstreamDeps(model) {
    return models.filter(m => 
      m.depends_on && m.depends_on.nodes && 
      m.depends_on.nodes.includes(model.unique_id)
    ).map(m => ({ id: m.unique_id, name: m.name, type: 'model', node: m }));
  }

  // Show lineage graph
  function showLineageGraph(model) {
    lineageModel = model;
    showLineage = true;
  }

  // Close lineage
  function closeLineage() {
    showLineage = false;
    lineageModel = null;
  }

  // Copy SQL to clipboard
  async function copySQLCode() {
    const code = selectedNode.compiled_code || selectedNode.raw_code;
    if (!code) return;
    
    try {
      await navigator.clipboard.writeText(code);
      copiedCode = true;
      setTimeout(() => {
        copiedCode = false;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
</script>

<main class="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
  <!-- Header -->
  <header class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
    <div class="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-3 sm:py-4">
      <div class="flex items-center justify-between">
        <!-- Logo + Menu Button (Mobile) -->
        <div class="flex items-center gap-2 sm:gap-3">
          <!-- Mobile Menu Button -->
          <button
            on:click={() => sidebarOpen = !sidebarOpen}
            class="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={sidebarOpen ? 'Close menu' : 'Open menu'}
          >
            <svg class="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {#if sidebarOpen}
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              {:else}
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
              {/if}
            </svg>
          </button>
          
          <!-- Material Docs Logo: M shape with stacked layers -->
          <svg class="w-6 h-6 sm:w-8 sm:h-8" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="matGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#FF6B35;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#F7931E;stop-opacity:1" />
              </linearGradient>
              <linearGradient id="matGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#F7931E;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#FFB74D;stop-opacity:1" />
              </linearGradient>
            </defs>
            
            <!-- Layer 3 (back, lightest) -->
            <path d="M 20 65 L 20 75 L 30 65 L 40 75 L 50 55 L 60 75 L 70 65 L 80 75 L 80 65 L 70 55 L 60 65 L 50 45 L 40 65 L 30 55 Z" 
                  fill="url(#matGrad2)" opacity="0.5"/>
            
            <!-- Layer 2 (middle) -->
            <path d="M 20 50 L 20 60 L 30 50 L 40 60 L 50 40 L 60 60 L 70 50 L 80 60 L 80 50 L 70 40 L 60 50 L 50 30 L 40 50 L 30 40 Z" 
                  fill="url(#matGrad1)" opacity="0.7"/>
            
            <!-- Layer 1 (front, darkest) -->
            <path d="M 20 35 L 20 45 L 30 35 L 40 45 L 50 25 L 60 45 L 70 35 L 80 45 L 80 35 L 70 25 L 60 35 L 50 15 L 40 35 L 30 25 Z" 
                  fill="url(#matGrad1)"/>
          </svg>
          <div class="hidden sm:block">
            <h1 class="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Material Docs</h1>
            <p class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hidden md:block">for dbt</p>
          </div>
          <h1 class="sm:hidden text-base font-bold text-gray-900 dark:text-white">Material Docs</h1>
        </div>
        
        <div class="flex items-center gap-1 sm:gap-2">
          <!-- Recent Models -->
          <div class="relative">
            <button
              on:click={() => showRecents = !showRecents}
              class="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative"
              title="Recent models"
            >
              <svg class="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              {#if recentModels.length > 0}
                <span class="absolute top-0 right-0 w-2 h-2 bg-blue-600 rounded-full"></span>
              {/if}
            </button>
            
            {#if showRecents && recentModels.length > 0}
              <div class="fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 top-16 sm:top-auto mt-2 sm:w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 max-h-[60vh] overflow-y-auto">
                <div class="p-2">
                  <div class="flex items-center justify-between px-2 py-1 mb-1">
                    <div class="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      Recent Models
                    </div>
                    <button
                      on:click={() => showRecents = false}
                      class="sm:hidden p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                  {#each recentModels.slice(0, 10) as modelId}
                    {@const model = manifest.nodes[modelId]}
                    {#if model}
                      <button
                        on:click={() => { showModelDetail(model); showRecents = false; }}
                        class="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      >
                        <div class="font-medium text-gray-900 dark:text-white truncate">{model.name}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 truncate">{model.schema}</div>
                      </button>
                    {/if}
                  {/each}
                </div>
              </div>
            {/if}
          </div>
          
          <!-- Favorites -->
          <div class="relative">
            <button
              on:click={() => showFavorites = !showFavorites}
              class="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative"
              title="Favorite models"
            >
              <svg class="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 dark:text-gray-300" fill={favoriteModels.length > 0 ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
              </svg>
              {#if favoriteModels.length > 0}
                <span class="absolute -top-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-yellow-500 text-white text-[10px] sm:text-xs rounded-full flex items-center justify-center font-bold">
                  {favoriteModels.length}
                </span>
              {/if}
            </button>
            
            {#if showFavorites && favoriteModels.length > 0}
              <div class="fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 top-16 sm:top-auto mt-2 sm:w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 max-h-[60vh] overflow-y-auto">
                <div class="p-2">
                  <div class="flex items-center justify-between px-2 py-1 mb-1">
                    <div class="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      Favorite Models
                    </div>
                    <button
                      on:click={() => showFavorites = false}
                      class="sm:hidden p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                  {#each favoriteModels as modelId}
                    {@const model = manifest.nodes[modelId]}
                    {#if model}
                      <button
                        on:click={() => { showModelDetail(model); showFavorites = false; }}
                        class="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      >
                        <div class="font-medium text-gray-900 dark:text-white truncate">{model.name}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 truncate">{model.schema}</div>
                      </button>
                    {/if}
                  {/each}
                </div>
              </div>
            {/if}
          </div>
          
          <!-- Dark mode toggle -->
          <button 
            on:click={toggleDarkMode}
            class="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {#if darkMode}
              <svg class="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"/>
              </svg>
            {:else}
              <svg class="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
              </svg>
            {/if}
          </button>
        </div>
      </div>
      
      <!-- Breadcrumb Navigation -->
      {#if breadcrumb.length > 0}
        <div class="mt-2 sm:mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
          <button
            on:click={() => navigateBreadcrumb(-1)}
            class="flex items-center gap-1 sm:gap-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors whitespace-nowrap"
          >
            <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
            </svg>
            <span class="hidden sm:inline">Home</span>
          </button>
          
          {#each breadcrumb as item, i}
            <span class="text-gray-400 dark:text-gray-600">/</span>
            <button
              on:click={() => navigateBreadcrumb(i)}
              class={`hover:text-orange-500 transition-colors truncate max-w-[200px] sm:max-w-xs ${
                i === breadcrumb.length - 1
                  ? 'text-orange-500 font-medium'
                  : 'text-gray-600 dark:text-gray-300'
              }`}
            >
              {item.name}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </header>
  
  
  {#if loading}
    <div class="flex items-center justify-center h-96">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
        <p class="text-gray-600 dark:text-gray-400">Loading documentation...</p>
      </div>
    </div>
  {:else if error}
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
        <h2 class="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">Error Loading Documentation</h2>
        <p class="text-red-600 dark:text-red-300">{error}</p>
      </div>
    </div>
  {:else}
    <!-- Main Layout with Sidebar -->
    <div class="flex min-h-screen">
      <!-- Mobile Backdrop Overlay -->
      {#if sidebarOpen}
        <button 
          class="lg:hidden fixed inset-0 bg-black/50 z-40 top-14 sm:top-16 w-full h-full border-0 cursor-pointer"
          on:click={() => sidebarOpen = false}
          aria-label="Close sidebar"
        ></button>
      {/if}
      
      <!-- Mobile sidebar backdrop -->
      {#if sidebarOpen}
        <div 
          class="fixed inset-0 z-40 bg-gray-900/80 backdrop-blur-sm lg:hidden"
          on:click={() => sidebarOpen = false}
        ></div>
      {/if}
      
      <!-- Mobile sidebar -->
      <div class="fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-gray-900 transform transition-transform duration-300 lg:hidden {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}">
        <div class="flex h-16 shrink-0 items-center px-6 border-b border-gray-200 dark:border-white/10">
          <span class="text-lg font-bold text-gray-900 dark:text-white">Material Docs</span>
        </div>
        <nav class="flex-1 overflow-y-auto p-3">
          <ul class="space-y-1">
            {#if Object.keys(folderTree).length === 0}
              <li class="text-sm text-gray-500 dark:text-gray-400">No models found.</li>
            {:else}
              {#each Object.entries(folderTree) as [rootName, rootFolder]}
                <li>
                  <button on:click={() => toggleFolder(rootName)} class="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <svg class="w-4 h-4 transition-transform {expandedFolders.has(rootName) ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                    </svg>
                    <span>{rootName}</span>
                    <span class="ml-auto text-xs text-gray-500">{countModels(rootFolder)}</span>
                  </button>
                  {#if expandedFolders.has(rootName)}
                    <ul class="mt-1 ml-4 space-y-1">
                      {#each rootFolder.models as model}
                        <li>
                          <button on:click={() => { showModelDetail(model); sidebarOpen = false; }} class="w-full text-left px-3 py-1.5 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                            {model.name}
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </li>
              {/each}
            {/if}
          </ul>
        </nav>
      </div>
      
      <!-- Desktop sidebar -->
      <div class="hidden lg:block lg:fixed lg:inset-y-0 lg:z-30 lg:w-64 border-r border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900 transition-transform duration-300 {sidebarOpen ? '' : 'lg:-translate-x-full'}">
        <div class="flex grow flex-col gap-y-5 overflow-y-auto px-6 pb-4">
          <div class="flex h-16 shrink-0 items-center">
            <span class="text-xl font-bold text-gray-900 dark:text-white">Material Docs</span>
          </div>
          <nav class="flex flex-1 flex-col">
            <ul role="list" class="flex flex-1 flex-col gap-y-7">
              <li>
                <ul role="list" class="-mx-2 space-y-1">
                  {#if Object.keys(folderTree).length === 0}
                    <li class="text-sm text-gray-500 dark:text-gray-400 px-2">No models found.</li>
                  {:else}
                    {#each Object.entries(folderTree) as [rootName, rootFolder]}
                      <li>
                        <button on:click={() => toggleFolder(rootName)} class="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                          <svg class="w-4 h-4 transition-transform {expandedFolders.has(rootName) ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                          </svg>
                          <span>{rootName}</span>
                          <span class="ml-auto text-xs text-gray-500">{countModels(rootFolder)}</span>
                        </button>
                        {#if expandedFolders.has(rootName)}
                          <ul class="mt-1 ml-4 space-y-1">
                            {#each rootFolder.models as model}
                              <li>
                                <button on:click={() => showModelDetail(model)} class="w-full text-left px-2 py-1 text-sm rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 {selectedNode?.unique_id === model.unique_id ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium' : ''}">
                                  {model.name}
                                </button>
                              </li>
                            {/each}
                          </ul>
                        {/if}
                      </li>
                    {/each}
                  {/if}
                </ul>
              </li>
            </ul>
          </nav>
        </div>
      </div>
      

      
      <!-- Mobile header -->
      <div class="sticky top-0 z-30 flex items-center gap-x-4 bg-white px-4 py-3 shadow-sm sm:px-6 lg:hidden dark:bg-gray-800 dark:shadow-none dark:border-b dark:border-white/10">
        <button type="button" on:click={() => sidebarOpen = !sidebarOpen} class="-m-2.5 p-2.5 text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
          <span class="sr-only">Open sidebar</span>
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/>
          </svg>
        </button>
        <div class="flex-1 text-sm/6 font-semibold text-gray-900 dark:text-white">Material Docs</div>
      </div>
      
      <!-- Desktop sidebar toggle button -->
      <button
        on:click={() => sidebarOpen = !sidebarOpen}
        class="hidden lg:flex fixed top-1/2 z-40 w-6 h-12 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-r-lg items-center justify-center shadow-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300 {sidebarOpen ? 'left-64' : 'left-0'}"
        style="transform: translateY(-50%);"
        title="Toggle sidebar"
      >
        <svg class="w-4 h-4 text-gray-600 dark:text-gray-300 transition-transform {sidebarOpen ? '' : 'rotate-180'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
      </button>
      
      <!-- Main Content -->
      

        
        <div class="transition-all duration-300" class:lg:ml-64={sidebarOpen}>
    {#if view === 'overview'}
    <!-- Stats Overview -->
    <div class="mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 max-w-7xl">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 lg:p-6 min-h-[80px] sm:min-h-[96px]">
          <div class="flex items-center h-full">
            <div class="flex-shrink-0 bg-blue-500 rounded-lg p-2 sm:p-3">
              <svg class="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <div class="ml-2 sm:ml-3 lg:ml-4">
              <p class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Models</p>
              <p class="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 dark:text-white">{models.length}</p>
            </div>
          </div>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 lg:p-6 min-h-[80px] sm:min-h-[96px]">
          <div class="flex items-center h-full">
            <div class="flex-shrink-0 bg-green-500 rounded-lg p-2 sm:p-3">
              <svg class="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
              </svg>
            </div>
            <div class="ml-2 sm:ml-3 lg:ml-4">
              <p class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Sources</p>
              <p class="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 dark:text-white">{sources.length}</p>
            </div>
          </div>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 lg:p-6 min-h-[80px] sm:min-h-[96px]">
          <div class="flex items-center h-full">
            <div class="flex-shrink-0 bg-purple-500 rounded-lg p-2 sm:p-3">
              <svg class="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
            </div>
            <div class="ml-2 sm:ml-3 lg:ml-4">
              <p class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Tests</p>
              <p class="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 dark:text-white">{tests.length}</p>
            </div>
          </div>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 lg:p-6 min-h-[80px] sm:min-h-[96px]">
          <div class="flex items-center h-full">
            <div class="flex-shrink-0 bg-blue-600 rounded-lg p-2 sm:p-3">
              <svg class="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div class="ml-2 sm:ml-3 lg:ml-4 min-w-0 flex-1">
              <p class="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Generated</p>
              <p class="text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-900 dark:text-white truncate">{formatDate(manifest.metadata.generated_at)}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Search Bar -->
      <div class="mb-4 sm:mb-6">
        <div class="relative">
          <input 
            type="text" 
            bind:value={searchQuery}
            placeholder="Search models, sources, tests..."
            class="w-full px-3 sm:px-4 py-2 sm:py-3 pl-9 sm:pl-11 text-sm sm:text-base rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          <svg class="absolute left-2.5 sm:left-3 top-2.5 sm:top-3.5 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        </div>
      </div>

      <!-- Tag Filter -->
      {#if allTags.length > 0}
        <div class="mb-4 sm:mb-6">
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4">
            <div class="flex items-center justify-between mb-2 sm:mb-3">
              <h3 class="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">Filter by Tags</h3>
              {#if selectedTags.length > 0}
                <button
                  on:click={clearTags}
                  class="text-xs text-blue-600 dark:text-blue-400 hover:text-orange-700 dark:hover:text-orange-300 font-medium"
                >
                  Clear all
                </button>
              {/if}
            </div>
            <div class="flex flex-wrap gap-1.5 sm:gap-2">
              {#each (showAllTags ? allTags : allTags.slice(0, MAX_VISIBLE_TAGS)) as tag}
                <button
                  on:click={() => toggleTag(tag)}
                  class={`inline-flex items-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-blue-600 text-white hover:bg-orange-600'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  <svg class="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1 sm:mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
                  </svg>
                  {tag}
                  {#if selectedTags.includes(tag)}
                    <svg class="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-1 sm:ml-1.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                    </svg>
                  {/if}
                </button>
              {/each}
              
              {#if allTags.length > MAX_VISIBLE_TAGS}
                <button
                  on:click={() => showAllTags = !showAllTags}
                  class="inline-flex items-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500 transition-colors"
                >
                  {showAllTags ? '− Less' : `+ ${allTags.length - MAX_VISIBLE_TAGS} more`}
                </button>
              {/if}
            </div>
            {#if selectedTags.length > 0}
              <div class="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Showing models with {selectedTags.length === 1 ? 'tag' : 'all tags'}: 
                <span class="font-medium text-gray-700 dark:text-gray-300">{selectedTags.join(', ')}</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Materialization Filter -->
      {#if allMaterializations.length > 1}
        <div class="mb-6">
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Materialization Type</h3>
            </div>
            <div class="flex flex-wrap gap-2">
              {#each allMaterializations as mat}
                <button
                  on:click={() => toggleMaterialization(mat)}
                  class={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    selectedMaterializations.includes(mat)
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  <svg class="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                  </svg>
                  {mat}
                  {#if selectedMaterializations.includes(mat)}
                    <svg class="w-3 h-3 ml-1.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                    </svg>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      <!-- Clear All Filters -->
      {#if selectedTags.length > 0 || selectedMaterializations.length > 0 || searchQuery !== ''}
        <div class="mb-6">
          <button
            on:click={clearAllFilters}
            class="w-full px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
          >
            <svg class="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
            Clear All Filters
          </button>
        </div>
      {/if}

      <!-- Models List -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div class="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div class="flex items-baseline gap-2">
              <h2 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Models</h2>
              <span class="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                {filteredModels.length} of {models.length}
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
              <div class="flex items-center gap-1.5">
                <span class="text-gray-500 dark:text-gray-400">Sort:</span>
                <select
                  bind:value={sortBy}
                  class="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="name">Name</option>
                  <option value="updated">Recently Updated</option>
                  <option value="dependencies">Dependencies</option>
                </select>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-gray-500 dark:text-gray-400">Group:</span>
                <select
                  bind:value={groupBy}
                  class="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="none">None</option>
                  <option value="schema">Schema</option>
                  <option value="database">Database</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div class="divide-y divide-gray-200 dark:divide-gray-700">
          {#each Object.keys(groupedModels).sort() as groupKey}
            {#if groupBy !== 'none'}
              <div class="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 bg-gray-50 dark:bg-gray-900/50">
                <h3 class="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  {groupKey} ({groupedModels[groupKey].length})
                </h3>
              </div>
            {/if}
            {#each (groupBy === 'none' ? groupedModels[groupKey].slice(0, 50) : groupedModels[groupKey]) as model}
              <button
                on:click={() => showModelDetail(model)}
                class="w-full px-3 sm:px-4 lg:px-6 py-3 sm:py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
              >
                <div class="flex items-start sm:items-center justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate">{model.name}</h3>
                    {#if model.description}
                      <p class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{model.description}</p>
                    {/if}
                    <div class="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
                      {#if groupBy === 'none'}
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          {model.schema}
                        </span>
                      {/if}
                      {#if model.config?.materialized}
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                          {model.config.materialized}
                        </span>
                      {/if}
                    </div>
                  </div>
                  <svg class="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                  </svg>
                </div>
              </button>
            {/each}
          {/each}
          {#if filteredModels.length === 0}
            <div class="px-3 sm:px-6 py-6 sm:py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No models found matching "{searchQuery}"
            </div>
          {/if}
        </div>
      </div>
    </div>
    {:else if view === 'detail' && selectedNode}
    <!-- Model Detail View -->
    <div class="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">
      <!-- Back Button -->
      <button 
        on:click={backToOverview}
        class="mb-4 sm:mb-6 inline-flex items-center px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        Back to Overview
      </button>

      <!-- Model Header -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6 mb-4 sm:mb-6">
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 sm:gap-3 mb-2">
              <h1 class="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white truncate">{selectedNode.name}</h1>
              
              <!-- Favorite Star Button -->
              <button
                on:click={() => toggleFavorite(selectedNode.unique_id)}
                class="flex-shrink-0 p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={isFavorite(selectedNode.unique_id) ? 'Remove from favorites' : 'Add to favorites'}
              >
                <svg 
                  class="w-5 h-5 sm:w-6 sm:h-6 transition-colors"
                  fill={isFavorite(selectedNode.unique_id) ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  class:text-yellow-500={isFavorite(selectedNode.unique_id)}
                  class:text-gray-400={!isFavorite(selectedNode.unique_id)}
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                </svg>
              </button>
            </div>
            
            {#if selectedNode.description}
              <p class="text-sm sm:text-base lg:text-lg text-gray-600 dark:text-gray-300 mb-3 sm:mb-4">{selectedNode.description}</p>
            {/if}
            <div class="flex flex-wrap items-center gap-1.5 sm:gap-2 lg:gap-3">
              <span class="inline-flex items-center px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                <svg class="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
                </svg>
                {selectedNode.schema}
              </span>
              {#if selectedNode.config?.materialized}
                <span class="inline-flex items-center px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  <svg class="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                  </svg>
                  {selectedNode.config.materialized}
                </span>
              {/if}
              {#if selectedNode.config?.tags && selectedNode.config.tags.length > 0}
                {#each selectedNode.config.tags as tag}
                  <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                    <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
                    </svg>
                    {tag}
                  </span>
                {/each}
              {/if}
            </div>
          </div>
          <div>
            <button
              on:click={() => showLineageGraph(selectedNode)}
              class="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-orange-600 rounded-lg transition-colors"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7h16M4 12h16m-7 5h7"/>
              </svg>
              View Lineage
            </button>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main Content (Left) -->
        <div class="lg:col-span-2 space-y-6">
          <!-- SQL -->
          {#if selectedNode.raw_code || selectedNode.compiled_code}
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div class="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">SQL</h2>
                <button
                  on:click={copySQLCode}
                  class="inline-flex items-center px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors {copiedCode ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
                  title="Copy SQL to clipboard"
                >
                  {#if copiedCode}
                    <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                    </svg>
                    Copied!
                  {:else}
                    <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                    </svg>
                    Copy
                  {/if}
                </button>
              </div>
              <div class="p-3 sm:p-4 lg:p-6">
                <pre class="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 sm:p-4 overflow-x-auto text-xs sm:text-sm"><code class="text-gray-800 dark:text-gray-200">{selectedNode.compiled_code || selectedNode.raw_code}</code></pre>
              </div>
            </div>
          {/if}

          <!-- Columns -->
          {#if getColumns(selectedNode).length > 0}
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div class="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Columns</h2>
              </div>
              
              <!-- Desktop Table View -->
              <div class="hidden sm:block overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead class="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th class="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                      <th class="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                      <th class="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                    {#each getColumns(selectedNode) as column}
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 lg:px-6 py-3 sm:py-4 text-sm font-medium text-gray-900 dark:text-white">{column.name}</td>
                        <td class="px-4 lg:px-6 py-3 sm:py-4 text-sm text-gray-500 dark:text-gray-400">
                          <code class="px-2 py-0.5 sm:py-1 bg-gray-100 dark:bg-gray-900 rounded text-xs">{column.type}</code>
                        </td>
                        <td class="px-4 lg:px-6 py-3 sm:py-4 text-sm text-gray-500 dark:text-gray-400">{column.comment || '-'}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
              
              <!-- Mobile Card View -->
              <div class="sm:hidden divide-y divide-gray-200 dark:divide-gray-700">
                {#each getColumns(selectedNode) as column}
                  <div class="p-4">
                    <div class="font-medium text-gray-900 dark:text-white text-sm mb-1">{column.name}</div>
                    <div class="mb-2">
                      <code class="px-2 py-0.5 bg-gray-100 dark:bg-gray-900 rounded text-xs text-gray-600 dark:text-gray-400">{column.type}</code>
                    </div>
                    {#if column.comment}
                      <div class="text-xs text-gray-500 dark:text-gray-400">{column.comment}</div>
                    {:else}
                      <div class="text-xs text-gray-400 dark:text-gray-500 italic">No description</div>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Tests -->
          {#if getModelTests(selectedNode).length > 0}
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div class="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Tests</h2>
              </div>
              <div class="divide-y divide-gray-200 dark:divide-gray-700">
                {#each getModelTests(selectedNode) as test}
                  <div class="px-4 sm:px-6 py-3 sm:py-4">
                    <div class="flex items-start">
                      <svg class="w-4 h-4 sm:w-5 sm:h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      <div class="ml-2 sm:ml-3 min-w-0 flex-1">
                        <p class="text-xs sm:text-sm font-medium text-gray-900 dark:text-white break-words">{test.name}</p>
                        {#if test.description}
                          <p class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">{test.description}</p>
                        {/if}
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- Sidebar (Right) -->
        <div class="space-y-4 sm:space-y-6">
          <!-- Dependencies -->
          {#if getUpstreamDeps(selectedNode).length > 0}
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div class="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Dependencies</h2>
              </div>
              <div class="p-4 sm:p-6 space-y-2">
                {#each getUpstreamDeps(selectedNode) as dep}
                  {#if dep.type === 'model'}
                    <button
                      on:click={() => showModelDetail(dep.node)}
                      class="w-full flex items-center p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 dark:text-gray-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                      </svg>
                      <span class="text-xs sm:text-sm text-gray-700 dark:text-gray-300 truncate">{dep.name}</span>
                      <span class="ml-auto text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">{dep.type}</span>
                      <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 ml-1 sm:ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                      </svg>
                    </button>
                  {:else}
                    <div class="flex items-center p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                      <svg class="w-4 h-4 text-gray-500 dark:text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                      </svg>
                      <span class="text-sm text-gray-700 dark:text-gray-300">{dep.name}</span>
                      <span class="ml-auto text-xs text-gray-500 dark:text-gray-400">{dep.type}</span>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          {/if}

          <!-- File Info -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">File Info</h2>
            </div>
            <div class="p-6 space-y-3">
              <div>
                <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Path</p>
                <code class="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 px-2 py-1 rounded">{selectedNode.original_file_path}</code>
              </div>
              {#if selectedNode.database}
                <div>
                  <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Database</p>
                  <p class="text-sm text-gray-900 dark:text-white">{selectedNode.database}</p>
                </div>
              {/if}
              {#if selectedNode.alias}
                <div>
                  <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Alias</p>
                  <p class="text-sm text-gray-900 dark:text-white">{selectedNode.alias}</p>
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>
    {/if}
    </div>
    </div>
  {/if}

  <!-- Lineage Modal with D3 Graph -->
  {#if showLineage && lineageModel}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click={closeLineage}>
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col" on:click|stopPropagation>
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">
              Lineage Graph: {lineageModel.name}
            </h2>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Interactive dependency visualization
            </p>
          </div>
          <div class="flex items-center gap-3">
            <button
              on:click={() => {
                showLineage = false;
                lineageModel = null;
              }}
              class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              View Full DAG
            </button>
            <button
              on:click={closeLineage}
              class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Graph -->
        <div class="flex-1 overflow-hidden">
          <LineageGraph 
            {manifest} 
            selectedModel={lineageModel.unique_id}
            onModelClick={(modelId) => {
              const model = manifest.nodes[modelId];
              if (model && model.resource_type === 'model') {
                showModelDetail(model);
                closeLineage();
              }
            }}
          />
        </div>
      </div>
    </div>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
  }
  
  /* Layout fixes */
  
  /* 1. Left-align the title */
  :global(header .flex.items-center.justify-between .flex.items-center) {
    justify-content: flex-start !important;
  }
  
  :global(header h1) {
    text-align: left !important;
  }
  
  /* Ensure proper z-index stacking */
  :global(header) {
    z-index: 40 !important;
  }
  
  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    :global(body) {
      background-color: #111827;
    }
  }
</style>
