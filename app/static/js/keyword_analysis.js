function init_keyword_analysis() {
    // Configuration
    const graphWidth = 800;
    const graphHeight = 600;
    const nodeRadius = 20;
    const legendWidth = 300;

    // Colors for entity types
    const colors = {
        'Person': '#4f46e5',
        'Organization': '#dc2626',
        'Vessel': '#059669',
        'Group': '#d97706',
        'Location': '#0284c7'
    };

    // Select containers
    const visContainer = d3.select("#keyword-analysis-vis");
    const legendContainer = d3.select("#keyword-analysis-legend");
    visContainer.html("");
    legendContainer.html("");

    // Create tooltip
    const tooltip = d3.select("body").append("div")
        .attr("class", "absolute bg-white p-3 rounded shadow-lg border border-gray-200 text-sm max-w-xs z-50 hidden")
        .style("pointer-events", "none");

    // Store visualization state
    let allKeywords = [];
    let keywordEvents = {};
    let allEvents = [];
    let allEntities = [];
    let entityLookup = {};
    let selectedKeywordId = null;

    // Create SVG
    const svg = visContainer.append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", [0, 0, graphWidth, graphHeight])
        .attr("class", "bg-white");

    // Create graph container
    const graphGroup = svg.append("g")
        .attr("class", "graph-container")
        .attr("transform", `translate(${graphWidth / 2}, ${graphHeight / 2})`);

    // Fetch data from Flask endpoint
    d3.json("/data/keyword_analysis").then(data => {
        allKeywords = data.keywords;
        keywordEvents = data.keyword_events;
        allEvents = data.events;
        allEntities = data.entities;

        // Create lookups
        allEntities.forEach(entity => {
            entityLookup[entity.id] = entity;
        });

        const eventLookup = {};
        allEvents.forEach(event => {
            eventLookup[event.id] = event;
        });

        // Sort keywords by score
        allKeywords.sort((a, b) => b.score - a.score);

        // Create keyword legend
        const keywordList = legendContainer.append("div")
            .attr("class", "flex flex-col space-y-2 max-h-[600px] overflow-y-auto pr-2");

        keywordList.selectAll(".keyword-item")
            .data(allKeywords)
            .enter()
            .append("div")
            .attr("class", d =>
                `keyword-item p-3 rounded-lg cursor-pointer transition-all ${selectedKeywordId === d.id
                    ? "bg-blue-100 border-2 border-blue-400 shadow"
                    : "bg-gray-50 hover:bg-gray-100"
                }`)
            .html(d => `
                <div class="font-semibold">${d.term}</div>
                <div class="text-sm text-gray-600 mt-1">
                    Relevance: ${d.score.toFixed(3)} | 
                    Events: ${keywordEvents[d.id]?.length || 0}
                </div>
            `)
            .on("click", function (event, d) {
                selectedKeywordId = d.id;
                d3.selectAll(".keyword-item")
                    .classed("bg-blue-100 border-2 border-blue-400 shadow", false)
                    .classed("bg-gray-50", true);
                d3.select(this)
                    .classed("bg-blue-100 border-2 border-blue-400 shadow", true)
                    .classed("bg-gray-50", false);
                updateGraph(d.id);
            });

        // Initial graph with first keyword
        if (allKeywords.length > 0) {
            selectedKeywordId = allKeywords[0].id;
            d3.select(".keyword-item").classed("bg-blue-100 border-2 border-blue-400 shadow", true);
            updateGraph(allKeywords[0].id);
        }

        function updateGraph(keywordId) {
            graphGroup.selectAll("*").remove();

            const keyword = allKeywords.find(kw => kw.id === keywordId);
            if (!keyword) return;

            const eventIds = keywordEvents[keywordId] || [];
            const events = eventIds.map(id =>
                allEvents.find(e => e.id === id)).filter(e => e);

            if (events.length === 0) {
                graphGroup.append("text")
                    .attr("x", 0)
                    .attr("y", 0)
                    .attr("text-anchor", "middle")
                    .attr("dy", "0.35em")
                    .text(`No communications found for "${keyword.term}"`)
                    .attr("fill", "#666");
                return;
            }

            // Collect all entities involved
            const entitySet = new Set();
            const links = [];

            events.forEach(event => {
                entitySet.add(event.entity_id);
                event.target_entities.forEach(target => entitySet.add(target));

                // Create links from source to each target
                event.target_entities.forEach(target => {
                    links.push({
                        source: event.entity_id,
                        target: target,
                        event: event
                    });
                });
            });

            const nodes = Array.from(entitySet).map(id => {
                const entity = entityLookup[id];
                return {
                    id: id,
                    label: entity.label || id,
                    type: entity.sub_type,
                    radius: nodeRadius
                };
            });

            // Create force simulation
            const simulation = d3.forceSimulation(nodes)
                .force("link", d3.forceLink(links).id(d => d.id).distance(100))
                .force("charge", d3.forceManyBody().strength(-200))
                .force("center", d3.forceCenter(0, 0))
                .force("collision", d3.forceCollide().radius(d => d.radius + 10));

            // Draw links
            const link = graphGroup.selectAll(".link")
                .data(links)
                .enter()
                .append("line")
                .attr("class", "link")
                .attr("stroke", "#94a3b8")
                .attr("stroke-width", 1.5)
                .attr("stroke-dasharray", "3,3");

            // Draw nodes
            const node = graphGroup.selectAll(".node")
                .data(nodes)
                .enter()
                .append("circle")
                .attr("class", "node")
                .attr("r", d => d.radius)
                .attr("fill", d => colors[d.type] || "#777")
                .attr("stroke", "#fff")
                .attr("stroke-width", 2)
                .call(d3.drag()
                    .on("start", dragstarted)
                    .on("drag", dragged)
                    .on("end", dragended)
                )
                .on("mouseover", function (event, d) {
                    tooltip.html(`
                        <div class="font-medium">${d.label}</div>
                        <div>Type: ${d.type}</div>
                        <div>ID: ${d.id}</div>
                    `)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY + 10) + "px")
                        .classed("hidden", false);

                    d3.select(this)
                        .attr("stroke", "#000")
                        .attr("stroke-width", 3);
                })
                .on("mouseout", function () {
                    tooltip.classed("hidden", true);
                    d3.select(this)
                        .attr("stroke", "#fff")
                        .attr("stroke-width", 2);
                });

            // Draw node labels
            const label = graphGroup.selectAll(".label")
                .data(nodes)
                .enter()
                .append("text")
                .attr("class", "label")
                .attr("text-anchor", "middle")
                .attr("dy", "0.35em")
                .attr("pointer-events", "none")
                .text(d => d.label)
                .attr("font-size", "10px")
                .attr("fill", "#fff");

            // Add keyword title
            graphGroup.append("text")
                .attr("x", 0)
                .attr("y", -graphHeight / 2 + 20)
                .attr("text-anchor", "middle")
                .attr("font-weight", "bold")
                .text(`"${keyword.term}" Communications`)
                .attr("fill", "#334155");

            // Add event count
            graphGroup.append("text")
                .attr("x", 0)
                .attr("y", -graphHeight / 2 + 40)
                .attr("text-anchor", "middle")
                .attr("font-size", "12px")
                .text(`${events.length} communication${events.length !== 1 ? 's' : ''}`)
                .attr("fill", "#64748b");

            // Update position on each tick
            simulation.on("tick", () => {
                link
                    .attr("x1", d => d.source.x)
                    .attr("y1", d => d.source.y)
                    .attr("x2", d => d.target.x)
                    .attr("y2", d => d.target.y);

                node
                    .attr("cx", d => d.x)
                    .attr("cy", d => d.y);

                label
                    .attr("x", d => d.x)
                    .attr("y", d => d.y);
            });

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
        }

    }).catch(error => {
        console.error("Error loading keyword analysis data:", error);
    });
}

window.init_keyword_analysis = init_keyword_analysis;