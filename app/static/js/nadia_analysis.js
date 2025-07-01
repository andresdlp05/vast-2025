// app/static/js/nadia_analysis.js
function init_nadia_analysis() {
    console.log("Initializing Nadia Conti analysis...");
    
    let analysisData = null;
    
    // Initialize tab switching FIRST
    initTabSwitching();
    
    // Load data from Flask endpoint
    d3.json("/data/nadia_analysis")
        .then(data => {
            if (data.error) {
                showError(data.error);
                return;
            }
            
            analysisData = data;
            console.log("Nadia analysis data loaded:", data);
            
            // Update executive summary
            updateExecutiveSummary(data);
            
            // Initialize all visualizations immediately
            updateTimelineTab(data);
            updateNetworkTab(data);
            updatePatternsTab(data);
            updateEvidenceTab(data);
            updateConclusion(data);
        })
        .catch(error => {
            console.error("Error loading Nadia analysis data:", error);
            showError(`Failed to load data: ${error.message}`);
        });
    
    function showError(message) {
        d3.select("#executive-summary").html(`
            <div class="text-red-600 p-4 rounded-lg bg-red-50">
                <h3 class="font-semibold">Error</h3>
                <p>${message}</p>
            </div>
        `);
    }
    
    function initTabSwitching() {
        console.log("Initializing tab switching...");
        
        // Remove any existing event listeners
        d3.selectAll(".analysis-tab").on("click", null);
        
        // Add new event listeners
        d3.selectAll(".analysis-tab").on("click", function(event) {
            event.preventDefault();
            event.stopPropagation();
            
            const tabName = d3.select(this).attr("data-tab");
            console.log(`Tab clicked: ${tabName}`);
            
            if (!tabName) {
                console.error("No data-tab attribute found");
                return;
            }
            
            // Update tab appearance
            d3.selectAll(".analysis-tab")
                .classed("active", false)
                .classed("border-blue-500 text-blue-600", false)
                .classed("border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300", true);
            
            d3.select(this)
                .classed("active", true)
                .classed("border-blue-500 text-blue-600", true)
                .classed("border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300", false);
            
            // Show/hide content
            d3.selectAll(".tab-content").classed("hidden", true);
            const targetTab = d3.select(`#${tabName}-tab`);
            
            if (targetTab.empty()) {
                console.error(`Target tab not found: #${tabName}-tab`);
                return;
            }
            
            targetTab.classed("hidden", false);
            console.log(`Switched to tab: ${tabName}`);
            
            // NO re-trigger - just ensure the data is already loaded
            if (analysisData) {
                console.log(`Tab ${tabName} is now visible with existing data`);
            }
        });
        
        console.log("Tab switching initialized");
    }
    
    function updateExecutiveSummary(data) {
        try {
            const profile = data.nadia_profile || {};
            const suspicion = data.suspicion_analysis || {};
            
            d3.select("#total-communications").text(profile.total_communications || 0);
            d3.select("#suspicion-score").text(suspicion.overall_score || 0);
            d3.select("#risk-level").text(suspicion.recommendation || "Unknown");
            
            // Color code the recommendation
            const recElement = d3.select("#recommendation");
            const recText = suspicion.recommendation || "Unknown";
            
            recElement.text(`Recommendation: ${recText}`);
            
            if (recText === "INVESTIGATE FURTHER") {
                recElement.attr("class", "mt-4 p-3 rounded-lg font-medium bg-red-100 text-red-800");
            } else if (recText === "MONITOR") {
                recElement.attr("class", "mt-4 p-3 rounded-lg font-medium bg-yellow-100 text-yellow-800");
            } else {
                recElement.attr("class", "mt-4 p-3 rounded-lg font-medium bg-green-100 text-green-800");
            }
        } catch (error) {
            console.error("Error updating executive summary:", error);
        }
    }
    
    function updateTimelineTab(data) {
        console.log("Updating timeline tab...");
        try {
            // Create hourly chart immediately - no delays
            if (data.communication_patterns && data.communication_patterns.hourly_distribution) {
                createHourlyChart(data.communication_patterns.hourly_distribution);
            } else {
                d3.select("#hourly-chart").html('<p class="text-gray-500">No hourly data available</p>');
            }
            
            // Create timeline events
            if (data.timeline) {
                createTimelineEvents(data.timeline);
            } else {
                d3.select("#timeline-events").html('<p class="text-gray-500">No timeline data available</p>');
            }
        } catch (error) {
            console.error("Error in updateTimelineTab:", error);
            d3.select("#hourly-chart").html('<p class="text-red-500">Error creating hourly chart</p>');
            d3.select("#timeline-events").html('<p class="text-red-500">Error creating timeline events</p>');
        }
    }
    
    function createHourlyChart(hourlyData) {
        const container = d3.select("#hourly-chart");
        container.html(""); // Clear previous content
        
        if (!hourlyData || !Array.isArray(hourlyData)) {
            container.html('<p class="text-gray-500">No hourly data available</p>');
            return;
        }
        
        try {
            // Get container dimensions immediately
            const containerNode = container.node();
            const width = Math.max(400, containerNode.getBoundingClientRect().width - 20);
            const height = 200;
            const margin = { top: 20, right: 20, bottom: 40, left: 40 };
            
            const svg = container.append("svg")
                .attr("width", width)
                .attr("height", height);
            
            // Convert hourly data to array format
            const data = hourlyData.map((count, hour) => ({ hour, count }));
            
            // Scales
            const xScale = d3.scaleBand()
                .domain(d3.range(24))
                .range([margin.left, width - margin.right])
                .padding(0.1);
            
            const yScale = d3.scaleLinear()
                .domain([0, d3.max(data, d => d.count) || 1])
                .nice()
                .range([height - margin.bottom, margin.top]);
            
            // Bars
            svg.selectAll("rect")
                .data(data)
                .join("rect")
                .attr("x", d => xScale(d.hour))
                .attr("y", d => yScale(d.count))
                .attr("width", xScale.bandwidth())
                .attr("height", d => yScale(0) - yScale(d.count))
                .attr("fill", d => {
                    // Color code suspicious hours
                    if (d.hour >= 23 || d.hour <= 4) return "#ef4444"; // Late night - red
                    if (d.hour >= 5 && d.hour <= 7) return "#f59e0b"; // Early morning - yellow
                    return "#3b82f6"; // Normal hours - blue
                })
                .attr("rx", 2);
            
            // Add tooltips
            svg.selectAll("rect")
                .append("title")
                .text(d => `${d.count} communications at ${d.hour}:00`);
            
            // X-axis
            svg.append("g")
                .attr("transform", `translate(0,${height - margin.bottom})`)
                .call(d3.axisBottom(xScale).tickValues([0, 6, 12, 18]).tickFormat(d => `${d}:00`));
            
            // Y-axis
            svg.append("g")
                .attr("transform", `translate(${margin.left},0)`)
                .call(d3.axisLeft(yScale));
            
            // Labels
            svg.append("text")
                .attr("x", width / 2)
                .attr("y", height - 5)
                .attr("text-anchor", "middle")
                .style("font-size", "12px")
                .text("Hour of Day");
                
        } catch (error) {
            console.error("Error creating hourly chart:", error);
            container.html('<p class="text-red-500">Error creating chart</p>');
        }
    }
    
    function createTimelineEvents(timelineData) {
        const container = d3.select("#timeline-events");
        container.html("");
        
        if (!timelineData || !Array.isArray(timelineData)) {
            container.html('<p class="text-gray-500">No timeline data available</p>');
            return;
        }
        
        try {
            const events = container.selectAll(".timeline-event")
                .data(timelineData.slice(0, 20)) // Show first 20 events
                .enter()
                .append("div")
                .attr("class", "timeline-event p-3 border rounded-lg cursor-pointer hover:bg-gray-50")
                .style("border-color", d => {
                    if (d.event_type === "suspicious") return "#ef4444";
                    if (d.event_type === "permit_related") return "#f59e0b";
                    return "#e5e7eb";
                })
                .on("click", function(event, d) {
                    showMessageModal(d);
                });
            
            events.each(function(d) {
                const event = d3.select(this);
                
                event.append("div")
                    .attr("class", "flex justify-between items-start mb-2")
                    .html(`
                        <div class="font-medium text-sm">${d.datetime || 'Unknown time'}</div>
                        <div class="text-xs px-2 py-1 rounded ${getEventTypeClass(d.event_type || 'normal')}">${(d.event_type || 'normal').replace('_', ' ')}</div>
                    `);
                
                event.append("div")
                    .attr("class", "text-sm text-gray-600 mb-1")
                    .text(`${d.is_sender ? 'To' : 'From'}: ${d.other_party || 'Unknown'}`);
                
                event.append("div")
                    .attr("class", "text-xs text-gray-500")
                    .text(d.content_preview || 'No content available');
            });
        } catch (error) {
            console.error("Error creating timeline events:", error);
            container.html('<p class="text-red-500">Error creating timeline</p>');
        }
    }
    
    function getEventTypeClass(eventType) {
        switch(eventType) {
            case "suspicious": return "bg-red-100 text-red-800";
            case "permit_related": return "bg-yellow-100 text-yellow-800";
            default: return "bg-gray-100 text-gray-800";
        }
    }
    
    function updateNetworkTab(data) {
        console.log("Updating network tab...");
        try {
            if (data.network_data) {
                createNetworkGraph(data.network_data);
            } else {
                d3.select("#network-graph").html('<p class="text-gray-500">No network data available</p>');
            }
            if (data.nadia_profile && data.nadia_profile.top_contacts) {
                createContactsList(data.nadia_profile.top_contacts);
            } else {
                d3.select("#contacts-list").html('<p class="text-gray-500">No contacts data available</p>');
            }
        } catch (error) {
            console.error("Error in updateNetworkTab:", error);
            d3.select("#network-graph").html('<p class="text-red-500">Error creating network graph</p>');
            d3.select("#contacts-list").html('<p class="text-red-500">Error creating contacts list</p>');
        }
    }
    
    function createNetworkGraph(networkData) {
        const container = d3.select("#network-graph");
        container.html("");
        
        if (!networkData || !networkData.nodes || !networkData.links) {
            container.html('<p class="text-gray-500">No network data available</p>');
            return;
        }
        
        try {
            // Get container dimensions immediately
            const containerNode = container.node();
            const width = Math.max(400, containerNode.getBoundingClientRect().width - 20);
            const height = 350;
            
            const svg = container.append("svg")
                .attr("width", "100%")
                .attr("height", "100%")
                .attr("viewBox", [0, 0, width, height]);
            
            // Make a copy of the data to avoid mutating the original
            const nodes = networkData.nodes.map(d => ({...d}));
            const links = networkData.links.map(d => ({...d}));
            
            const simulation = d3.forceSimulation(nodes)
                .force("link", d3.forceLink(links).id(d => d.id).distance(80))
                .force("charge", d3.forceManyBody().strength(-200))
                .force("center", d3.forceCenter(width / 2, height / 2))
                .force("collision", d3.forceCollide().radius(20));
            
            // Links
            const link = svg.append("g")
                .selectAll("line")
                .data(links)
                .join("line")
                .attr("stroke", "#999")
                .attr("stroke-opacity", 0.6)
                .attr("stroke-width", d => Math.sqrt(d.weight || 1) * 2);
            
            // Nodes
            const node = svg.append("g")
                .selectAll("circle")
                .data(nodes)
                .join("circle")
                .attr("r", d => d.category === "central" ? 12 : Math.max(4, Math.sqrt((d.communication_count || 1) * 2)))
                .attr("fill", d => {
                    if (d.category === "central") return "#dc2626";
                    if (d.type === "Person") return "#3b82f6";
                    if (d.type === "Organization") return "#059669";
                    if (d.type === "Vessel") return "#d97706";
                    return "#6b7280";
                })
                .attr("stroke", "#fff")
                .attr("stroke-width", 2)
                .call(d3.drag()
                    .on("start", dragstarted)
                    .on("drag", dragged)
                    .on("end", dragended));
            
            // Labels
            const label = svg.append("g")
                .selectAll("text")
                .data(nodes)
                .join("text")
                .text(d => d.name || d.id)
                .attr("font-size", d => d.category === "central" ? "12px" : "10px")
                .attr("dx", 15)
                .attr("dy", 4)
                .attr("fill", "#333");
            
            // Add tooltips
            node.append("title")
                .text(d => `${d.name || d.id} (${d.type || 'Unknown'})\n${d.communication_count || 0} communications`);
            
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
        } catch (error) {
            console.error("Error creating network graph:", error);
            container.html('<p class="text-red-500">Error creating network graph</p>');
        }
    }
    
    function createContactsList(topContacts) {
        const container = d3.select("#contacts-list");
        container.html("");
        
        if (!topContacts || typeof topContacts !== 'object') {
            container.html('<p class="text-gray-500">No contacts data available</p>');
            return;
        }
        
        try {
            const contacts = Object.entries(topContacts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
            
            contacts.forEach(([contact, count]) => {
                container.append("div")
                    .attr("class", "flex justify-between items-center p-2 bg-gray-50 rounded")
                    .html(`
                        <span class="font-medium text-sm">${contact}</span>
                        <span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">${count}</span>
                    `);
            });
        } catch (error) {
            console.error("Error creating contacts list:", error);
            container.html('<p class="text-red-500">Error creating contacts list</p>');
        }
    }
    
    function updatePatternsTab(data) {
        console.log("Updating patterns tab...");
        try {
            if (data.communication_patterns && data.communication_patterns.time_distribution) {
                createTimingChart(data.communication_patterns.time_distribution);
            } else {
                d3.select("#timing-chart").html('<p class="text-gray-500">No timing data available</p>');
            }
            if (data.keyword_analysis && data.keyword_analysis.keyword_mentions) {
                createKeywordChart(data.keyword_analysis.keyword_mentions);
            } else {
                d3.select("#keyword-chart").html('<p class="text-gray-500">No keyword data available</p>');
            }
            if (data.authority_patterns) {
                createAuthorityAnalysis(data.authority_patterns);
            } else {
                d3.select("#authority-analysis").html('<p class="text-gray-500">No authority patterns data available</p>');
            }
        } catch (error) {
            console.error("Error in updatePatternsTab:", error);
            d3.select("#timing-chart").html('<p class="text-red-500">Error creating timing chart</p>');
            d3.select("#keyword-chart").html('<p class="text-red-500">Error creating keyword chart</p>');
            d3.select("#authority-analysis").html('<p class="text-red-500">Error creating authority analysis</p>');
        }
    }
    
    function createTimingChart(timeDistribution) {
        const container = d3.select("#timing-chart");
        container.html("");
        
        if (!timeDistribution || typeof timeDistribution !== 'object') {
            container.html('<p class="text-gray-500">No timing data available</p>');
            return;
        }
        
        try {
            // Get container dimensions immediately
            const containerNode = container.node();
            const width = Math.max(250, containerNode.getBoundingClientRect().width - 20);
            const height = 180;
            const radius = Math.min(width, height) / 2 - 10;
            
            const svg = container.append("svg")
                .attr("width", width)
                .attr("height", height);
            
            const g = svg.append("g")
                .attr("transform", `translate(${width/2},${height/2})`);
            
            const color = d3.scaleOrdinal()
                .domain(Object.keys(timeDistribution))
                .range(["#ef4444", "#3b82f6", "#059669", "#dc2626"]);
            
            const pie = d3.pie()
                .value(d => d.value);
            
            const arc = d3.arc()
                .innerRadius(0)
                .outerRadius(radius);
            
            const data = Object.entries(timeDistribution).map(([key, value]) => ({
                key: key.replace('_', ' '),
                value
            }));
            
            const arcs = g.selectAll("arc")
                .data(pie(data))
                .enter()
                .append("g");
            
            arcs.append("path")
                .attr("d", arc)
                .attr("fill", d => color(d.data.key))
                .append("title")
                .text(d => `${d.data.key}: ${d.data.value} communications`);
            
            arcs.append("text")
                .attr("transform", d => `translate(${arc.centroid(d)})`)
                .attr("text-anchor", "middle")
                .attr("font-size", "10px")
                .text(d => d.data.value > 0 ? d.data.value : "");
        } catch (error) {
            console.error("Error creating timing chart:", error);
            container.html('<p class="text-red-500">Error creating timing chart</p>');
        }
    }
    
    function createKeywordChart(keywordMentions) {
        const container = d3.select("#keyword-chart");
        container.html("");
        
        if (!keywordMentions || Object.keys(keywordMentions).length === 0) {
            container.append("div")
                .attr("class", "text-gray-500 text-center py-8")
                .text("No suspicious keywords detected");
            return;
        }
        
        try {
            // Get container dimensions immediately
            const containerNode = container.node();
            const width = Math.max(250, containerNode.getBoundingClientRect().width - 20);
            const height = 180;
            const margin = { top: 20, right: 20, bottom: 40, left: 60 };
            
            const svg = container.append("svg")
                .attr("width", width)
                .attr("height", height);
            
            const data = Object.entries(keywordMentions)
                .slice(0, 8)
                .map(([keyword, count]) => ({ keyword, count }));
            
            const xScale = d3.scaleLinear()
                .domain([0, d3.max(data, d => d.count) || 1])
                .range([margin.left, width - margin.right]);
            
            const yScale = d3.scaleBand()
                .domain(data.map(d => d.keyword))
                .range([margin.top, height - margin.bottom])
                .padding(0.1);
            
            svg.selectAll("rect")
                .data(data)
                .join("rect")
                .attr("x", margin.left)
                .attr("y", d => yScale(d.keyword))
                .attr("width", d => xScale(d.count) - margin.left)
                .attr("height", yScale.bandwidth())
                .attr("fill", "#ef4444")
                .attr("rx", 2);
            
            svg.selectAll("text")
                .data(data)
                .join("text")
                .attr("x", margin.left - 5)
                .attr("y", d => yScale(d.keyword) + yScale.bandwidth() / 2)
                .attr("dy", "0.35em")
                .attr("text-anchor", "end")
                .attr("font-size", "10px")
                .text(d => d.keyword);
            
            svg.selectAll(".count-label")
                .data(data)
                .join("text")
                .attr("class", "count-label")
                .attr("x", d => xScale(d.count) + 3)
                .attr("y", d => yScale(d.keyword) + yScale.bandwidth() / 2)
                .attr("dy", "0.35em")
                .attr("font-size", "10px")
                .text(d => d.count);
        } catch (error) {
            console.error("Error creating keyword chart:", error);
            container.html('<p class="text-red-500">Error creating keyword chart</p>');
        }
    }
    
    function createAuthorityAnalysis(authorityPatterns) {
        const container = d3.select("#authority-analysis");
        container.html("");
        
        if (!authorityPatterns) {
            container.html('<p class="text-gray-500">No authority patterns data available</p>');
            return;
        }
        
        try {
            const permitCount = (authorityPatterns.permit_related || []).length;
            const authorityCount = (authorityPatterns.authority_abuse_indicators || []).length;
            
            container.append("div")
                .attr("class", "grid grid-cols-2 gap-4 mb-4")
                .html(`
                    <div class="bg-yellow-50 p-3 rounded-lg">
                        <div class="text-lg font-bold text-yellow-600">${permitCount}</div>
                        <div class="text-sm text-gray-600">Permit-related communications</div>
                    </div>
                    <div class="bg-red-50 p-3 rounded-lg">
                        <div class="text-lg font-bold text-red-600">${authorityCount}</div>
                        <div class="text-sm text-gray-600">Authority abuse indicators</div>
                    </div>
                `);
            
            if (permitCount > 0) {
                const permitData = authorityPatterns.permit_related || [];
                container.append("div")
                    .attr("class", "mt-4")
                    .html(`
                        <h6 class="font-medium mb-2">Recent Permit Activities:</h6>
                        <div class="space-y-1">
                            ${permitData.slice(0, 3).map(comm => 
                                `<div class="text-sm p-2 bg-yellow-50 rounded">
                                    <div class="font-medium">${comm.datetime || 'Unknown time'}</div>
                                    <div class="text-gray-600">${(comm.content || 'No content').substring(0, 100)}...</div>
                                </div>`
                            ).join('')}
                        </div>
                    `);
            }
        } catch (error) {
            console.error("Error creating authority analysis:", error);
            container.html('<p class="text-red-500">Error creating authority analysis</p>');
        }
    }
    
    function updateEvidenceTab(data) {
        console.log("Updating evidence tab...");
        try {
            if (data.suspicion_analysis && data.suspicion_analysis.indicators) {
                createSuspicionIndicators(data.suspicion_analysis.indicators);
            } else {
                d3.select("#suspicion-indicators").html('<p class="text-gray-500">No suspicion indicators available</p>');
            }
            if (data.keyword_analysis && data.keyword_analysis.suspicious_messages) {
                createSuspiciousMessages(data.keyword_analysis.suspicious_messages);
            } else {
                d3.select("#suspicious-messages").html('<p class="text-gray-500">No suspicious messages available</p>');
            }
        } catch (error) {
            console.error("Error in updateEvidenceTab:", error);
            d3.select("#suspicion-indicators").html('<p class="text-red-500">Error creating suspicion indicators</p>');
            d3.select("#suspicious-messages").html('<p class="text-red-500">Error creating suspicious messages</p>');
        }
    }
    
    function createSuspicionIndicators(indicators) {
        const container = d3.select("#suspicion-indicators");
        container.html("");
        
        if (!indicators || !Array.isArray(indicators) || indicators.length === 0) {
            container.append("div")
                .attr("class", "text-green-600 p-4 bg-green-50 rounded-lg")
                .text("No significant suspicion indicators detected.");
            return;
        }
        
        try {
            indicators.forEach(indicator => {
                const severityClass = getSeverityClass(indicator.severity || 'low');
                
                container.append("div")
                    .attr("class", `p-4 rounded-lg ${severityClass}`)
                    .html(`
                        <div class="flex justify-between items-start mb-2">
                            <span class="font-medium capitalize">${(indicator.type || 'unknown').replace('_', ' ')}</span>
                            <span class="text-xs px-2 py-1 rounded bg-white bg-opacity-50">${indicator.severity || 'unknown'}</span>
                        </div>
                        <div class="text-sm">${indicator.description || 'No description available'}</div>
                    `);
            });
        } catch (error) {
            console.error("Error creating suspicion indicators:", error);
            container.html('<p class="text-red-500">Error creating suspicion indicators</p>');
        }
    }
    
    function getSeverityClass(severity) {
        switch(severity) {
            case "high": return "bg-red-100 text-red-800 border border-red-200";
            case "medium": return "bg-yellow-100 text-yellow-800 border border-yellow-200";
            case "low": return "bg-blue-100 text-blue-800 border border-blue-200";
            default: return "bg-gray-100 text-gray-800 border border-gray-200";
        }
    }
    
    function createSuspiciousMessages(suspiciousMessages) {
        const container = d3.select("#suspicious-messages");
        container.html("");
        
        if (!suspiciousMessages || !Array.isArray(suspiciousMessages) || suspiciousMessages.length === 0) {
            container.append("div")
                .attr("class", "text-gray-500 p-4")
                .text("No highly suspicious messages detected.");
            return;
        }
        
        try {
            suspiciousMessages.slice(0, 10).forEach(message => {
                const messageDiv = container.append("div")
                    .attr("class", "border rounded-lg p-3 cursor-pointer hover:bg-gray-50")
                    .on("click", () => showMessageModal(message));
                
                messageDiv.append("div")
                    .attr("class", "flex justify-between items-start mb-2")
                    .html(`
                        <div class="font-medium text-sm">${message.datetime || 'Unknown time'}</div>
                        <div class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Score: ${message.suspicion_score || 0}</div>
                    `);
                
                messageDiv.append("div")
                    .attr("class", "text-sm text-gray-600 mb-2")
                    .text(`${message.is_sender ? 'To' : 'From'}: ${message.target || message.source || 'Unknown'}`);
                
                messageDiv.append("div")
                    .attr("class", "text-xs text-gray-500 mb-2")
                    .text((message.content || 'No content').substring(0, 150) + "...");
                
                if (message.keywords && Array.isArray(message.keywords)) {
                    messageDiv.append("div")
                        .attr("class", "text-xs")
                        .html(`Keywords: ${message.keywords.map(k => `<span class="bg-red-100 text-red-800 px-1 rounded">${k}</span>`).join(' ')}`);
                }
            });
        } catch (error) {
            console.error("Error creating suspicious messages:", error);
            container.html('<p class="text-red-500">Error creating suspicious messages</p>');
        }
    }
    
    function updateConclusion(data) {
        try {
            const container = d3.select("#conclusion-content");
            const suspicion = data.suspicion_analysis || {};
            const profile = data.nadia_profile || {};
            
            container.html(`
                <div class="prose max-w-none">
                    <p class="mb-3">Analysis of Nadia Conti's communication patterns has been completed.</p>
                    <div class="mt-6 p-4 bg-gray-50 rounded-lg">
                        <h4 class="font-semibold mb-2">Analysis Summary:</h4>
                        <ul class="list-disc list-inside space-y-1 text-sm">
                            <li>Total communications analyzed: ${profile.total_communications || 0}</li>
                            <li>Suspicion indicators found: ${suspicion.overall_score || 0}</li>
                            <li>Risk level: ${suspicion.recommendation || 'Unknown'}</li>
                        </ul>
                    </div>
                </div>
            `);
        } catch (error) {
            console.error("Error updating conclusion:", error);
        }
    }
    
    function showMessageModal(messageData) {
        console.log("Showing message modal for:", messageData);
        
        const modal = d3.select("#message-modal");
        const content = d3.select("#message-modal-content");
        
        if (modal.empty()) {
            console.error("Message modal not found");
            return;
        }
        
        try {
            content.html(`
                <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div><strong>Date:</strong> ${messageData.date || messageData.datetime || 'Unknown'}</div>
                        <div><strong>Time:</strong> ${messageData.time || 'Unknown'}</div>
                        <div><strong>From:</strong> ${messageData.source || 'Unknown'}</div>
                        <div><strong>To:</strong> ${messageData.target || messageData.other_party || 'Unknown'}</div>
                    </div>
                    <div>
                        <strong>Content:</strong>
                        <div class="mt-2 p-3 bg-gray-50 rounded-lg text-sm">
                            ${messageData.content || messageData.content_preview || 'No content available'}
                        </div>
                    </div>
                    ${messageData.keywords && Array.isArray(messageData.keywords) && messageData.keywords.length > 0 ? `
                        <div>
                            <strong>Suspicious Keywords:</strong>
                            <div class="mt-2">
                                ${messageData.keywords.map(k => `<span class="bg-red-100 text-red-800 px-2 py-1 rounded mr-2">${k}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `);
            
            modal.classed("hidden", false);
        } catch (error) {
            console.error("Error showing message modal:", error);
        }
    }
    
    // Close modal handlers
    d3.select("#close-message-modal").on("click", () => {
        d3.select("#message-modal").classed("hidden", true);
    });
    
    d3.select("#message-modal").on("click", function(event) {
        if (event.target === this) {
            d3.select(this).classed("hidden", true);
        }
    });
}

// Export the init function
window.init_nadia_analysis = init_nadia_analysis;