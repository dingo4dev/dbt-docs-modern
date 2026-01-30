<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  
  export let manifest = {};
  export let selectedModel = null;
  export let onModelClick = () => {};
  
  let svgContainer;
  let width = 0;
  let height = 600;
  
  // Filters
  let showModels = true;
  let showSources = true;
  let showSeeds = true;
  let showTests = false; // Hidden by default
  let showSnapshots = true;
  let selectedSchemas = [];
  let selectedDatabases = [];
  let allSchemas = [];
  let allDatabases = [];
  let filtersExpanded = false;
  
  // UI state
  let selectedNode = null;
  let isFullscreen = false;
  let containerElement;
  
  // Extract nodes and edges from manifest
  function buildGraph(manifest, focusModel = null) {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();
    const schemas = new Set();
    const databases = new Set();
    
    // Build nodes from manifest
    Object.entries(manifest.nodes || {}).forEach(([id, node]) => {
      const nodeData = {
        id,
        name: node.name,
        type: node.resource_type,
        materialization: node.config?.materialized || 'view',
        schema: node.schema,
        database: node.database,
        tags: node.tags || [],
        description: node.description || ''
      };
      
      // Track schemas and databases
      if (node.schema) schemas.add(node.schema);
      if (node.database) databases.add(node.database);
      
      nodes.push(nodeData);
      nodeMap.set(id, nodeData);
    });
    
    // Update filter lists
    allSchemas = Array.from(schemas).sort();
    allDatabases = Array.from(databases).sort();
    
    // Build edges from dependencies
    Object.entries(manifest.nodes || {}).forEach(([id, node]) => {
      (node.depends_on?.nodes || []).forEach(depId => {
        if (nodeMap.has(depId)) {
          links.push({
            source: depId,
            target: id
          });
        }
      });
    });
    
    // Apply filters
    let filteredNodes = nodes.filter(n => {
      // Resource type filter
      if (n.type === 'model' && !showModels) return false;
      if (n.type === 'source' && !showSources) return false;
      if (n.type === 'seed' && !showSeeds) return false;
      if (n.type === 'test' && !showTests) return false;
      if (n.type === 'snapshot' && !showSnapshots) return false;
      
      // Schema filter
      if (selectedSchemas.length > 0 && !selectedSchemas.includes(n.schema)) return false;
      
      // Database filter
      if (selectedDatabases.length > 0 && !selectedDatabases.includes(n.database)) return false;
      
      return true;
    });
    
    // If focusModel is specified, filter to show only its lineage
    if (focusModel) {
      const relevantNodes = new Set();
      const visited = new Set();
      
      // Get upstream dependencies (recursive)
      function getUpstream(nodeId) {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        relevantNodes.add(nodeId);
        
        links.forEach(link => {
          if (link.target === nodeId) {
            getUpstream(link.source);
          }
        });
      }
      
      // Get downstream dependencies (recursive)
      function getDownstream(nodeId) {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        relevantNodes.add(nodeId);
        
        links.forEach(link => {
          if (link.source === nodeId) {
            getDownstream(link.target);
          }
        });
      }
      
      visited.clear();
      getUpstream(focusModel);
      visited.clear();
      getDownstream(focusModel);
      
      filteredNodes = filteredNodes.filter(n => relevantNodes.has(n.id));
    }
    
    // Filter links to only include visible nodes
    const visibleNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = links.filter(l => 
      visibleNodeIds.has(l.source) && visibleNodeIds.has(l.target)
    );
    
    return { 
      nodes: filteredNodes, 
      links: filteredLinks 
    };
  }
  
  // Color scheme based on resource type
  function getNodeColor(node) {
    const colors = {
      model: '#f97316', // orange
      source: '#3b82f6', // blue
      seed: '#10b981', // green
      snapshot: '#8b5cf6', // purple
      test: '#ef4444' // red
    };
    return colors[node.type] || '#6b7280';
  }
  
  // Render the graph
  function renderGraph() {
    if (!svgContainer || !width) return;
    
    // Clear existing
    d3.select(svgContainer).selectAll('*').remove();
    
    const { nodes, links } = buildGraph(manifest, selectedModel);
    
    if (nodes.length === 0) {
      d3.select(svgContainer)
        .append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('class', 'fill-gray-500 dark:fill-gray-400')
        .text('No models to display');
      return;
    }
    
    // Create SVG
    const svg = d3.select(svgContainer)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);
    
    // Add zoom behavior
    const g = svg.append('g');
    
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    
    svg.call(zoom);
    
    // Store zoom for re-center function
    window.graphZoom = zoom;
    window.graphSvg = svg;
    window.graphG = g;
    
    // Create force simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(150))
      .force('charge', d3.forceManyBody()
        .strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50));
    
    // Add arrow markers for directed edges with animation
    const defs = svg.append('defs');
    
    // Static arrow
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', '#94a3b8')
      .attr('d', 'M0,-5L10,0L0,5');
    
    // Highlighted arrow (for hover)
    defs.append('marker')
      .attr('id', 'arrow-highlight')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', '#f97316')
      .attr('d', 'M0,-5L10,0L0,5');
    
    // Animated gradient for flowing effect
    const gradient = defs.append('linearGradient')
      .attr('id', 'line-gradient')
      .attr('gradientUnits', 'userSpaceOnUse');
    
    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#94a3b8')
      .attr('stop-opacity', 0.3);
    
    gradient.append('stop')
      .attr('offset', '50%')
      .attr('stop-color', '#f97316')
      .attr('stop-opacity', 1);
    
    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#94a3b8')
      .attr('stop-opacity', 0.3);
    
    // Animate the gradient
    gradient.append('animate')
      .attr('attributeName', 'x1')
      .attr('values', '0%;100%')
      .attr('dur', '3s')
      .attr('repeatCount', 'indefinite');
    
    gradient.append('animate')
      .attr('attributeName', 'x2')
      .attr('values', '100%;200%')
      .attr('dur', '3s')
      .attr('repeatCount', 'indefinite');
    
    // Draw links (two layers: base + animated)
    const linkGroup = g.append('g');
    
    // Base links
    const link = linkGroup.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'base-link stroke-gray-300 dark:stroke-gray-600')
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#arrow)');
    
    // Animated links (flowing effect)
    const animatedLink = linkGroup.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'animated-link')
      .attr('stroke', 'url(#line-gradient)')
      .attr('stroke-width', 3)
      .attr('opacity', 0.6)
      .attr('stroke-dasharray', '5,5');
    
    // Draw nodes
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));
    
    // Node circles
    node.append('circle')
      .attr('r', 20)
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', d => d.id === selectedModel ? '#fbbf24' : '#fff')
      .attr('stroke-width', d => d.id === selectedModel ? 4 : 2)
      .attr('class', 'transition-all');
    
    // Node labels
    node.append('text')
      .text(d => d.name)
      .attr('x', 0)
      .attr('y', 35)
      .attr('text-anchor', 'middle')
      .attr('class', 'fill-gray-700 dark:fill-gray-300 text-xs font-medium pointer-events-none');
    
    // Node type badge
    node.append('text')
      .text(d => d.type.charAt(0).toUpperCase())
      .attr('x', 0)
      .attr('y', 5)
      .attr('text-anchor', 'middle')
      .attr('class', 'fill-white text-xs font-bold pointer-events-none');
    
    // Click handler
    node.on('click', (event, d) => {
      event.stopPropagation();
      selectedNode = d;
      // Also trigger the parent callback if it's a model
      if (d.type === 'model') {
        onModelClick(d.id);
      }
    });
    
    // Hover effects
    node.on('mouseenter', function(event, d) {
      d3.select(this).select('circle')
        .transition()
        .duration(200)
        .attr('r', 25);
      
      // Highlight connected links
      link
        .attr('class', l => 
          (l.source.id === d.id || l.target.id === d.id)
            ? 'base-link stroke-orange-500 dark:stroke-orange-400'
            : 'base-link stroke-gray-300 dark:stroke-gray-600'
        )
        .attr('stroke-width', l => 
          (l.source.id === d.id || l.target.id === d.id) ? 3 : 2
        )
        .attr('marker-end', l =>
          (l.source.id === d.id || l.target.id === d.id) 
            ? 'url(#arrow-highlight)' 
            : 'url(#arrow)'
        );
      
      // Make animated links more visible on connected edges
      animatedLink
        .attr('opacity', l => 
          (l.source.id === d.id || l.target.id === d.id) ? 0.9 : 0.3
        );
    });
    
    node.on('mouseleave', function(event, d) {
      d3.select(this).select('circle')
        .transition()
        .duration(200)
        .attr('r', 20);
      
      link
        .attr('class', 'base-link stroke-gray-300 dark:stroke-gray-600')
        .attr('stroke-width', 2)
        .attr('marker-end', 'url(#arrow)');
      
      animatedLink
        .attr('opacity', 0.6);
    });
    
    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      
      animatedLink
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });
    
    // Drag functions
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    
    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
    
    // Initial zoom to fit
    const bounds = g.node().getBBox();
    const fullWidth = bounds.width;
    const fullHeight = bounds.height;
    const midX = bounds.x + fullWidth / 2;
    const midY = bounds.y + fullHeight / 2;
    
    if (fullWidth === 0 || fullHeight === 0) return;
    
    const scale = 0.8 / Math.max(fullWidth / width, fullHeight / height);
    const translate = [width / 2 - scale * midX, height / 2 - scale * midY];
    
    svg.transition()
      .duration(750)
      .call(
        zoom.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
      );
  }
  
  onMount(() => {
    const resizeObserver = new ResizeObserver(entries => {
      width = entries[0].contentRect.width;
      renderGraph();
    });
    
    resizeObserver.observe(svgContainer.parentElement);
    
    return () => resizeObserver.disconnect();
  });
  
  // Re-render when manifest or selectedModel changes
  $: if (manifest && svgContainer) {
    renderGraph();
  }
  
  $: if (selectedModel !== null && svgContainer) {
    renderGraph();
  }
  
  // Re-render when filters change
  $: if (svgContainer && (showModels || showSources || showSeeds || showTests || showSnapshots)) {
    renderGraph();
  }
  
  $: if (svgContainer && (selectedSchemas || selectedDatabases)) {
    renderGraph();
  }
  
  // Toggle schema filter
  function toggleSchema(schema) {
    if (selectedSchemas.includes(schema)) {
      selectedSchemas = selectedSchemas.filter(s => s !== schema);
    } else {
      selectedSchemas = [...selectedSchemas, schema];
    }
  }
  
  // Toggle database filter
  function toggleDatabase(db) {
    if (selectedDatabases.includes(db)) {
      selectedDatabases = selectedDatabases.filter(d => d !== db);
    } else {
      selectedDatabases = [...selectedDatabases, db];
    }
  }
  
  // Clear all filters
  function clearFilters() {
    selectedSchemas = [];
    selectedDatabases = [];
    showModels = true;
    showSources = true;
    showSeeds = true;
    showTests = false;
    showSnapshots = true;
  }
  
  // Re-center graph
  function recenterGraph() {
    if (!window.graphSvg || !window.graphZoom || !window.graphG) return;
    
    const bounds = window.graphG.node().getBBox();
    const fullWidth = bounds.width;
    const fullHeight = bounds.height;
    const midX = bounds.x + fullWidth / 2;
    const midY = bounds.y + fullHeight / 2;
    
    if (fullWidth === 0 || fullHeight === 0) return;
    
    const scale = 0.8 / Math.max(fullWidth / width, fullHeight / height);
    const translate = [width / 2 - scale * midX, height / 2 - scale * midY];
    
    window.graphSvg.transition()
      .duration(750)
      .call(
        window.graphZoom.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
      );
  }
  
  // Toggle fullscreen
  function toggleFullscreen() {
    if (!containerElement) return;
    
    if (!document.fullscreenElement) {
      containerElement.requestFullscreen();
      isFullscreen = true;
    } else {
      document.exitFullscreen();
      isFullscreen = false;
    }
  }
  
  // Get columns for selected node
  function getNodeColumns(node) {
    if (!manifest || !manifest.nodes) return [];
    
    const fullNode = manifest.nodes[node.id];
    if (!fullNode || !fullNode.columns) return [];
    
    return Object.values(fullNode.columns).slice(0, 5); // First 5 columns
  }
