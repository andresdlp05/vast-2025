function init_daily_patterns() {
    // Updated Configuration
    const bandHeight = 110;
    const hourWidth = 150;
    const markerSize_h = 26;
    const markerSize_v = 16;
    const markerSpacing = 3;
    const maxStackHeight = bandHeight - 10;
    const cornerRadius = 6;

    // Color variables
    const daySeparatorColor = "#94a3b8";
    const hourLineColor = "#e2e8f0";
    const textColor = "#334155";
    const axisColor = "#000000";

    const colors = {
        'Person': '#4f46e5',
        'Organization': '#dc2626',
        'Vessel': '#059669',
        'Group': '#d97706',
        'Location': '#0284c7'
    };

    // Select containers
    const visContainer = d3.select("#daily-patterns-vis");
    const legendContainer = d3.select("#daily-patterns-legend");
    visContainer.html("");
    legendContainer.html("");

    // Create tooltip
    const tooltip = d3.select("body").append("div")
        .attr("class", "absolute bg-white p-3 rounded shadow-lg border border-gray-200 text-sm max-w-xs z-50 hidden")
        .style("pointer-events", "none");

    // Store visualization state
    let allEvents = [];
    let allEntities = [];
    let allKeywords = [];
    let allTopics = [];
    let eventTopicData = {};
    let selectedEntityIds = [];
    let selectedKeywordId = null;
    let selectedTopicId = null;
    let customKeyword = "";
    let currentTopicMethod = "bertopic";
    let topicsLoaded = false;
    let letterMaps = {};
    let entityLookup = {};
    let eventContentLookup = {};

    // Fetch data from Flask endpoint
    d3.json("/data/daily_patterns").then(data => {
        allEvents = data.events;
        allEntities = data.entities;
        allKeywords = data.keywords || [];

        // Create entity lookup
        allEntities.forEach(entity => {
            entityLookup[entity.id] = entity;
        });

        // Create event content lookup
        allEvents.forEach(event => {
            eventContentLookup[event.id] = event.content || "";
        });

        // Calculate communication count for each entity
        const commCount = {};
        allEntities.forEach(entity => commCount[entity.id] = 0);

        allEvents.forEach(event => {
            commCount[event.entity_id] = (commCount[event.entity_id] || 0) + 1;
            event.target_entities.forEach(targetId => {
                commCount[targetId] = (commCount[targetId] || 0) + 1;
            });
        });

        // Sort entities by communication count (descending)
        allEntities.sort((a, b) => commCount[b.id] - commCount[a.id]);

        // Group events by day
        const eventsByDay = {};
        allEvents.forEach(event => {
            const day = event.day;
            if (!eventsByDay[day]) eventsByDay[day] = [];
            eventsByDay[day].push(event);
        });

        // Get sorted days
        const days = Object.keys(eventsByDay)
            .map(Number)
            .sort((a, b) => a - b);

        // Find min/max hours
        let minHour = 24, maxHour = 0;
        allEvents.forEach(event => {
            const hour = new Date(event.datetime).getHours();
            if (hour < minHour) minHour = hour;
            if (hour > maxHour) maxHour = hour;
        });

        // Add padding
        minHour = Math.max(0, minHour);
        maxHour = Math.min(24, maxHour + 1);
        const hourRange = maxHour - minHour;

        // Create SVG dimensions
        const svgHeight = days.length * bandHeight + 50;
        const svgWidth = hourRange * hourWidth + 100;

        // Create SVG
        const svg = visContainer.append("svg")
            .attr("width", "100%")
            .attr("height", svgHeight)
            .attr("viewBox", [0, 0, svgWidth, svgHeight])
            .attr("class", "bg-white");

        // Create clip path for rounded corners
        svg.append("defs")
            .append("clipPath")
            .attr("id", "marker-clip")
            .append("rect")
            .attr("width", markerSize_h)
            .attr("height", markerSize_v)
            .attr("rx", cornerRadius)
            .attr("ry", cornerRadius);

        // Create scales
        const xScale = d3.scaleLinear()
            .domain([minHour, maxHour])
            .range([40, svgWidth - 20]);

        // Create axes
        const hourTicks = d3.range(minHour, maxHour + 1);
        const xAxis = d3.axisTop(xScale)
            .tickValues(hourTicks)
            .tickFormat(d => `${d}:00`);

        svg.append("g")
            .attr("class", "axis")
            .attr("transform", "translate(0, 50)")
            .call(xAxis)
            .attr("color", axisColor);

        // Draw hour lines
        hourTicks.forEach(hour => {
            svg.append("line")
                .attr("x1", xScale(hour))
                .attr("y1", 40)
                .attr("x2", xScale(hour))
                .attr("y2", svgHeight)
                .attr("stroke", hourLineColor)
                .attr("stroke-width", 1);
        });

        // Create unique letter mapping
        letterMaps = {
            'Person': {},
            'Organization': {},
            'Vessel': {},
            'Group': {},
            'Location': {}
        };

        // Assign unique letters
        allEntities.forEach(entity => {
            const subType = entity.sub_type;
            if (letterMaps[subType]) {
                const usedLetters = new Set(Object.values(letterMaps[subType]));
                let letter = entity.id.charAt(0).toUpperCase();

                if (usedLetters.has(letter)) {
                    let charCode = 65;
                    while (usedLetters.has(String.fromCharCode(charCode))) {
                        charCode++;
                        if (charCode > 90) break;
                    }
                    letter = String.fromCharCode(charCode);
                }

                letterMaps[subType][entity.id] = letter;
            }
        });

        // Draw visualization
        function drawVisualization() {
            svg.selectAll(".marker-group").remove();

            let eventsToShow;
            if (selectedEntityIds.length > 0) {
                eventsToShow = allEvents.filter(event =>
                    selectedEntityIds.includes(event.entity_id) ||
                    event.target_entities.some(targetId => selectedEntityIds.includes(targetId))
                );
            } else {
                eventsToShow = allEvents;
            }

            // Calculate highlighting based on keywords/topics
            let maxFreq = 0;
            let termFreq = {};
            let currentTerm = "";

            // Priority: custom keyword > selected topic > selected keyword
            if (customKeyword) {
                currentTerm = customKeyword.toLowerCase();
                // Escape special regex characters
                const escapedTerm = currentTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\b${escapedTerm}\\b`, "g");

                // Calculate frequencies for events to show
                eventsToShow.forEach(event => {
                    const content = eventContentLookup[event.id].toLowerCase();
                    const matches = content.match(regex);
                    const freq = matches ? matches.length : 0;
                    termFreq[event.id] = freq;
                    if (freq > maxFreq) maxFreq = freq;
                });
            } else if (selectedTopicId !== null && topicsLoaded) {
                // Use topic weights for highlighting
                const selectedTopic = allTopics.find(t => t.id === selectedTopicId);
                console.log("Highlighting topic:", selectedTopicId, "method:", currentTopicMethod, "topic:", selectedTopic);
                
                if (selectedTopic) {
                    if (currentTopicMethod === "tfidf") {
                        // For TF-IDF, use term frequency highlighting based on keywords
                        const topicKeywords = selectedTopic.keywords;
                        console.log("TF-IDF keywords:", topicKeywords);
                        eventsToShow.forEach(event => {
                            const content = eventContentLookup[event.id].toLowerCase();
                            let totalFreq = 0;
                            
                            topicKeywords.forEach(keyword => {
                                const escapedTerm = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                const regex = new RegExp(`\\b${escapedTerm}\\b`, "gi");
                                const matches = content.match(regex);
                                if (matches) totalFreq += matches.length;
                            });
                            
                            termFreq[event.id] = totalFreq;
                            if (totalFreq > maxFreq) maxFreq = totalFreq;
                        });
                        console.log("TF-IDF maxFreq:", maxFreq, "sample frequencies:", Object.keys(termFreq).slice(0, 5).map(k => `${k}:${termFreq[k]}`));
                    } else {
                        // For BERTopic and LDA, use topic weights
                        eventsToShow.forEach(event => {
                            const topicData = eventTopicData[event.id];
                            if (topicData && topicData.topic_weights && topicData.topic_weights[selectedTopicId] !== undefined) {
                                const weight = topicData.topic_weights[selectedTopicId];
                                termFreq[event.id] = weight;
                                if (weight > maxFreq) maxFreq = weight;
                            } else {
                                termFreq[event.id] = 0;
                            }
                        });
                        console.log("Topic weights maxFreq:", maxFreq, "sample weights:", Object.keys(termFreq).slice(0, 5).map(k => `${k}:${termFreq[k]}`));
                    }
                }
            } else if (selectedKeywordId) {
                const keyword = allKeywords.find(kw => kw.id === selectedKeywordId);
                currentTerm = keyword ? keyword.term.toLowerCase() : "";
                
                if (currentTerm) {
                    const escapedTerm = currentTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`\\b${escapedTerm}\\b`, "g");

                    eventsToShow.forEach(event => {
                        const content = eventContentLookup[event.id].toLowerCase();
                        const matches = content.match(regex);
                        const freq = matches ? matches.length : 0;
                        termFreq[event.id] = freq;
                        if (freq > maxFreq) maxFreq = freq;
                    });
                }
            }

            const filteredEventsByDay = {};
            eventsToShow.forEach(event => {
                const day = event.day;
                if (!filteredEventsByDay[day]) filteredEventsByDay[day] = [];
                filteredEventsByDay[day].push(event);
            });

            days.forEach((day, i) => {
                const yPos = i * bandHeight + 60;

                svg.append("line")
                    .attr("x1", 20)
                    .attr("y1", yPos + bandHeight - 10)
                    .attr("x2", svgWidth - 20)
                    .attr("y2", yPos + bandHeight - 10)
                    .attr("stroke", daySeparatorColor)
                    .attr("stroke-width", 2);

                const yCenter = yPos + bandHeight / 2 - 15;
                svg.append("text")
                    .attr("class", "axis font-medium")
                    .attr("x", 20)
                    .attr("y", yCenter)
                    .attr("dy", "0.35em")
                    .attr("transform", `rotate(-90, 20, ${yCenter})`)
                    .attr("text-anchor", "middle")
                    .attr("fill", textColor)
                    .text(`Oct ${day}`);

                if (!filteredEventsByDay[day] || filteredEventsByDay[day].length === 0) return;

                const hourGroups = {};
                filteredEventsByDay[day].forEach(event => {
                    const hour = new Date(event.datetime).getHours();
                    if (!hourGroups[hour]) hourGroups[hour] = [];
                    hourGroups[hour].push(event);
                });

                Object.entries(hourGroups).forEach(([hour, hourEvents]) => {
                    const hourNum = Number(hour);
                    const xPos = xScale(hourNum);

                    const stacks = [];
                    let currentStack = [];
                    let currentHeight = 0;

                    hourEvents.forEach(event => {
                        if (currentHeight + markerSize_v + markerSpacing > maxStackHeight) {
                            stacks.push(currentStack);
                            currentStack = [];
                            currentHeight = 0;
                        }
                        currentStack.push(event);
                        currentHeight += markerSize_v + markerSpacing;
                    });
                    if (currentStack.length > 0) stacks.push(currentStack);

                    stacks.forEach((stack, stackIndex) => {
                        const stackXPos = 5 + xPos + stackIndex * (markerSize_h + markerSpacing);

                        stack.forEach((event, eventIndex) => {
                            const yPosInStack = yPos + eventIndex * (markerSize_v + markerSpacing);

                            // Calculate opacity based on keyword/topic frequency
                            let opacity = 1;
                            const isHighlighting = currentTerm || (selectedTopicId !== null && topicsLoaded);
                            
                            if (isHighlighting) {
                                const freq = termFreq[event.id] || 0;
                                if (maxFreq > 0) {
                                    // Scale opacity between 0.2 and 1.0 for better visibility
                                    opacity = 0.2 + 0.8 * (freq / maxFreq);
                                } else {
                                    // If no maxFreq but we're highlighting, make irrelevant events faint
                                    opacity = freq > 0 ? 1.0 : 0.1;
                                }
                                
                                // Debug logging for opacity calculation
                                if (event === stack[0]) { // Only log for first event in stack to avoid spam
                                    console.log(`Event ${event.id}: freq=${freq}, maxFreq=${maxFreq}, opacity=${opacity}`);
                                }
                            }

                            // Create group with clip path and mouse events
                            const markerGroup = svg.append("g")
                                .attr("class", "marker-group")
                                .attr("transform", `translate(${stackXPos},${yPosInStack})`)
                                .attr("clip-path", "url(#marker-clip)")
                                .style("opacity", opacity)
                                .on("mouseover", function (e) {
                                    // Show tooltip
                                    const source = event.entity_id;
                                    const targets = event.target_entities.join(', ');
                                    const message = event.content || 'No message content';

                                    tooltip.html(`
                                        <div><span class="font-medium">Source:</span> ${source}</div>
                                        <div><span class="font-medium">Target:</span> ${targets}</div>
                                        <div class="mt-2"><span class="font-medium">Message:</span> ${message}</div>
                                        <div class="mt-1 text-xs text-gray-500">${event.datetime}</div>
                                    `)
                                        .style("left", (e.pageX + 10) + "px")
                                        .style("top", (e.pageY + 10) + "px")
                                        .classed("hidden", false);

                                    // Highlight entire marker
                                    markerGroup.selectAll("rect")
                                        .attr("stroke", "#000")
                                        .attr("stroke-width", 1);

                                    // Increase opacity on hover
                                    d3.select(this).style("opacity", 1);
                                })
                                .on("mouseout", function () {
                                    tooltip.classed("hidden", true);
                                    markerGroup.selectAll("rect")
                                        .attr("stroke", null);

                                    // Restore original opacity
                                    const isHighlighting = currentTerm || (selectedTopicId !== null && topicsLoaded);
                                    if (isHighlighting) {
                                        const freq = termFreq[event.id] || 0;
                                        if (maxFreq > 0) {
                                            d3.select(this).style("opacity", 0.2 + 0.8 * (freq / maxFreq));
                                        } else {
                                            d3.select(this).style("opacity", freq > 0 ? 1.0 : 0.1);
                                        }
                                    } else {
                                        d3.select(this).style("opacity", 1);
                                    }
                                });

                            // Get entities and letters
                            const sourceEntity = entityLookup[event.entity_id];
                            const targetId = event.target_entities[0] || "";
                            const targetEntity = entityLookup[targetId];

                            const sourceLetter = sourceEntity ?
                                (letterMaps[sourceEntity.sub_type]?.[sourceEntity.id] ||
                                    sourceEntity.id.charAt(0).toUpperCase()) : "?";

                            const targetLetter = targetEntity ?
                                (letterMaps[targetEntity.sub_type]?.[targetEntity.id] ||
                                    targetEntity.id.charAt(0).toUpperCase()) : "?";

                            // Draw dual-color marker
                            markerGroup.append("rect")
                                .attr("width", markerSize_h / 2)
                                .attr("height", markerSize_v)
                                .attr("fill", sourceEntity ? colors[sourceEntity.sub_type] || "#777" : "#999");

                            markerGroup.append("rect")
                                .attr("x", markerSize_h / 2)
                                .attr("width", markerSize_h / 2)
                                .attr("height", markerSize_v)
                                .attr("fill", targetEntity ? colors[targetEntity.sub_type] || "#999" : "#bbb");

                            // Add letters
                            markerGroup.append("text")
                                .attr("x", markerSize_h / 4)
                                .attr("y", markerSize_v / 2)
                                .attr("dy", "0.35em")
                                .attr("text-anchor", "middle")
                                .attr("fill", "white")
                                .attr("font-weight", "bold")
                                .attr("font-size", "10px")
                                .text(sourceLetter);

                            markerGroup.append("text")
                                .attr("x", markerSize_h * 0.75)
                                .attr("y", markerSize_v / 2)
                                .attr("dy", "0.35em")
                                .attr("text-anchor", "middle")
                                .attr("fill", "white")
                                .attr("font-weight", "bold")
                                .attr("font-size", "10px")
                                .text(targetLetter);
                        });
                    });
                });
            });
        }

        drawVisualization();

        // Create legend
        const legendScrollContainer = legendContainer.append("div")
            .attr("class", "overflow-y-auto")
            .style("max-height", "400px");

        const legendItems = legendScrollContainer.selectAll(".legend-item")
            .data(allEntities)
            .enter()
            .append("div")
            .attr("class", "legend-item cursor-pointer p-2 rounded hover:bg-gray-100 flex items-center")
            .on("click", function (event, d) {
                const index = selectedEntityIds.indexOf(d.id);
                if (index > -1) {
                    selectedEntityIds.splice(index, 1);
                    d3.select(this).classed("bg-blue-100 border border-blue-300", false);
                } else {
                    selectedEntityIds.push(d.id);
                    d3.select(this).classed("bg-blue-100 border border-blue-300", true);
                }
                drawVisualization();
            });

        legendItems.append("div")
            .attr("class", "legend-color flex-shrink-0")
            .style("width", "16px")
            .style("height", "16px")
            .style("background-color", d => colors[d.sub_type] || "#777");

        legendItems.append("div")
            .attr("class", "ml-2")
            .html(d => {
                const letter = letterMaps[d.sub_type]?.[d.id] || d.id.charAt(0).toUpperCase();
                const count = commCount[d.id] || 0;
                return `
                    <div class="font-medium">${d.id}</div>
                    <div class="text-xs text-gray-600">
                        <span>(${letter})</span> 
                        <span class="ml-2">${count} comms</span>
                    </div>
                `;
            });

        legendContainer.append("div")
            .attr("class", "text-xs text-gray-500 mt-2")
            .html("Click on entities to filter communications");

        legendContainer.append("button")
            .attr("class", "mt-2 px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm")
            .text("Reset Filter")
            .on("click", function () {
                selectedEntityIds = [];
                d3.selectAll(".legend-item")
                    .classed("bg-blue-100 border border-blue-300", false);
                drawVisualization();
            });

        // Add topic modeling section
        createTopicModelingSection();
        
        // Auto-load topics after visualization is ready
        loadTopicData();

        // Function to load topic data (defined first so it can be referenced)
        function loadTopicData() {
            const isAuto = d3.select("#topic-auto").property("checked");
            const topicCount = isAuto ? "auto" : d3.select("input[type='range']").property("value");
            
            const params = new URLSearchParams({
                include_topics: "true",
                method: currentTopicMethod,
                num_topics: topicCount
            });

            // Show loading status
            d3.select(".loading-status").style("display", "block");
            d3.select(".topics-list-container").style("display", "none");

            d3.json(`/data/daily_patterns?${params}`).then(data => {
                if (data.error) {
                    console.error("Error loading topic data:", data.error);
                    return;
                }

                allTopics = data.topics || [];
                
                // Create event topic data lookup
                eventTopicData = {};
                if (data.event_topic_data) {
                    data.event_topic_data.forEach(item => {
                        eventTopicData[item.event_id] = item;
                    });
                }

                // Clear any previous topic selection when new topics load
                selectedTopicId = null;
                selectedKeywordId = null;
                customKeyword = "";
                d3.select("input[type='text']").property("value", "");

                topicsLoaded = true;
                updateTopicsList();
                
                // Redraw visualization to clear any highlighting
                drawVisualization();
                
                // Hide loading status and show topics list
                d3.select(".loading-status").style("display", "none");
                d3.select(".topics-list-container").style("display", "block");
                
            }).catch(error => {
                console.error("Error loading topic data:", error);
                // Hide loading status on error
                d3.select(".loading-status").style("display", "none");
            });
        }

        // Function to update topics list
        function updateTopicsList() {
            const topicsList = d3.select(".topics-list");
            topicsList.selectAll("*").remove();

            allTopics.forEach(topic => {
                const topicDiv = topicsList.append("div")
                    .attr("class", `topic-item px-2 py-1 rounded cursor-pointer text-xs transition-all ${
                        selectedTopicId === topic.id 
                            ? "bg-indigo-100 border border-indigo-500 text-indigo-800 font-medium"
                            : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                    }`)
                    .on("click", function() {
                        const previousTopicId = selectedTopicId;
                        selectedTopicId = selectedTopicId === topic.id ? null : topic.id;
                        selectedKeywordId = null;
                        customKeyword = "";
                        d3.select("input[type='text']").property("value", "");
                        
                        console.log(`Topic clicked: ${topic.id}, previous: ${previousTopicId}, new: ${selectedTopicId}`);
                        console.log("topicsLoaded:", topicsLoaded, "eventTopicData keys:", Object.keys(eventTopicData).length);
                        
                        drawVisualization();
                        updateTopicSelection();
                    });

                topicDiv.append("div")
                    .attr("class", "font-medium")
                    .text(`Topic ${topic.id}`);

                topicDiv.append("div")
                    .attr("class", "text-xs text-gray-600")
                    .text(topic.keywords.slice(0, 4).join(", "));
            });
        }

        // Function to update topic selection UI
        function updateTopicSelection() {
            d3.selectAll(".topic-item")
                .classed("bg-indigo-100 border border-indigo-500 text-indigo-800 font-medium", false)
                .classed("bg-gray-100 text-gray-700", true);

            if (selectedTopicId !== null) {
                d3.selectAll(".topic-item")
                    .filter((d, i) => allTopics[i] && allTopics[i].id === selectedTopicId)
                    .classed("bg-indigo-100 border border-indigo-500 text-indigo-800 font-medium", true)
                    .classed("bg-gray-100 text-gray-700", false);
            }
        }

        // Function to create topic modeling controls
        function createTopicModelingSection() {
            const topicContainer = legendContainer.append("div")
                .attr("class", "mt-6 pt-4 border-t border-gray-200");

            topicContainer.append("div")
                .attr("class", "font-medium text-sm mb-2")
                .text("Topic Analysis");

        // Topic method selector
        const methodGroup = topicContainer.append("div")
            .attr("class", "mb-3");

        methodGroup.append("label")
            .attr("class", "block text-xs font-medium text-gray-700 mb-1")
            .text("Topic Method:");

        const methodSelect = methodGroup.append("select")
            .attr("class", "w-full px-2 py-1 border border-gray-300 rounded text-xs")
            .on("change", function() {
                currentTopicMethod = this.value;
                loadTopicData();
            });

        methodSelect.append("option").attr("value", "bertopic").text("BERTopic");
        methodSelect.append("option").attr("value", "lda?vectorizer=tfidf").text("LDA (TF-IDF)");
        methodSelect.append("option").attr("value", "lda?vectorizer=bow").text("LDA (BOW)");
        methodSelect.append("option").attr("value", "tfidf").text("TF-IDF");

        // Topic count controls
        const countGroup = topicContainer.append("div")
            .attr("class", "mb-3");

        countGroup.append("label")
            .attr("class", "block text-xs font-medium text-gray-700 mb-1")
            .text("Topic Count:");

        const countContainer = countGroup.append("div")
            .attr("class", "flex items-center gap-2");

        const autoCheckbox = countContainer.append("input")
            .attr("type", "checkbox")
            .attr("id", "topic-auto")
            .attr("checked", true)
            .on("change", function() {
                countSlider.property("disabled", this.checked);
                loadTopicData();
            });

        countContainer.append("label")
            .attr("for", "topic-auto")
            .attr("class", "text-xs")
            .text("Auto");

        const sliderContainer = countGroup.append("div")
            .attr("class", "mt-1");

        const countSlider = sliderContainer.append("input")
            .attr("type", "range")
            .attr("min", "5")
            .attr("max", "20")
            .attr("value", "10")
            .attr("disabled", true)
            .attr("class", "w-full")
            .on("input", function() {
                countDisplay.text(this.value);
            })
            .on("change", function() {
                loadTopicData();
            });

        const countDisplay = sliderContainer.append("div")
            .attr("class", "text-xs text-center text-gray-600 mt-1")
            .text("10");

        sliderContainer.append("div")
            .attr("class", "flex justify-between text-xs text-gray-500")
            .html("<span>5</span><span>20</span>");

        // Loading status indicator
        const loadingStatus = topicContainer.append("div")
            .attr("class", "w-full px-3 py-2 text-center text-sm mb-3 loading-status")
            .style("display", "none")
            .text("Loading topics...");

        // Topics list container
        const topicsListContainer = topicContainer.append("div")
            .attr("class", "topics-list-container")
            .style("display", "none");

        topicsListContainer.append("div")
            .attr("class", "text-xs text-gray-500 mb-2")
            .html("Click topics to highlight communications by relevance:");

        const topicsList = topicsListContainer.append("div")
            .attr("class", "topics-list space-y-1");

        // Custom keyword section (keeping this for backward compatibility)
        const keywordGroup = topicContainer.append("div")
            .attr("class", "mt-4 pt-3 border-t border-gray-200");

        keywordGroup.append("div")
            .attr("class", "text-xs font-medium text-gray-700 mb-2")
            .text("Custom Expression:");

        const inputGroup = keywordGroup.append("div")
            .attr("class", "flex gap-2");

        const customInput = inputGroup.append("input")
            .attr("type", "text")
            .attr("placeholder", "Type expression...")
            .attr("class", "flex-1 px-2 py-1 border border-gray-300 rounded text-xs")
            .on("keypress", function(event) {
                if (event.key === "Enter") {
                    customKeyword = this.value.trim();
                    selectedTopicId = null;
                    selectedKeywordId = null;
                    drawVisualization();
                    updateTopicSelection();
                }
            });

        inputGroup.append("button")
            .attr("class", "px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600")
            .text("Apply")
            .on("click", function() {
                customKeyword = customInput.property("value").trim();
                selectedTopicId = null;
                selectedKeywordId = null;
                drawVisualization();
                updateTopicSelection();
            });

        // Reset button
        topicContainer.append("button")
            .attr("class", "mt-2 px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs w-full")
            .text("Reset Highlighting")
            .on("click", function() {
                selectedTopicId = null;
                selectedKeywordId = null;
                customKeyword = "";
                customInput.property("value", "");
                drawVisualization();
                updateTopicSelection();
            });
        }

    }).catch(error => {
        console.error("Error loading daily patterns data:", error);
    });
}

window.init_daily_patterns = init_daily_patterns;