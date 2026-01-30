<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  
  export let manifest = {};
  export let selectedModel = null;
  export let onModelClick = () => {};
  
  let svgContainer;
  let width = 0;
  let height = 600;
  
  // Extract nodes and edges from manifest
  function buildGraph(manifest, focusModel = null) {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();
    
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
      nodes.push(nodeData);
      nodeMap.set(id, nodeData);
    });
    
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
      
      return {
        nodes: nodes.filter(n => relevantNodes.has(n.id)),
        links: links.filter(l => relevantNodes.has(l.source) && relevantNodes.has(l.target))
      };
    }
    
    return { nodes, links };
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
    
    // Add arrow markers for directed edges
    svg.append('defs').selectAll('marker')
      .data(['arrow'])
      .join('marker')
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
    
    // Draw links
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'stroke-gray-300 dark:stroke-gray-600')
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#arrow)');
    
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
            ? 'stroke-orange-500 dark:stroke-orange-400'
            : 'stroke-gray-300 dark:stroke-gray-600'
        )
        .attr('stroke-width', l => 
          (l.source.id === d.id || l.target.id === d.id) ? 3 : 2
        );
    });
    
    node.on('mouseleave', function(event, d) {
      d3.select(this).select('circle')
        .transition()
        .duration(200)
        .attr('r', 20);
      
      link
        .attr('class', 'stroke-gray-300 dark:stroke-gray-600')
        .attr('stroke-width', 2);
    });
    
    // Update positions on tick
    simulation.on('tick', () => {
      link
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
</script>

<div class="w-full h-full bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden">
  <div class="p-4 border-b border-gray-200 dark:border-gray-700">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
          {selectedModel ? 'Model Lineage' : 'Full DAG'}
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
          {selectedModel ? 'Showing upstream and downstream dependencies' : 'All models and dependencies'}
        </p>
      </div>
      
      <div class="flex items-center gap-4 text-xs">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-orange-500"></div>
          <span class="text-gray-600 dark:text-gray-400">Model</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-blue-500"></div>
          <span class="text-gray-600 dark:text-gray-400">Source</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-green-500"></div>
          <span class="text-gray-600 dark:text-gray-400">Seed</span>
        </div>
      </div>
    </div>
  </div>
  
  <div class="relative" style="height: {height}px;">
    <svg bind:this={svgContainer} class="w-full h-full"></svg>
    
    <div class="absolute bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 text-xs text-gray-600 dark:text-gray-400">
      <div class="font-semibold mb-2">Controls:</div>
      <div>🖱️ Drag nodes to reposition</div>
      <div>🔍 Scroll to zoom</div>
      <div>👆 Click nodes to view details</div>
    </div>
  </div>
</div>