</script>

<div bind:this={containerElement} class="w-full h-full bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden flex flex-col">
  <!-- Compact Header with Filters -->
  <div class="p-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
    <!-- Title Row -->
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-3">
        <h3 class="text-base font-semibold text-gray-900 dark:text-white">
          {selectedModel ? 'Model Lineage' : 'Full DAG'}
        </h3>
        
        <!-- Resource Type Filters (Compact) -->
        <div class="flex gap-1.5">
          <button
            on:click={() => showModels = !showModels}
            class={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              showModels
                ? 'bg-orange-500 text-white shadow-md'
                : 'bg-gray-200 text-gray-400 dark:bg-gray-700'
            }`}
            title="Models"
          >
            M
          </button>
          
          <button
            on:click={() => showSources = !showSources}
            class={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              showSources
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-gray-200 text-gray-400 dark:bg-gray-700'
            }`}
            title="Sources"
          >
            S
          </button>
          
          <button
            on:click={() => showSeeds = !showSeeds}
            class={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              showSeeds
                ? 'bg-green-500 text-white shadow-md'
                : 'bg-gray-200 text-gray-400 dark:bg-gray-700'
            }`}
            title="Seeds"
          >
            D
          </button>
          
          <button
            on:click={() => showSnapshots = !showSnapshots}
            class={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              showSnapshots
                ? 'bg-purple-500 text-white shadow-md'
                : 'bg-gray-200 text-gray-400 dark:bg-gray-700'
            }`}
            title="Snapshots"
          >
            P
          </button>
          
          <button
            on:click={() => showTests = !showTests}
            class={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              showTests
                ? 'bg-red-500 text-white shadow-md'
                : 'bg-gray-200 text-gray-400 dark:bg-gray-700'
            }`}
            title="Tests (hidden by default)"
          >
            T
          </button>
        </div>
      </div>
      
      <!-- Action Buttons -->
      <div class="flex items-center gap-2">
        {#if allSchemas.length > 1 || allDatabases.length > 1}
          <button
            on:click={() => filtersExpanded = !filtersExpanded}
            class="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            {filtersExpanded ? '▲' : '▼'} Filters
          </button>
        {/if}
        
        <button
          on:click={recenterGraph}
          class="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          title="Re-center graph"
        >
          ⊙ Center
        </button>
        
        <button
          on:click={toggleFullscreen}
          class="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          title="Toggle fullscreen"
        >
          ⛶ {isFullscreen ? 'Exit' : 'Full'}
        </button>
        
        <button
          on:click={clearFilters}
          class="px-3 py-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300"
          title="Reset all filters"
        >
          Reset
        </button>
      </div>
    </div>
    
    <!-- Expandable Schema/Database Filters -->
    {#if filtersExpanded && (allSchemas.length > 1 || allDatabases.length > 1)}
      <div class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 grid grid-cols-2 gap-3 text-xs">
        <!-- Schema Filter -->
        {#if allSchemas.length > 1}
          <div>
            <div class="font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Schemas:
            </div>
            <div class="flex flex-wrap gap-1">
              {#each allSchemas as schema}
                <button
                  on:click={() => toggleSchema(schema)}
                  class={`px-2 py-0.5 rounded text-xs transition-colors ${
                    selectedSchemas.length === 0 || selectedSchemas.includes(schema)
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'
                  }`}
                >
                  {schema}
                </button>
              {/each}
            </div>
          </div>
        {/if}
        
        <!-- Database Filter -->
        {#if allDatabases.length > 1}
          <div>
            <div class="font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Databases:
            </div>
            <div class="flex flex-wrap gap-1">
              {#each allDatabases as db}
                <button
                  on:click={() => toggleDatabase(db)}
                  class={`px-2 py-0.5 rounded text-xs transition-colors ${
                    selectedDatabases.length === 0 || selectedDatabases.includes(db)
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'
                  }`}
                >
                  {db}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
  
  <!-- Graph Canvas with Sidebar -->
  <div class="flex-1 relative flex overflow-hidden">
    <!-- Main Graph -->
    <div class="flex-1">
      <svg bind:this={svgContainer} class="w-full h-full"></svg>
    </div>
    
    <!-- Details Sidebar -->
    {#if selectedNode}
      <div class="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
        <!-- Sidebar Header -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-2">
              <div class={`w-3 h-3 rounded-full ${
                selectedNode.type === 'model' ? 'bg-orange-500' :
                selectedNode.type === 'source' ? 'bg-blue-500' :
                selectedNode.type === 'seed' ? 'bg-green-500' :
                selectedNode.type === 'snapshot' ? 'bg-purple-500' :
                'bg-red-500'
              }`}></div>
              <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                {selectedNode.type}
              </span>
            </div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-white truncate">
              {selectedNode.name}
            </h3>
            <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {selectedNode.schema}.{selectedNode.name}
            </p>
          </div>
          <button
            on:click={() => selectedNode = null}
            class="ml-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <!-- Sidebar Content -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <!-- Description -->
          {#if selectedNode.description}
            <div>
              <div class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
                Description
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                {selectedNode.description}
              </p>
            </div>
          {/if}
          
          <!-- Materialization -->
          {#if selectedNode.type === 'model'}
            <div>
              <div class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
                Materialization
              </div>
              <span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                {selectedNode.materialization}
              </span>
            </div>
          {/if}
          
          <!-- Tags -->
          {#if selectedNode.tags && selectedNode.tags.length > 0}
            <div>
              <div class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase mb-1">
                Tags
              </div>
              <div class="flex flex-wrap gap-1">
                {#each selectedNode.tags as tag}
                  <span class="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                    {tag}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
          
          <!-- Columns -->
          {#if getNodeColumns(selectedNode).length > 0}
            <div>
              <div class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase mb-2">
                Columns
              </div>
              <div class="space-y-2">
                {#each getNodeColumns(selectedNode) as column}
                  <div class="bg-gray-50 dark:bg-gray-900/50 rounded p-2">
                    <div class="flex items-start justify-between mb-1">
                      <span class="text-sm font-medium text-gray-900 dark:text-white">
                        {column.name}
                      </span>
                      <code class="text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                        {column.type || column.data_type || 'unknown'}
                      </code>
                    </div>
                    {#if column.description}
                      <p class="text-xs text-gray-600 dark:text-gray-400">
                        {column.description}
                      </p>
                    {/if}
                  </div>
                {/each}
                {#if getNodeColumns(selectedNode).length >= 5}
                  <p class="text-xs text-gray-500 dark:text-gray-400 italic text-center">
                    + more columns...
                  </p>
                {/if}
              </div>
            </div>
          {/if}
        </div>
        
        <!-- Sidebar Footer -->
        {#if selectedNode.type === 'model'}
          <div class="p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              on:click={() => {
                onModelClick(selectedNode.id);
                selectedNode = null;
              }}
              class="w-full px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
            >
              View Full Details →
            </button>
          </div>
        {/if}
      </div>
    {/if}
    
    <!-- Help Tooltip -->
    {#if !selectedNode}
      <div class="absolute bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 text-xs text-gray-600 dark:text-gray-400">
        <div class="font-semibold mb-2">Controls:</div>
        <div>🖱️ Drag nodes to reposition</div>
        <div>🔍 Scroll to zoom</div>
        <div>👆 Click nodes for details</div>
        <div>✨ Animated arrows show data flow</div>
      </div>
    {/if}
  </div>
</div>
