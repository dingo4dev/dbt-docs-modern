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
  let filtersExpanded = false;
  
  // UI state
  let selectedNode = null;
  let isFullscreen = false;
  let containerElement;
  let hasInitialZoom = false; // Track if we've done initial zoom
  let isLoading = true; // Loading state for initial render
  let panToNode = true; // Toggle for auto-pan to clicked node
  
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
    
    // Apply filters
    let filteredNodes = nodes.filter(n => {
      // Resource type filter
      if (n.type === 'model' && !showModels) return false;
      if (n.type === 'source' && !showSources) return false;
      if (n.type === 'seed' && !showSeeds) return false;
      if (n.type === 'test' && !showTests) return false;
      if (n.type === 'snapshot' && !showSnapshots) return false;
      
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
  
  // Color scheme based on resource type (for table borders/headers - NEUTRAL)
  function getNodeColor(node) {
    // All tables use neutral gray
    return '#94a3b8'; // slate-400 - neutral for all types
  }
  
  // Badge colors by materialization type
  function getMaterializationColor(materialization) {
    const colors = {
      view: '#3b82f6', // blue
      table: '#10b981', // green
      incremental: '#f59e0b', // amber
      ephemeral: '#8b5cf6', // purple
    };
    return colors[materialization] || '#6b7280'; // gray fallback
  }
  
  // Badge colors by resource type
  function getResourceTypeColor(type) {
    const colors = {
      model: '#f97316', // orange
      source: '#0ea5e9', // sky
      seed: '#84cc16', // lime
      snapshot: '#a855f7', // purple
      test: '#ef4444' // red
    };
    return colors[type] || '#6b7280'; // gray fallback
  }
  
  // Get columns for a node (from manifest)
  function getNodeColumnsForGraph(node) {
    if (!manifest || !manifest.nodes) return [];
    const fullNode = manifest.nodes[node.id];
    if (!fullNode || !fullNode.columns) return [];
    return Object.values(fullNode.columns).slice(0, 3); // Top 3 for graph display
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
    
    // Define responsive variables EARLY (used in force simulation)
    const isMobile = width < 768; // Tailwind md breakpoint
    const tableWidth = isMobile ? 200 : 300; // 200px on mobile, 300px on desktop
    const tableHalfWidth = tableWidth / 2;
    
    // Create force simulation - FLOWCHART LR (strong left-to-right)
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(400)) // Very wide horizontal spacing for 300px tables
      .force('charge', d3.forceManyBody()
        .strength(-1400)) // Very strong repulsion
      .force('x', d3.forceX(d => {
        // Position based on depth (sources left, models right)
        const depth = getNodeDepth(d, links);
        return depth * 450; // 450px per level for wider tables
      }).strength(0.8)) // STRONG horizontal positioning
      .force('y', d3.forceY(height / 2).strength(0.1)) // WEAK vertical (allows stacking)
      .force('collision', d3.forceCollide().radius(isMobile ? 110 : 160)); // Responsive collision radius
    
    // Helper: Calculate node depth (0 for sources, incrementing downstream)
    function getNodeDepth(node, links) {
      const visited = new Set();
      const depths = new Map();
      
      // BFS to calculate depths
      function calculateDepth(nodeId, depth) {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        depths.set(nodeId, Math.max(depths.get(nodeId) || 0, depth));
        
        // Find downstream nodes
        links.forEach(link => {
          if ((link.source.id || link.source) === nodeId) {
            const targetId = link.target.id || link.target;
            calculateDepth(targetId, depth + 1);
          }
        });
      }
      
      // Start from nodes with no dependencies (sources)
      const nodeDeps = new Set(links.map(l => l.target.id || l.target));
      nodes.forEach(n => {
        if (!nodeDeps.has(n.id)) {
          calculateDepth(n.id, 0);
        }
      });
      
      return depths.get(node.id) || 0;
    }
    
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
    
    // Draw nodes as tables with MODERN styling
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));
    
    // Drop shadow filter for modern look
    const filter = defs.append('filter')
      .attr('id', 'node-shadow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    
    filter.append('feGaussianBlur')
      .attr('in', 'SourceAlpha')
      .attr('stdDeviation', 3);
    
    filter.append('feOffset')
      .attr('dx', 0)
      .attr('dy', 2)
      .attr('result', 'offsetblur');
    
    filter.append('feComponentTransfer')
      .append('feFuncA')
      .attr('type', 'linear')
      .attr('slope', 0.2);
    
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');
    
    // Node background (table card) - RESPONSIVE width (variables defined earlier)
    const nodeRect = node.append('rect')
      .attr('class', 'node-background')
      .attr('width', tableWidth)
      .attr('height', d => {
        const cols = getNodeColumnsForGraph(d);
        return 50 + (cols.length * 32); // Taller: 50px header + 32px per row
      })
      .attr('x', -tableHalfWidth)
      .attr('y', d => {
        const cols = getNodeColumnsForGraph(d);
        return -(50 + (cols.length * 32)) / 2;
      })
      .attr('rx', 8) // More rounded corners
      .attr('fill', 'white')
      .attr('stroke', d => {
        // Bright orange for clicked node, blue for selectedModel, default gray
        if (selectedNode && d.id === selectedNode.id) return '#f97316'; // orange-500
        if (d.id === selectedModel) return '#3b82f6'; // blue-500
        return getNodeColor(d); // gray
      })
      .attr('stroke-width', d => {
        if (selectedNode && d.id === selectedNode.id) return 4; // Thicker for clicked
        if (d.id === selectedModel) return 3;
        return 2;
      })
      .attr('filter', 'url(#node-shadow)')
      .attr('class', 'transition-all dark:fill-gray-800');
    
    // Table header with gradient effect
    const headerGradient = defs.append('linearGradient')
      .attr('id', 'header-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    
    headerGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-opacity', 1);
    
    headerGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-opacity', 0.85);
    
    // Table header (node name + type) - RESPONSIVE
    node.append('rect')
      .attr('width', tableWidth)
      .attr('height', 42)
      .attr('x', -tableHalfWidth)
      .attr('y', d => {
        const cols = getNodeColumnsForGraph(d);
        return -(50 + (cols.length * 32)) / 2;
      })
      .attr('rx', 8)
      .attr('fill', d => getNodeColor(d))
      .style('fill', d => `url(#header-gradient-${d.type})`)
      .attr('class', 'transition-all');
    
    // Create per-type gradients
    ['model', 'source', 'seed', 'snapshot', 'test'].forEach(type => {
      const color = getNodeColor({ type });
      const grad = defs.append('linearGradient')
        .attr('id', `header-gradient-${type}`)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');
      
      grad.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', color)
        .attr('stop-opacity', 1);
      
      grad.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', color)
        .attr('stop-opacity', 0.8);
    });
    
    // LEFT TOP BADGE: Materialization type (for models) - RESPONSIVE position
    const leftBadgeX = isMobile ? -(tableHalfWidth - 8) : -142;
    node.filter(d => d.type === 'model').append('g')
      .attr('transform', d => {
        const cols = getNodeColumnsForGraph(d);
        const topY = -(50 + (cols.length * 32)) / 2;
        return `translate(${leftBadgeX}, ${topY + 6})`;
      })
      .call(g => {
        // Badge background with COLOR
        g.append('rect')
          .attr('width', d => {
            const text = d.materialization || 'view';
            return text.length * 5.5 + 10;
          })
          .attr('height', 16)
          .attr('rx', 4)
          .attr('fill', d => getMaterializationColor(d.materialization || 'view'));
        
        // Badge text
        g.append('text')
          .text(d => (d.materialization || 'view').substring(0, 4).toUpperCase())
          .attr('x', 5)
          .attr('y', 11)
          .attr('class', 'fill-white text-xs font-bold pointer-events-none')
          .style('font-size', '10px')
          .style('letter-spacing', '0.5px');
      });
    
    // RIGHT TOP BADGE: Resource type - RESPONSIVE position
    const rightBadgeX = isMobile ? (tableHalfWidth - 60) : 80;
    node.append('g')
      .attr('transform', d => {
        const cols = getNodeColumnsForGraph(d);
        const topY = -(50 + (cols.length * 32)) / 2;
        return `translate(${rightBadgeX}, ${topY + 6})`;
      })
      .call(g => {
        // Badge background with COLOR
        g.append('rect')
          .attr('width', d => {
            const typeLabels = {
              model: 'MODEL',
              source: 'SOURCE',
              seed: 'SEED',
              snapshot: 'SNAP',
              test: 'TEST'
            };
            const text = typeLabels[d.type] || d.type.toUpperCase();
            return text.length * 6 + 10;
          })
          .attr('height', 16)
          .attr('rx', 4)
          .attr('fill', d => getResourceTypeColor(d.type));
        
        // Badge text
        g.append('text')
          .text(d => {
            const typeLabels = {
              model: 'MODEL',
              source: 'SOURCE',
              seed: 'SEED',
              snapshot: 'SNAP',
              test: 'TEST'
            };
            return typeLabels[d.type] || d.type.toUpperCase();
          })
          .attr('x', 5)
          .attr('y', 11)
          .attr('class', 'fill-white text-xs font-bold pointer-events-none')
          .style('font-size', '10px')
          .style('letter-spacing', '0.5px');
      });
    
    // Node name (header text, centered) - RESPONSIVE length
    const maxNameLength = isMobile ? 20 : 34;
    node.append('text')
      .text(d => d.name.length > maxNameLength ? d.name.substring(0, maxNameLength - 2) + '..' : d.name)
      .attr('x', 0)
      .attr('y', d => {
        const cols = getNodeColumnsForGraph(d);
        return -(50 + (cols.length * 32)) / 2 + 30;
      })
      .attr('text-anchor', 'middle')
      .attr('class', 'fill-white text-base font-bold pointer-events-none')
      .style('font-size', isMobile ? '13px' : '15px');
    
    // Column rows - RESPONSIVE widths
    const colLeftX = -(tableHalfWidth - 8);
    const colRightX = tableHalfWidth - 8;
    const colRowWidth = tableWidth - 12;
    const maxColNameLength = isMobile ? 14 : 24;
    const maxColTypeLength = isMobile ? 10 : 16;
    
    node.each(function(d) {
      const cols = getNodeColumnsForGraph(d);
      const nodeGroup = d3.select(this);
      const startY = -(50 + (cols.length * 32)) / 2 + 50;
      
      cols.forEach((col, i) => {
        const y = startY + (i * 32);
        
        // Column background for hover effect (every other row)
        if (i % 2 === 1) {
          nodeGroup.append('rect')
            .attr('width', colRowWidth)
            .attr('height', 30)
            .attr('x', colLeftX)
            .attr('y', y - 12)
            .attr('fill', '#f9fafb')
            .attr('class', 'dark:fill-gray-900/30');
        }
        
        // Column name - RESPONSIVE
        nodeGroup.append('text')
          .text(col.name.length > maxColNameLength ? col.name.substring(0, maxColNameLength - 2) + '..' : col.name)
          .attr('x', colLeftX)
          .attr('y', y + 4)
          .attr('text-anchor', 'start')
          .attr('class', 'fill-gray-800 dark:fill-gray-200 text-sm font-medium pointer-events-none')
          .style('font-size', isMobile ? '11px' : '13px');
        
        // Column type - RESPONSIVE
        nodeGroup.append('text')
          .text((col.type || col.data_type || 'string').substring(0, maxColTypeLength))
          .attr('x', colRightX)
          .attr('y', y + 4)
          .attr('text-anchor', 'end')
          .attr('class', 'fill-gray-500 dark:fill-gray-400 text-xs font-mono pointer-events-none')
          .style('font-size', isMobile ? '10px' : '12px');
        
        // Separator line
        if (i < cols.length - 1) {
          nodeGroup.append('line')
            .attr('x1', colLeftX)
            .attr('x2', colRightX)
            .attr('y1', y + 16)
            .attr('y2', y + 16)
            .attr('stroke', '#e5e7eb')
            .attr('stroke-width', 1)
            .attr('opacity', 0.5)
            .attr('class', 'dark:stroke-gray-700');
        }
      });
      
      // Show "+N more" if more columns exist
      if (cols.length >= 3) {
        const fullNode = manifest.nodes[d.id];
        const totalCols = fullNode?.columns ? Object.keys(fullNode.columns).length : 0;
        if (totalCols > 3) {
          const y = startY + (cols.length * 32) - 8;
          nodeGroup.append('text')
            .text(`+${totalCols - 3} more columns...`)
            .attr('x', 0)
            .attr('y', y)
            .attr('text-anchor', 'middle')
            .attr('class', 'fill-gray-400 dark:fill-gray-500 text-xs italic pointer-events-none')
            .style('font-size', '11px');
        }
      }
    });
    
    // Click handler - show in sidebar, pan to node, update stroke
    node.on('click', (event, d) => {
      event.stopPropagation();
      selectedNode = d;
      
      // Update all node strokes (highlight clicked node)
      nodeRect
        .transition()
        .duration(300)
        .attr('stroke', nd => {
          if (nd.id === d.id) return '#f97316'; // Orange for clicked
          if (nd.id === selectedModel) return '#3b82f6'; // Blue for selectedModel
          return getNodeColor(nd); // Gray default
        })
        .attr('stroke-width', nd => {
          if (nd.id === d.id) return 4; // Thicker for clicked
          if (nd.id === selectedModel) return 3;
          return 2;
        });
      
      // Pan camera to center on clicked node (if enabled)
      if (panToNode && window.graphSvg && window.graphZoom) {
        const currentTransform = d3.zoomTransform(window.graphSvg.node());
        const scale = currentTransform.k;
        
        // Calculate new center position
        const x = width / 2 - scale * d.x;
        const y = height / 2 - scale * d.y;
        
        window.graphSvg.transition()
          .duration(750)
          .call(
            window.graphZoom.transform,
            d3.zoomIdentity.translate(x, y).scale(scale)
          );
      }
    });
    
    // Hover effects - MODERN
    node.on('mouseenter', function(event, d) {
      d3.select(this).select('rect')
        .transition()
        .duration(200)
        .attr('stroke-width', 4)
        .attr('transform', 'scale(1.02)'); // Slight scale up
      
      // Highlight connected links
      link
        .attr('class', l => 
          (l.source.id === d.id || l.target.id === d.id)
            ? 'base-link stroke-orange-500 dark:stroke-orange-400'
            : 'base-link stroke-gray-300 dark:stroke-gray-600'
        )
        .attr('stroke-width', l => 
          (l.source.id === d.id || l.target.id === d.id) ? 4 : 2
        )
        .attr('marker-end', l =>
          (l.source.id === d.id || l.target.id === d.id) 
            ? 'url(#arrow-highlight)' 
            : 'url(#arrow)'
        );
      
      // Make animated links more visible on connected edges
      animatedLink
        .attr('opacity', l => 
          (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.2
        )
        .attr('stroke-width', l => 
          (l.source.id === d.id || l.target.id === d.id) ? 4 : 3
        );
    });
    
    node.on('mouseleave', function(event, d) {
      d3.select(this).select('rect')
        .transition()
        .duration(200)
        .attr('stroke-width', () => {
          // Keep clicked node highlighted
          if (selectedNode && d.id === selectedNode.id) return 4;
          if (d.id === selectedModel) return 3;
          return 2;
        })
        .attr('transform', 'scale(1)');
      
      link
        .attr('class', 'base-link stroke-gray-300 dark:stroke-gray-600')
        .attr('stroke-width', 2)
        .attr('marker-end', 'url(#arrow)');
      
      animatedLink
        .attr('opacity', 0.6)
        .attr('stroke-width', 3);
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
      // Disable flowchart forces when user drags
      simulation.force('x', null);
      simulation.force('y', null);
    }
    
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    
    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      // Keep node position fixed after drag (don't reset fx/fy)
      // d.fx = null;  // Commented out - keep position
      // d.fy = null;  // Commented out - keep position
    }
    
    // Initial zoom to fit - ONLY ON FIRST RENDER (not on filter changes!)
    if (!hasInitialZoom) {
      hasInitialZoom = true;
      setTimeout(() => {
        const bounds = g.node().getBBox();
        const fullWidth = bounds.width;
        const fullHeight = bounds.height;
        const midX = bounds.x + fullWidth / 2;
        const midY = bounds.y + fullHeight / 2;
        
        if (fullWidth === 0 || fullHeight === 0) {
          isLoading = false; // Hide loading even if empty
          return;
        }
        
        // Use 0.8 scale factor to show ALL elements (higher = more zoomed out for small containers)
        const scale = 0.8 / Math.max(fullWidth / width, fullHeight / height);
        // Center properly with slight upward bias (+30px moves graph down in viewport = uses top space)
        const translate = [width / 2 - scale * midX, height / 2 - scale * midY + 30];
        
        svg.transition()
          .duration(750)
          .call(
            zoom.transform,
            d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
          )
          .on('end', () => {
            // Hide loading overlay after zoom animation completes
            isLoading = false;
          });
      }, 100); // Faster delay for flowchart
    }
  }
  
  onMount(() => {
    let resizeTimeout;
    
    const resizeObserver = new ResizeObserver(entries => {
      const newWidth = entries[0].contentRect.width;
      
      // Only re-render if width actually changed significantly (>10px)
      if (Math.abs(newWidth - width) < 10) return;
      
      // Debounce to avoid multiple rapid re-renders
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        width = newWidth;
        renderGraph();
      }, 100);
    });
    
    resizeObserver.observe(svgContainer.parentElement);
    
    return () => {
      clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
    };
  });
  
  // Re-render when manifest or selectedModel changes
  $: if (manifest && svgContainer) {
    console.log('Render: manifest changed');
    renderGraph();
  }
  
  $: if (selectedModel !== null && svgContainer) {
    console.log('Render: selectedModel changed');
    renderGraph();
  }
  
  // Re-render when filters change (NOT on every access, only on actual change)
  $: filterState = [showModels, showSources, showSeeds, showTests, showSnapshots].join(',');
  $: if (svgContainer && filterState) {
    console.log('Render: filters changed');
    renderGraph();
  }
  
  // Clear all filters
  function clearFilters() {
    showModels = true;
    showSources = true;
    showSeeds = true;
    showTests = false;
    showSnapshots = true;
    // Re-render graph after clearing filters
    renderGraph();
  }
  
  // Re-center graph - BETTER for flowchart with BOTTOM PADDING
  function recenterGraph() {
    if (!window.graphSvg || !window.graphZoom || !window.graphG) return;
    
    const bounds = window.graphG.node().getBBox();
    const fullWidth = bounds.width;
    const fullHeight = bounds.height;
    const midX = bounds.x + fullWidth / 2;
    const midY = bounds.y + fullHeight / 2;
    
    if (fullWidth === 0 || fullHeight === 0) return;
    
    // Use 0.4 scale factor for good overview when clicking Center button
    const scale = 0.4 / Math.max(fullWidth / width, fullHeight / height);
    // Center properly with slight upward bias (+30px moves graph down = uses top space)
    const translate = [width / 2 - scale * midX, height / 2 - scale * midY + 30];
    
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
    
    return Object.values(fullNode.columns); // ALL columns for sidebar
  }
