// app/static/js/nadia_analysis.js
function init_nadia_analysis() {
    console.log("Initializing Nadia Conti analysis...");
    
    let analysisData = null;
    
    // Initialize tab switching
    initTabSwitching();
    
    // Load data from Flask endpoint
    d3.json("/data/nadia_analysis").then(data => {
        if (data.error) {
            showError(data.error);
            return;
        }
        
        analysisData = data;
        console.log("Nadia analysis data loaded:", data);
        
        // Update executive summary
        updateExecutiveSummary(data);
        
        // Initialize all visualizations
        updateTimelineTab(data);
        updateNetworkTab(data);
        updatePatternsTab(data);
        updateEvidenceTab(data);
        updateConclusion(data);
        
    }).catch(error => {
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
        d3.selectAll(".analysis-tab").on("click", function() {
            const tabName = d3.select(this).attr("data-tab");
            
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
            d3.select(`#${tabName}-tab`).classed("hidden", false);
        });
    }
    
    function updateExecutiveSummary(data) {
        const profile = data.nadia_profile;
        const suspicion = data.suspicion_analysis;
        
        d3.select("#total-communications").text(profile.total_communications);
        d3.select("#suspicion-score").text(suspicion.overall_score);
        d3.select("#risk-level").text(suspicion.recommendation);
        
        // Color code the recommendation
        const recElement = d3.select("#recommendation");
        const recText = suspicion.recommendation;
        
        recElement.text(`Recommendation: ${recText}`);
        
        if (recText === "INVESTIGATE FURTHER") {
            recElement.attr("class", "mt-4 p-3 rounded-lg font-medium bg-red-100 text-red-800");
        } else if (recText === "MONITOR") {
            recElement.attr("class", "mt-4 p-3 rounded-lg font-medium bg-yellow-100 text-yellow-800");
        } else {
            recElement.attr("class", "mt-4 p-3 rounded-lg font-medium bg-green-100 text-green-800");
        }
    }
    
    function updateTimelineTab(data) {
        // Create hourly chart
        createHourlyChart(data.communication_patterns.hourly_distribution);
        
        // Create timeline events
        createTimelineEvents(data.timeline);
    }
    
    function createHourlyChart(hourlyData) {
        const container = d3.select("#hourly-chart");
        container.html(""); // Clear previous content
        
        const width = 400;
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
            .domain([0, d3.max(data, d => d.count)])
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
    }
    
    function createTimelineEvents(timelineData) {
        const container = d3.select("#timeline-events");
        container.html("");
        
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
                    <div class="font-medium text-sm">${d.datetime}</div>
                    <div class="text-xs px-2 py-1 rounded ${getEventTypeClass(d.event_type)}">${d.event_type.replace('_', ' ')}</div>
                `);
            
            event.append("div")
                .attr("class", "text-sm text-gray-600 mb-1")
                .text(`${d.is_sender ? 'To' : 'From'}: ${d.other_party}`);
            
            event.append("div")
                .attr("class", "text-xs text-gray-500")
                .text(d.content_preview);
        });
    }
    
    function getEventTypeClass(eventType) {
        switch(eventType) {
            case "suspicious": return "bg-red-100 text-red-800";
            case "permit_related": return "bg-yellow-100 text-yellow-800";
            default: return "bg-gray-100 text-gray-800";
        }
    }
    
    function updateNetworkTab(data) {
        createNetworkGraph(data.network_data);
        createContactsList(data.nadia_profile.top_contacts);
    }
    
    function createNetworkGraph(networkData) {
        const container = d3.select("#network-graph");
        container.html("");
        
        const width = 500;
        const height = 350;
        
        const svg = container.append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("viewBox", [0, 0, width, height]);
        
        const simulation = d3.forceSimulation(networkData.nodes)
            .force("link", d3.forceLink(networkData.links).id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2));
        
        // Links
        const link = svg.append("g")
            .selectAll("line")
            .data(networkData.links)
            .join("line")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .attr("stroke-width", d => Math.sqrt(d.weight));
        
        // Nodes
        const node = svg.append("g")
            .selectAll("circle")
            .data(networkData.nodes)
            .join("circle")
            .attr("r", d => d.category === "central" ? 15 : Math.max(5, Math.sqrt(d.communication_count) * 2))
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
            .data(networkData.nodes)
            .join("text")
            .text(d => d.name)
            .attr("font-size", d => d.category === "central" ? "12px" : "10px")
            .attr("dx", 15)
            .attr("dy", 4)
            .attr("fill", "#333");
        
        // Add tooltips
        node.append("title")
            .text(d => `${d.name} (${d.type})\n${d.communication_count} communications`);
        
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
    }
    
    function createContactsList(topContacts) {
        const container = d3.select("#contacts-list");
        container.html("");
        
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
    }
    
    function updatePatternsTab(data) {
        createTimingChart(data.communication_patterns.time_distribution);
        createKeywordChart(data.keyword_analysis.keyword_mentions);
        createAuthorityAnalysis(data.authority_patterns);
    }
    
    function createTimingChart(timeDistribution) {
        const container = d3.select("#timing-chart");
        container.html("");
        
        const width = 300;
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
    }
    
    function createKeywordChart(keywordMentions) {
        const container = d3.select("#keyword-chart");
        container.html("");
        
        if (Object.keys(keywordMentions).length === 0) {
            container.append("div")
                .attr("class", "text-gray-500 text-center py-8")
                .text("No suspicious keywords detected");
            return;
        }
        
        const width = 300;
        const height = 180;
        const margin = { top: 20, right: 20, bottom: 40, left: 60 };
        
        const svg = container.append("svg")
            .attr("width", width)
            .attr("height", height);
        
        const data = Object.entries(keywordMentions)
            .slice(0, 8)
            .map(([keyword, count]) => ({ keyword, count }));
        
        const xScale = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.count)])
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
    }
    
    function createAuthorityAnalysis(authorityPatterns) {
        const container = d3.select("#authority-analysis");
        container.html("");
        
        const permitCount = authorityPatterns.permit_related.length;
        const authorityCount = authorityPatterns.authority_abuse_indicators.length;
        
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
            container.append("div")
                .attr("class", "mt-4")
                .html(`
                    <h6 class="font-medium mb-2">Recent Permit Activities:</h6>
                    <div class="space-y-1">
                        ${authorityPatterns.permit_related.slice(0, 3).map(comm => 
                            `<div class="text-sm p-2 bg-yellow-50 rounded">
                                <div class="font-medium">${comm.datetime}</div>
                                <div class="text-gray-600">${comm.content.substring(0, 100)}...</div>
                            </div>`
                        ).join('')}
                    </div>
                `);
        }
    }
    
    function updateEvidenceTab(data) {
        createSuspicionIndicators(data.suspicion_analysis.indicators);
        createSuspiciousMessages(data.keyword_analysis.suspicious_messages);
    }
    
    function createSuspicionIndicators(indicators) {
        const container = d3.select("#suspicion-indicators");
        container.html("");
        
        if (indicators.length === 0) {
            container.append("div")
                .attr("class", "text-green-600 p-4 bg-green-50 rounded-lg")
                .text("No significant suspicion indicators detected.");
            return;
        }
        
        indicators.forEach(indicator => {
            const severityClass = getSeverityClass(indicator.severity);
            
            container.append("div")
                .attr("class", `p-4 rounded-lg ${severityClass}`)
                .html(`
                    <div class="flex justify-between items-start mb-2">
                        <span class="font-medium capitalize">${indicator.type.replace('_', ' ')}</span>
                        <span class="text-xs px-2 py-1 rounded bg-white bg-opacity-50">${indicator.severity}</span>
                    </div>
                    <div class="text-sm">${indicator.description}</div>
                `);
        });
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
        
        if (suspiciousMessages.length === 0) {
            container.append("div")
                .attr("class", "text-gray-500 p-4")
                .text("No highly suspicious messages detected.");
            return;
        }
        
        suspiciousMessages.slice(0, 10).forEach(message => {
            const messageDiv = container.append("div")
                .attr("class", "border rounded-lg p-3 cursor-pointer hover:bg-gray-50")
                .on("click", () => showMessageModal(message));
            
            messageDiv.append("div")
                .attr("class", "flex justify-between items-start mb-2")
                .html(`
                    <div class="font-medium text-sm">${message.datetime}</div>
                    <div class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Score: ${message.suspicion_score}</div>
                `);
            
            messageDiv.append("div")
                .attr("class", "text-sm text-gray-600 mb-2")
                .text(`${message.is_sender ? 'To' : 'From'}: ${message.target || message.source}`);
            
            messageDiv.append("div")
                .attr("class", "text-xs text-gray-500 mb-2")
                .text(message.content.substring(0, 150) + "...");
            
            messageDiv.append("div")
                .attr("class", "text-xs")
                .html(`Keywords: ${message.keywords.map(k => `<span class="bg-red-100 text-red-800 px-1 rounded">${k}</span>`).join(' ')}`);
        });
    }
    
    function updateConclusion(data) {
        const container = d3.select("#conclusion-content");
        const suspicion = data.suspicion_analysis;
        const profile = data.nadia_profile;
        
        let conclusion = "";
        let justification = "";
        
        if (suspicion.overall_score >= 3) {
            conclusion = "CLEPPER'S SUSPICIONS APPEAR JUSTIFIED";
            justification = `
                <p class="text-red-700 font-semibold mb-4">${conclusion}</p>
                <p class="mb-3">The analysis reveals multiple concerning patterns in Nadia Conti's behavior:</p>
                <ul class="list-disc list-inside space-y-2 mb-4">
                    ${suspicion.indicators.map(ind => `<li>${ind.description}</li>`).join('')}
                </ul>
                <p>These patterns suggest potential involvement in illegal activities requiring immediate investigation.</p>
            `;
        } else if (suspicion.overall_score >= 1) {
            conclusion = "SUSPICIONS REQUIRE MONITORING";
            justification = `
                <p class="text-yellow-700 font-semibold mb-4">${conclusion}</p>
                <p class="mb-3">While not definitively proving illegal activity, several concerning indicators warrant continued monitoring:</p>
                <ul class="list-disc list-inside space-y-2 mb-4">
                    ${suspicion.indicators.map(ind => `<li>${ind.description}</li>`).join('')}
                </ul>
                <p>Recommend enhanced surveillance and documentation of future activities.</p>
            `;
        } else {
            conclusion = "INSUFFICIENT EVIDENCE FOR CURRENT SUSPICIONS";
            justification = `
                <p class="text-green-700 font-semibold mb-4">${conclusion}</p>
                <p class="mb-3">Based on the available communication data, no significant indicators of illegal activity were detected.</p>
                <p>However, this analysis is limited to communication patterns and does not rule out other forms of evidence.</p>
            `;
        }
        
        container.html(`
            <div class="prose max-w-none">
                ${justification}
                <div class="mt-6 p-4 bg-gray-50 rounded-lg">
                    <h4 class="font-semibold mb-2">Analysis Summary:</h4>
                    <ul class="list-disc list-inside space-y-1 text-sm">
                        <li>Total communications analyzed: ${profile.total_communications}</li>
                        <li>Communication period: ${profile.date_range.start} to ${profile.date_range.end}</li>
                        <li>Suspicion indicators found: ${suspicion.overall_score}</li>
                        <li>Risk level: ${suspicion.recommendation}</li>
                    </ul>
                </div>
            </div>
        `);
    }
    
    function showMessageModal(messageData) {
        const modal = d3.select("#message-modal");
        const content = d3.select("#message-modal-content");
        
        content.html(`
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div><strong>Date:</strong> ${messageData.date}</div>
                    <div><strong>Time:</strong> ${messageData.time}</div>
                    <div><strong>From:</strong> ${messageData.source}</div>
                    <div><strong>To:</strong> ${messageData.target}</div>
                </div>
                <div>
                    <strong>Content:</strong>
                    <div class="mt-2 p-3 bg-gray-50 rounded-lg text-sm">
                        ${messageData.content}
                    </div>
                </div>
                ${messageData.keywords ? `
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