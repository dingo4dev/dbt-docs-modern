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
      onModelClick(d.id);
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
</script>

<div class="w-full h-full bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden flex flex-col">
  <!-- Header with Filters -->
  <div class="p-4 border-b border-gray-200 dark:border-gray-700 space-y-4">
    <!-- Title -->
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
          {selectedModel ? 'Model Lineage' : 'Full DAG'}
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
          {selectedModel ? 'Showing upstream and downstream dependencies' : 'All models and dependencies'}
        </p>
      </div>
      
      <button
        on:click={clearFilters}
        class="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-medium"
      >
        Reset Filters
      </button>
    </div>
    
    <!-- Resource Type Filters -->
    <div>
      <div class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Resource Types:</div>
      <div class="flex flex-wrap gap-2">
        <button
          on:click={() => showModels = !showModels}
          class={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            showModels
              ? 'bg-orange-500 text-white'
              : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-500'
          }`}
        >
          <div class="w-2 h-2 rounded-full bg-current mr-1.5"></div>
          Models
        </button>
        
        <button
          on:click={() => showSources = !showSources}
          class={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            showSources
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-500'
          }`}
        >
          <div class="w-2 h-2 rounded-full bg-current mr-1.5"></div>
          Sources
        </button>
        
        <button
          on:click={() => showSeeds = !showSeeds}
          class={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            showSeeds
              ? 'bg-green-500 text-white'
              : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-500'
          }`}
        >
          <div class="w-2 h-2 rounded-full bg-current mr-1.5"></div>
          Seeds
        </button>
        
        <button
          on:click={() => showSnapshots = !showSnapshots}
          class={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            showSnapshots
              ? 'bg-purple-500 text-white'
              : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-500'
          }`}
        >
          <div class="w-2 h-2 rounded-full bg-current mr-1.5"></div>
          Snapshots
        </button>
        
        <button
          on:click={() => showTests = !showTests}
          class={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            showTests
              ? 'bg-red-500 text-white'
              : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-500'
          }`}
        >
          <div class="w-2 h-2 rounded-full bg-current mr-1.5"></div>
          Tests {#if !showTests}<span class="ml-1 opacity-60">(hidden)</span>{/if}
        </button>
      </div>
    </div>
    
    <!-- Schema/Database Filters -->
    {#if allSchemas.length > 1 || allDatabases.length > 1}
      <div class="grid grid-cols-2 gap-4">
        <!-- Schema Filter -->
        {#if allSchemas.length > 1}
          <div>
            <div class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Schemas ({selectedSchemas.length > 0 ? selectedSchemas.length : 'all'}):
            </div>
            <div class="flex flex-wrap gap-1.5">
              {#each allSchemas as schema}
                <button
                  on:click={() => toggleSchema(schema)}
                  class={`px-2 py-1 rounded text-xs font-medium transition-colors ${
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
            <div class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Databases ({selectedDatabases.length > 0 ? selectedDatabases.length : 'all'}):
            </div>
            <div class="flex flex-wrap gap-1.5">
              {#each allDatabases as db}
                <button
                  on:click={() => toggleDatabase(db)}
                  class={`px-2 py-1 rounded text-xs font-medium transition-colors ${
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
  
  <!-- Graph Canvas -->
  <div class="flex-1 relative" style="height: {height}px;">
    <svg bind:this={svgContainer} class="w-full h-full"></svg>
    
    <div class="absolute bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 text-xs text-gray-600 dark:text-gray-400">
      <div class="font-semibold mb-2">Controls:</div>
      <div>🖱️ Drag nodes to reposition</div>
      <div>🔍 Scroll to zoom</div>
      <div>👆 Click nodes to view details</div>
      <div>✨ Animated arrows show data flow</div>
    </div>
  </div>
</div>
