function init_topic_modeling() {
    const width = 800;
    const height = 600;
    const container = d3.select("#graph-container");
    container.html("");

    const svg = container.append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", [0, 0, width, height])
        .attr("class", "bg-white");

    let g = svg.append("g");
    let simulation;
    let topicData = {};
    let currentTopic = null;
    let currentMethod = "bertopic";
    let allMessages = [];
    let filteredMessages = [];
    let currentPage = 1;
    const messagesPerPage = 10;
    let currentEntityFilter = null;

    // Method change handler
    const methodSelector = d3.select("#topic-method");
    methodSelector.on("change", function () {
        currentMethod = this.value;
        loadTopicData();
    });

    // Topic count handlers
    const topicCountSlider = d3.select("#topic-count");
    const topicCountAuto = d3.select("#topic-count-auto");
    const topicCountDisplay = d3.select("#topic-count-display");

    // Handle auto checkbox toggle
    topicCountAuto.on("change", function() {
        const isAuto = this.checked;
        topicCountSlider.property("disabled", isAuto);
        updateTopicCountDisplay();
        loadTopicData();
    });

    // Handle slider change
    topicCountSlider.on("input", function() {
        updateTopicCountDisplay();
    });

    topicCountSlider.on("change", function() {
        loadTopicData();
    });

    // Update display function
    function updateTopicCountDisplay() {
        const isAuto = topicCountAuto.property("checked");
        if (isAuto) {
            topicCountDisplay.text("Auto");
        } else {
            const value = topicCountSlider.property("value");
            topicCountDisplay.text(value);
        }
    }

    function loadTopicData() {
        const isAuto = topicCountAuto.property("checked");
        const topicCount = isAuto ? "auto" : topicCountSlider.property("value");
        const url = `/data/topic_modeling?method=${currentMethod}&num_topics=${topicCount}`;

        // Show loading indicator
        container.html(`<div class="text-center py-10"><div class="spinner"></div>Loading data...</div>`);

        d3.json(url).then(data => {
            if (data.error) {
                console.error("Error loading data:", data.error);
                container.html(`<div class="error-message p-4 text-red-600">Error: ${data.error}</div>`);
                return;
            }

            const { graph, topics, entity_topic_scores, method_used, vectorizer_used, total_communications, messages, topic_metrics, model_metrics } = data;
            topicData = {
                topics,
                entity_topic_scores,
                topic_metrics: topic_metrics.reduce((acc, metric) => {
                    acc[metric.id] = metric;
                    return acc;
                }, {})
            };

            // Store all messages
            allMessages = messages;
            filteredMessages = [];
            currentPage = 1;
            currentEntityFilter = null;

            // Update message count
            d3.select("#message-count").text("0");

            // Update info display
            let methodInfo = `Method: ${method_used}`;
            if (method_used === "lda") {
                methodInfo += ` (${vectorizer_used.toUpperCase()})`;
            }
            methodInfo += ` | Communications: ${total_communications} | Topics: ${topics.length}`;

            d3.select("#method-info").html(methodInfo);
            
            // Update model metrics display
            const metricsDisplay = d3.select("#model-metrics");
            if (model_metrics && Object.keys(model_metrics).length > 0) {
                metricsDisplay.html(`
                    <div>Coherence: ${model_metrics.coherence || '--'}</div>
                    <div>Perplexity: ${model_metrics.perplexity || '--'}</div>
                    <div>Diversity: ${model_metrics.diversity || '--'}</div>
                `);
            } else {
                metricsDisplay.html(`
                    <div>Coherence: --</div>
                    <div>Perplexity: --</div>
                    <div>Diversity: --</div>
                `);
            }
            
            // Update topic count display to reflect actual topics generated
            if (method_used === "bertopic") {
                // For BERTopic, show actual count since it auto-determines topics
                topicCountDisplay.text(`${topics.length} (Auto)`);
                topicCountAuto.property("checked", true);
                topicCountSlider.property("disabled", true);
            }

            // Recreate SVG structure (in case it was replaced by loading message)
            container.html("");
            const svg = container.append("svg")
                .attr("width", "100%")
                .attr("height", "100%")
                .attr("viewBox", [0, 0, width, height])
                .attr("class", "bg-white");
            const g = svg.append("g");

            // Populate topic selector
            const topicSelector = d3.select("#topic-selector");
            topicSelector.html("");
            topicSelector.append("option").text("-- Select Topic --").attr("value", "");

            topics.forEach(topic => {
                if (topic.keywords && topic.keywords.length > 0) {
                    topicSelector.append("option")
                        .text(`Topic ${topic.id}: ${topic.keywords.slice(0, 3).join(", ")}`)
                        .attr("value", topic.id);
                }
            });

            // Prepare nodes and links
            const nodes = graph.nodes.map(n => ({
                ...n,
                type: n.sub_type || "Entity",
                topicScores: entity_topic_scores[n.id] || {}
            }));

            const links = graph.edges.map(e => ({
                ...e,
                source: e.source,
                target: e.target
            }));

            // Initialize simulation
            simulation = d3.forceSimulation(nodes)
                .force("link", d3.forceLink(links).id(d => d.id).distance(100))
                .force("charge", d3.forceManyBody().strength(-300))
                .force("center", d3.forceCenter(width / 2, height / 2))
                .force("collision", d3.forceCollide().radius(25));

            // Draw links
            const link = g.append("g")
                .attr("class", "links")
                .selectAll("line")
                .data(links)
                .join("line")
                .attr("stroke", "#9ca3af")
                .attr("stroke-width", 1)
                .attr("stroke-opacity", 0.3);

            // Draw nodes
            const color = d3.scaleOrdinal(d3.schemeCategory10);
            const node = g.append("g")
                .attr("class", "nodes")
                .selectAll("circle")
                .data(nodes)
                .join("circle")
                .attr("r", 8)
                .attr("fill", d => color(d.type))
                .attr("stroke", "#1e40af")
                .attr("stroke-width", 1.5)
                .attr("opacity", 1)
                .call(drag(simulation));

            // Add node click handler
            node.on("click", function (event, d) {
                // Toggle entity filter
                currentEntityFilter = currentEntityFilter === d.id ? null : d.id;
                updateTopicVisualization(currentTopic);

                // Highlight selected node
                node.attr("class", null);
                d3.select(this).attr("class", "selected");
            });

            // Draw labels
            const label = g.append("g")
                .attr("class", "labels")
                .selectAll("text")
                .data(nodes)
                .join("text")
                .text(d => d.name || d.id)
                .attr("font-size", 10)
                .attr("dx", 10)
                .attr("dy", 4);

            // Add zooming
            svg.call(d3.zoom().on("zoom", (event) => {
                g.attr("transform", event.transform);
            }));

            // Update positions on tick
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

            // Topic selection handler
            topicSelector.on("change", function () {
                currentTopic = this.value;
                updateTopicVisualization(currentTopic);
            });

            // Reset view button
            d3.select("#reset-view").on("click", () => {
                currentTopic = null;
                currentEntityFilter = null;
                updateTopicVisualization(null);
                topicSelector.property("value", "");
                node.attr("class", null);
            });

            // Pagination handlers
            d3.select("#prev-page").on("click", () => {
                if (currentPage > 1) {
                    currentPage--;
                    displayMessages();
                }
            });

            d3.select("#next-page").on("click", () => {
                const totalPages = Math.ceil(filteredMessages.length / messagesPerPage);
                if (currentPage < totalPages) {
                    currentPage++;
                    displayMessages();
                }
            });

            // Update visualization based on topic selection
            function updateTopicVisualization(topicId) {
                // Reset all to full opacity
                node.attr("opacity", 1);
                label.attr("opacity", 1);

                // Update topic details panel
                const topicDetails = d3.select("#topic-details");
                const entityRanking = d3.select("#entity-ranking");

                if (!topicId) {
                    topicDetails.html("<p class='text-gray-500'>Select a topic to view details</p>");
                    entityRanking.html("<p class='text-gray-500'>Entities will appear here</p>");

                    // Clear messages
                    d3.select("#messages-container").html("<p class='text-gray-500'>Select a topic to view related messages</p>");
                    d3.select("#message-count").text("0");
                    d3.select("#page-info").text("Page 1 of 1");
                    d3.select("#prev-page").attr("disabled", true);
                    d3.select("#next-page").attr("disabled", true);

                    return;
                }

                // Find selected topic
                const topic = topicData.topics.find(t => t.id == topicId);
                if (!topic) return;

                // Get topic metrics
                const topicMetrics = topicData.topic_metrics[topicId] || {
                    message_count: 0,
                    avg_message_length: 0,
                    avg_topic_score: 0
                };

                // Update topic details
                topicDetails.html(`
                    <h4 class="font-bold text-lg">Topic ${topic.id}</h4>
                    <p class="text-sm mb-2">Method: ${method_used}${method_used === "lda" ? ` (${vectorizer_used.toUpperCase()})` : ''}</p>
                    
                    <div class="topic-metrics">
                        <div class="metric">
                            <div class="metric-label">Messages</div>
                            <div class="metric-value">${topicMetrics.message_count}</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Avg. Length</div>
                            <div class="metric-value">${topicMetrics.avg_message_length.toFixed(1)}</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Avg. Score</div>
                            <div class="metric-value">${topicMetrics.avg_topic_score.toFixed(3)}</div>
                        </div>
                    </div>
                    
                    <div class="keyword-list">
                        ${topic.keywords.slice(0, 15).map(k =>
                    `<span class="topic-keyword">${k}</span>`
                ).join("")}
                    </div>
                `);

                // Update entity ranking
                const topEntities = Object.entries(topicData.entity_topic_scores)
                    .filter(([_, scores]) => scores[topicId] && scores[topicId] > 0)
                    .map(([entityId, scores]) => ({
                        id: entityId,
                        name: nodes.find(n => n.id === entityId)?.name || entityId,
                        score: scores[topicId]
                    }))
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 15);

                entityRanking.html("");
                if (topEntities.length === 0) {
                    entityRanking.html("<p class='text-gray-500'>No entities found for this topic</p>");
                } else {
                    entityRanking.selectAll(".entity-rank-item")
                        .data(topEntities)
                        .join("div")
                        .attr("class", "entity-rank-item")
                        .html(d => `
                            <span class="entity-name">${d.name}</span>
                            <span class="entity-score">${d.score.toFixed(3)}</span>
                        `);
                }

                // Update node opacity based on topic usage
                node.attr("opacity", d => {
                    const score = d.topicScores[topicId] || 0;
                    return score > 0 ? 0.3 + (0.7 * Math.min(1, score * 5)) : 0.1;
                });

                label.attr("opacity", d => {
                    const score = d.topicScores[topicId] || 0;
                    return score > 0 ? 1 : 0.2;
                });

                // Filter messages by topic and entity
                filteredMessages = allMessages.filter(msg => {
                    const matchesTopic = msg.dominant_topic == topicId;
                    const matchesEntity = !currentEntityFilter ||
                        msg.source === currentEntityFilter ||
                        msg.target === currentEntityFilter;
                    return matchesTopic && matchesEntity;
                });

                // Update message count
                d3.select("#message-count").text(filteredMessages.length);

                // Reset to first page
                currentPage = 1;
                displayMessages();
            }

            // Display paginated messages
            function displayMessages() {
                const messagesContainer = d3.select("#messages-container");
                messagesContainer.html("");

                if (filteredMessages.length === 0) {
                    messagesContainer.html("<p class='text-gray-500'>No messages found for current filters</p>");
                    d3.select("#page-info").text("Page 1 of 1");
                    d3.select("#prev-page").attr("disabled", true);
                    d3.select("#next-page").attr("disabled", true);
                    return;
                }

                const totalPages = Math.ceil(filteredMessages.length / messagesPerPage);
                const startIdx = (currentPage - 1) * messagesPerPage;
                const endIdx = Math.min(startIdx + messagesPerPage, filteredMessages.length);
                const pageMessages = filteredMessages.slice(startIdx, endIdx);

                // Update pagination info
                d3.select("#page-info").text(`Page ${currentPage} of ${totalPages}`);
                d3.select("#prev-page").attr("disabled", currentPage <= 1);
                d3.select("#next-page").attr("disabled", currentPage >= totalPages);

                // Display messages
                pageMessages.forEach(msg => {
                    const messageEl = messagesContainer.append("div")
                        .attr("class", "message-item")
                        .html(`
                            <div class="message-header">
                                <div class="message-participants">${msg.source} → ${msg.target || 'N/A'}</div>
                                <div class="message-datetime">${new Date(msg.datetime).toLocaleString()}</div>
                            </div>
                            <div class="message-content">${msg.content}</div>
                            <div class="message-footer">
                                <div class="message-id">ID: ${msg.id}</div>
                                <div class="topic-confidence">Topic confidence: ${(msg.dominant_weight * 100).toFixed(1)}%</div>
                            </div>
                        `);
                });
            }

            // Drag handlers
            function drag(simulation) {
                function dragstarted(event) {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    event.subject.fx = event.subject.x;
                    event.subject.fy = event.subject.y;
                }

                function dragged(event) {
                    event.subject.fx = event.x;
                    event.subject.fy = event.y;
                }

                function dragended(event) {
                    if (!event.active) simulation.alphaTarget(0);
                    event.subject.fx = null;
                    event.subject.fy = null;
                }

                return d3.drag()
                    .on("start", dragstarted)
                    .on("drag", dragged)
                    .on("end", dragended);
            }

        }).catch(err => {
            console.error("Error loading topic modeling data:", err);
            container.html(`<div class="error-message p-4 text-red-600">Error loading data: ${err.message}</div>`);
        });
    }

    // Initial load
    loadTopicData();
}