</script>

<div bind:this={containerElement} class="w-full h-full bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden flex flex-col min-h-0">
  <!-- Compact Header with Filters - RESPONSIVE -->
  <div class="p-2 md:p-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
    <!-- Title Row -->
    <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
      <div class="flex items-center gap-2 md:gap-3 min-w-0">
        <h3 class="text-sm md:text-base font-semibold text-gray-900 dark:text-white truncate">
          {selectedModel ? 'Model Lineage' : 'Full DAG'}
        </h3>
        
        <!-- Resource Type Filters (Compact) - HIDE ON MOBILE, show in expandable menu -->
        <div class="hidden md:flex gap-1.5">
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
      
      <!-- Action Buttons - RESPONSIVE -->
      <div class="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
        <!-- Mobile: Show filters button -->
        <button
          on:click={() => filtersExpanded = !filtersExpanded}
          class="md:hidden px-2 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          title="Toggle filters"
        >
          ☰
        </button>
        
        <!-- Pan to Node Toggle (iOS style) - HIDE LABEL ON MOBILE -->
        <div class="flex items-center gap-1.5">
          <span class="hidden md:inline text-xs font-medium text-gray-600 dark:text-gray-400">
            Auto Pan
          </span>
          <button
            on:click={() => panToNode = !panToNode}
            class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
              panToNode ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
            role="switch"
            aria-checked={panToNode}
            aria-label="Auto pan to selected node"
            title={panToNode ? 'Auto-pan enabled' : 'Auto-pan disabled'}
          >
            <span
              class={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                panToNode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        
        <button
          on:click={recenterGraph}
          class="hidden md:block px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          title="Re-center graph"
        >
          ⊙ Center
        </button>
        
        <!-- Mobile: Icon only buttons -->
        <button
          on:click={recenterGraph}
          class="md:hidden p-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          title="Re-center graph"
        >
          ⊙
        </button>
        
        <button
          on:click={toggleFullscreen}
          class="p-1.5 md:px-3 md:py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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
    
    <!-- Expandable Filters (Mobile ONLY: show resource types) -->
    {#if filtersExpanded}
      <div class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <!-- Mobile ONLY: Resource Type Filters -->
        <div class="md:hidden">
          <div class="font-semibold text-gray-700 dark:text-gray-300 mb-2 text-xs">
            Resource Types:
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              on:click={() => showModels = !showModels}
              class={`px-3 py-2 rounded-lg font-medium transition-all ${
                showModels
                  ? 'bg-orange-500 text-white shadow-md'
                  : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
              }`}
            >
              📊 Models
            </button>
            
            <button
              on:click={() => showSources = !showSources}
              class={`px-3 py-2 rounded-lg font-medium transition-all ${
                showSources
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
              }`}
            >
              📥 Sources
            </button>
            
            <button
              on:click={() => showSeeds = !showSeeds}
              class={`px-3 py-2 rounded-lg font-medium transition-all ${
                showSeeds
                  ? 'bg-green-500 text-white shadow-md'
                  : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
              }`}
            >
              🌱 Seeds
            </button>
            
            <button
              on:click={() => showSnapshots = !showSnapshots}
              class={`px-3 py-2 rounded-lg font-medium transition-all ${
                showSnapshots
                  ? 'bg-purple-500 text-white shadow-md'
                  : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
              }`}
            >
              📸 Snapshots
            </button>
            
            <button
              on:click={() => showTests = !showTests}
              class={`px-3 py-2 rounded-lg font-medium transition-all ${
                showTests
                  ? 'bg-red-500 text-white shadow-md'
                  : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
              }`}
            >
              ✓ Tests
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
  
  <!-- Graph Canvas with Sidebar -->
  <div class="flex-1 relative overflow-hidden min-h-0">
    <!-- Loading Overlay -->
    {#if isLoading}
      <div class="absolute inset-0 bg-white dark:bg-gray-900 flex items-center justify-center z-50 transition-opacity duration-300">
        <div class="text-center">
          <!-- Spinner -->
          <div class="inline-block w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-orange-500 rounded-full animate-spin mb-4"></div>
          <div class="text-gray-600 dark:text-gray-400 font-medium">
            Loading lineage graph...
          </div>
        </div>
      </div>
    {/if}
    
    <!-- Main Graph - FULL WIDTH (no flex) -->
    <div class="w-full h-full">
      <svg bind:this={svgContainer} class="w-full h-full"></svg>
    </div>
    
    <!-- Details Sidebar - OVERLAY (full width on mobile, 320px on desktop) -->
    {#if selectedNode}
      <div class="absolute top-0 right-0 w-full md:w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col h-full shadow-xl z-50">
        <!-- Sidebar Header - FIXED -->
        <div class="p-3 md:p-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between flex-shrink-0">
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
            class="ml-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex-shrink-0"
          >
            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <!-- Sidebar Content - SCROLLABLE with min-h-0 for flex -->
        <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4">
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
              </div>
            </div>
          {/if}
        </div>
        
        <!-- Sidebar Footer - FIXED -->
        <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            on:click={() => selectedNode = null}
            class="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            Close Details
          </button>
        </div>
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
