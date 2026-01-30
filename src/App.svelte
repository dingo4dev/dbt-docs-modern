<script>
  import { onMount } from 'svelte';
  
  let manifest = null;
  let catalog = null;
  let loading = true;
  let error = null;
  let darkMode = false;
  let searchQuery = '';
  let selectedNode = null;
  let view = 'overview'; // 'overview' or 'detail'

  // Load manifest and catalog
  onMount(async () => {
    try {
      // Try to load from current directory (dbt docs serve)
      const [manifestRes, catalogRes] = await Promise.all([
        fetch('./manifest.json'),
        fetch('./catalog.json')
      ]);
      
      manifest = await manifestRes.json();
      catalog = await catalogRes.json();
      loading = false;
    } catch (err) {
      error = 'Failed to load dbt documentation files. Make sure manifest.json and catalog.json exist in the same directory.';
      loading = false;
    }
  });

  // Get models from manifest
  $: models = manifest ? Object.values(manifest.nodes || {})
    .filter(node => node.resource_type === 'model') : [];
  
  $: sources = manifest ? Object.values(manifest.sources || {}) : [];
  
  $: tests = manifest ? Object.values(manifest.nodes || {})
    .filter(node => node.resource_type === 'test') : [];

  // Search filtering
  $: filteredModels = models.filter(model => 
    searchQuery === '' || 
    model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (model.description && model.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Toggle dark mode
  function toggleDarkMode() {
    darkMode = !darkMode;
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  // Format timestamp
  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString();
  }

  // Show model details
  function showModelDetail(model) {
    selectedNode = model;
    view = 'detail';
  }

  // Back to overview
  function backToOverview() {
    selectedNode = null;
    view = 'overview';
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
</script>

<main class="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
  <!-- Header -->
  <header class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <svg class="w-8 h-8 text-orange-500" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.6,9.265l0,0L10.9,6.325a3.31,3.31,0,0,0-.529-.7h0a3.264,3.264,0,0,0-3.184-.867,4.022,4.022,0,0,1,4.194.938,3.977,3.977,0,0,1,.635.833l.38.657a2.488,2.488,0,0,1,.2-.465l2.226-3.851a1.2,1.2,0,0,0-.2-1.5,1.2,1.2,0,0,0-1.5-.2h0L9.27,3.4a2.539,2.539,0,0,1-2.54,0L2.877,1.178A1.253,1.253,0,0,0,2.247,1a1.247,1.247,0,0,0-.871.375,1.2,1.2,0,0,0-.2,1.5L3.4,6.726a2.542,2.542,0,0,1,0,2.539l-2.226,3.85a1.2,1.2,0,0,0,.2,1.5,1.2,1.2,0,0,0,1.5.2L6.73,12.588a2.455,2.455,0,0,1,.465-.2l-.657-.379a3.857,3.857,0,0,1-1.462-1.467,4.118,4.118,0,0,1-.288-3.368,3.453,3.453,0,0,0,.33,2.507A3.141,3.141,0,0,0,6.329,10.89l2.94,1.7h0l3.853,2.224a1.243,1.243,0,0,0,1.7-1.7Z"/>
          </svg>
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">dbt Docs</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400">Modern Documentation</p>
          </div>
        </div>
        
        <button 
          on:click={toggleDarkMode}
          class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {#if darkMode}
            <svg class="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
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
    {#if view === 'overview'}
    <!-- Stats Overview -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div class="flex items-center">
            <div class="flex-shrink-0 bg-blue-500 rounded-lg p-3">
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Models</p>
              <p class="text-2xl font-semibold text-gray-900 dark:text-white">{models.length}</p>
            </div>
          </div>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div class="flex items-center">
            <div class="flex-shrink-0 bg-green-500 rounded-lg p-3">
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Sources</p>
              <p class="text-2xl font-semibold text-gray-900 dark:text-white">{sources.length}</p>
            </div>
          </div>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div class="flex items-center">
            <div class="flex-shrink-0 bg-purple-500 rounded-lg p-3">
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Tests</p>
              <p class="text-2xl font-semibold text-gray-900 dark:text-white">{tests.length}</p>
            </div>
          </div>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div class="flex items-center">
            <div class="flex-shrink-0 bg-orange-500 rounded-lg p-3">
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Generated</p>
              <p class="text-sm font-semibold text-gray-900 dark:text-white">{formatDate(manifest.metadata.generated_at)}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Search Bar -->
      <div class="mb-6">
        <div class="relative">
          <input 
            type="text" 
            bind:value={searchQuery}
            placeholder="Search models, sources, tests..."
            class="w-full px-4 py-3 pl-11 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          <svg class="absolute left-3 top-3.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        </div>
      </div>

      <!-- Models List -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Models</h2>
        </div>
        <div class="divide-y divide-gray-200 dark:divide-gray-700">
          {#each filteredModels.slice(0, 20) as model}
            <button
              on:click={() => showModelDetail(model)}
              class="w-full px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
            >
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <h3 class="text-sm font-medium text-gray-900 dark:text-white">{model.name}</h3>
                  {#if model.description}
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{model.description}</p>
                  {/if}
                  <div class="flex items-center space-x-4 mt-2">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                      {model.schema}
                    </span>
                    {#if model.config?.materialized}
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        {model.config.materialized}
                      </span>
                    {/if}
                  </div>
                </div>
                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </div>
            </button>
          {/each}
          {#if filteredModels.length === 0}
            <div class="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
              No models found matching "{searchQuery}"
            </div>
          {/if}
        </div>
      </div>
    </div>
    {:else if view === 'detail' && selectedNode}
    <!-- Model Detail View -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Back Button -->
      <button 
        on:click={backToOverview}
        class="mb-6 inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        Back to Overview
      </button>

      <!-- Model Header -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
        <div class="flex items-start justify-between">
          <div>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">{selectedNode.name}</h1>
            {#if selectedNode.description}
              <p class="text-lg text-gray-600 dark:text-gray-300 mb-4">{selectedNode.description}</p>
            {/if}
            <div class="flex items-center space-x-3">
              <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
                </svg>
                {selectedNode.schema}
              </span>
              {#if selectedNode.config?.materialized}
                <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main Content (Left) -->
        <div class="lg:col-span-2 space-y-6">
          <!-- SQL -->
          {#if selectedNode.raw_code || selectedNode.compiled_code}
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">SQL</h2>
              </div>
              <div class="p-6">
                <pre class="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto text-sm"><code class="text-gray-800 dark:text-gray-200">{selectedNode.compiled_code || selectedNode.raw_code}</code></pre>
              </div>
            </div>
          {/if}

          <!-- Columns -->
          {#if getColumns(selectedNode).length > 0}
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Columns</h2>
              </div>
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead class="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                    {#each getColumns(selectedNode) as column}
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{column.name}</td>
                        <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                          <code class="px-2 py-1 bg-gray-100 dark:bg-gray-900 rounded text-xs">{column.type}</code>
                        </td>
                        <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{column.comment || '-'}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          {/if}

          <!-- Tests -->
          {#if getModelTests(selectedNode).length > 0}
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Tests</h2>
              </div>
              <div class="divide-y divide-gray-200 dark:divide-gray-700">
                {#each getModelTests(selectedNode) as test}
                  <div class="px-6 py-4">
                    <div class="flex items-start">
                      <svg class="w-5 h-5 text-green-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      <div class="ml-3">
                        <p class="text-sm font-medium text-gray-900 dark:text-white">{test.name}</p>
                        {#if test.description}
                          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{test.description}</p>
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
        <div class="space-y-6">
          <!-- Dependencies -->
          {#if getUpstreamDeps(selectedNode).length > 0}
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Dependencies</h2>
              </div>
              <div class="p-6 space-y-2">
                {#each getUpstreamDeps(selectedNode) as dep}
                  {#if dep.type === 'model'}
                    <button
                      on:click={() => showModelDetail(dep.node)}
                      class="w-full flex items-center p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <svg class="w-4 h-4 text-gray-500 dark:text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                      </svg>
                      <span class="text-sm text-gray-700 dark:text-gray-300">{dep.name}</span>
                      <span class="ml-auto text-xs text-gray-500 dark:text-gray-400">{dep.type}</span>
                      <svg class="w-4 h-4 text-gray-400 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
  }
</style>
