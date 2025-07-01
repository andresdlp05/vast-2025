// Global variables to store data and filters
let allEvents = [];
let filteredEvents = [];
let filterOptions = {};
let currentFilters = {
    eventTypes: [],
    sourceTypes: [],
    targetTypes: [],
    sourceEntities: [],
    targetEntities: [],
    dates: []  // Added date filter
};

// Pagination variables
const PAGE_SIZE = 10;
let currentPage = 1;
let totalPages = 1;

function init_time_patterns() {
    // Clear previous visualizations
    d3.select("#hourly-chart").html("");
    d3.select("#heatmap").html("");
    d3.select("#legend").html("");
    d3.select("#event-table tbody").html("");

    // Show loading state
    d3.select("#hourly-chart").html('<div class="visualization-loading">Loading data...</div>');
    d3.select("#heatmap").html('<div class="visualization-loading">Loading data...</div>');

    // Fetch data from Flask endpoint
    d3.json("/data/time_patterns").then(data => {
        if (data.error) {
            showError(data.error);
            return;
        }

        allEvents = data.events;
        filterOptions = data.filter_options || {};

        // Initialize filter controls
        initFilters();

        // Apply initial filters
        applyFilters();

    }).catch(error => {
        showError(`Failed to load data: ${error.message}`);
    });
}

function showError(message) {
    d3.select("#hourly-chart").html(`<div class="text-red-600 p-4">${message}</div>`);
    d3.select("#heatmap").html(`<div class="text-red-600 p-4">${message}</div>`);
}

function initFilters() {
    // Populate event type filter
    populateSelect('#event-type-filter', filterOptions.event_types || []);

    // Populate source type filter
    populateSelect('#source-type-filter', filterOptions.source_types || []);

    // Populate target type filter
    populateSelect('#target-type-filter', filterOptions.target_types || []);

    // Populate source entity filter
    populateSelect('#source-entity-filter', filterOptions.source_entities || []);

    // Populate target entity filter
    populateSelect('#target-entity-filter', filterOptions.target_entities || []);

    // Populate date filter (newly added)
    if (filterOptions.dates) {
        // Sort dates chronologically
        const sortedDates = [...filterOptions.dates].sort((a, b) => {
            return new Date(a) - new Date(b);
        });
        populateSelect('#date-filter', sortedDates);
    }

    // Add event listeners
    document.getElementById('apply-filters').addEventListener('click', () => {
        // Show loading state
        d3.select("#hourly-chart").html('<div class="visualization-loading">Applying filters...</div>');
        d3.select("#heatmap").html('<div class="visualization-loading">Applying filters...</div>');
        setTimeout(applyFilters, 50);
    });

    // Add clear filter button listeners
    document.querySelectorAll('.clear-filter').forEach(button => {
        button.addEventListener('click', (e) => {
            const filterType = e.target.closest('.clear-filter').dataset.filter;
            clearSingleFilter(filterType);
        });
    });
}

function populateSelect(selector, options) {
    const select = d3.select(selector);
    select.html("");

    options.forEach(option => {
        select.append('option')
            .attr('value', option)
            .text(option);
    });
}

function clearSingleFilter(filterType) {
    const filterMap = {
        'event-type': '#event-type-filter',
        'source-type': '#source-type-filter',
        'target-type': '#target-type-filter',
        'source-entity': '#source-entity-filter',
        'target-entity': '#target-entity-filter',
        'date': '#date-filter'  // Added date filter
    };

    const selector = filterMap[filterType];
    if (selector) {
        d3.select(selector).node().selectedIndex = -1;
        applyFilters();
    }
}

function applyFilters() {
    // Get current filter selections
    currentFilters = {
        eventTypes: getSelectedValues('#event-type-filter'),
        sourceTypes: getSelectedValues('#source-type-filter'),
        targetTypes: getSelectedValues('#target-type-filter'),
        sourceEntities: getSelectedValues('#source-entity-filter'),
        targetEntities: getSelectedValues('#target-entity-filter'),
        dates: getSelectedValues('#date-filter')  // Added date filter
    };

    // Apply filters to events
    filteredEvents = allEvents.filter(event => {
        // Event type filter
        if (currentFilters.eventTypes.length > 0 &&
            !currentFilters.eventTypes.includes(event.sub_type)) {
            return false;
        }

        // Source type filter
        if (currentFilters.sourceTypes.length > 0) {
            const sourceTypes = event.sources.map(s => s.sub_type);
            if (!currentFilters.sourceTypes.some(t => sourceTypes.includes(t))) {
                return false;
            }
        }

        // Target type filter
        if (currentFilters.targetTypes.length > 0) {
            const targetTypes = event.targets.map(t => t.sub_type);
            if (!currentFilters.targetTypes.some(t => targetTypes.includes(t))) {
                return false;
            }
        }

        // Source entity filter
        if (currentFilters.sourceEntities.length > 0) {
            const sourceNames = event.sources.map(s => s.name);
            if (!currentFilters.sourceEntities.some(e => sourceNames.includes(e))) {
                return false;
            }
        }

        // Target entity filter
        if (currentFilters.targetEntities.length > 0) {
            const targetNames = event.targets.map(t => t.name);
            if (!currentFilters.targetEntities.some(e => targetNames.includes(e))) {
                return false;
            }
        }

        // Date filter (newly added)
        if (currentFilters.dates.length > 0 &&
            !currentFilters.dates.includes(event.date)) {
            return false;
        }

        return true;
    });

    // Update event count
    document.getElementById('event-count').textContent = filteredEvents.length;

    // Reset to first page when filters change
    currentPage = 1;

    // Recreate visualizations with filtered data
    createVisualizations();
}

function getSelectedValues(selector) {
    const options = d3.select(selector).node().selectedOptions;
    return Array.from(options).map(opt => opt.value);
}

function createVisualizations() {
    // Calculate aggregated data for visualizations
    const hourlyCounts = calculateHourlyCounts(filteredEvents);
    const typeCounts = calculateTypeCounts(filteredEvents);

    // Create visualizations
    createHourlyChart(hourlyCounts);
    createHeatmap(typeCounts);
    updatePagination();
    populateEventTable();
}

function calculateHourlyCounts(events) {
    const counts = Array(24).fill(0);

    events.forEach(event => {
        if (event.hour >= 0 && event.hour < 24) {
            counts[event.hour]++;
        }
    });

    // Convert to object format
    const countsObj = {};
    counts.forEach((count, hour) => {
        countsObj[hour] = count;
    });

    return countsObj;
}

function calculateTypeCounts(events) {
    const typeCounts = {};

    // Get all event types present in filtered data
    const eventTypes = [...new Set(events.map(e => e.sub_type))];

    // Initialize with zeros for all hours
    eventTypes.forEach(type => {
        typeCounts[type] = Array(24).fill(0);
    });

    // Count events
    events.forEach(event => {
        const type = event.sub_type;
        const hour = event.hour;

        if (typeCounts[type] && hour >= 0 && hour < 24) {
            typeCounts[type][hour]++;
        }
    });

    // Convert arrays to objects
    const result = {};
    for (const type in typeCounts) {
        result[type] = {};
        typeCounts[type].forEach((count, hour) => {
            result[type][hour] = count;
        });
    }

    return result;
}

function createHourlyChart(hourlyCounts) {
    const width = 500;
    const height = 300;
    const margin = { top: 20, right: 20, bottom: 40, left: 40 };

    // Clear previous content
    const container = d3.select("#hourly-chart");
    container.html("");

    // Check if we have data to show
    const totalEvents = Object.values(hourlyCounts).reduce((a, b) => a + b, 0);
    if (totalEvents === 0) {
        container.html('<p class="text-gray-500 text-center py-4">No events match the current filters</p>');
        return;
    }

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height);

    // Convert data to array
    const data = Object.entries(hourlyCounts).map(([hour, count]) => ({
        hour: parseInt(hour),
        count
    }));

    // Scales
    const x = d3.scaleBand()
        .domain(data.map(d => d.hour))
        .range([margin.left, width - margin.right])
        .padding(0.1);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count)])
        .nice()
        .range([height - margin.bottom, margin.top]);

    // Bars
    const bars = svg.selectAll("rect")
        .data(data)
        .join("rect")
        .attr("x", d => x(d.hour))
        .attr("y", d => y(d.count))
        .attr("width", x.bandwidth())
        .attr("height", d => y(0) - y(d.count))
        .attr("fill", "#3b82f6")
        .attr("rx", 3)
        .attr("ry", 3);

    // Add tooltips with event counts
    bars.append("title")
        .text(d => `${d.count} events at ${d.hour}:00`);

    // Axes
    const xAxis = g => g
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).tickValues(d3.range(0, 24, 3)));

    const yAxis = g => g
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y));

    svg.append("g").call(xAxis);
    svg.append("g").call(yAxis);

    // Labels
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height - 5)
        .attr("text-anchor", "middle")
        .text("Hour of Day");

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", 15)
        .attr("text-anchor", "middle")
        .text("Number of Events");
}

function createHeatmap(typeCounts) {
    const width = 500;
    const height = 300;
    const margin = { top: 40, right: 20, bottom: 60, left: 100 };

    // Clear previous content
    const container = d3.select("#heatmap");
    container.html("");

    // Check if we have data to show
    let totalEvents = 0;
    for (const type in typeCounts) {
        totalEvents += Object.values(typeCounts[type]).reduce((a, b) => a + b, 0);
    }

    if (totalEvents === 0) {
        container.html('<p class="text-gray-500 text-center py-4">No events match the current filters</p>');
        return;
    }

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height);

    // Prepare data
    const eventTypes = Object.keys(typeCounts);
    const hours = d3.range(24);

    // Find max count for color scaling
    let maxCount = 0;
    for (const type in typeCounts) {
        for (const hour in typeCounts[type]) {
            if (typeCounts[type][hour] > maxCount) {
                maxCount = typeCounts[type][hour];
            }
        }
    }

    // Color scale
    const color = d3.scaleSequential(d3.interpolateBlues)
        .domain([0, maxCount]);

    // Scales
    const x = d3.scaleBand()
        .domain(hours)
        .range([margin.left, width - margin.right])
        .padding(0.05);

    const y = d3.scaleBand()
        .domain(eventTypes)
        .range([margin.top, height - margin.bottom])
        .padding(0.05);

    // Create heatmap cells
    const cells = svg.selectAll()
        .data(eventTypes.flatMap(type =>
            hours.map(hour => ({
                type,
                hour,
                count: typeCounts[type][hour] || 0
            }))
        ))
        .join("rect")
        .attr("x", d => x(d.hour))
        .attr("y", d => y(d.type))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .attr("fill", d => d.count > 0 ? color(d.count) : "#f9fafb")
        .attr("stroke", "#e5e7eb")
        .attr("stroke-width", 0.5);

    // Add tooltips with event counts
    cells.append("title")
        .text(d => `${d.count} ${d.type} events at ${d.hour}:00`);

    // Axes
    const xAxis = g => g
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).tickValues(d3.range(0, 24, 3)));

    const yAxis = g => g
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y));

    svg.append("g").call(xAxis);
    svg.append("g").call(yAxis);

    // Labels
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height - 10)
        .attr("text-anchor", "middle")
        .text("Hour of Day");

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", margin.left - 60)
        .attr("x", -height / 2)
        .attr("text-anchor", "middle")
        .text("Event Type");

    // Legend
    const legendContainer = d3.select("#legend");
    legendContainer.html("");

    const legendWidth = 200;
    const legendHeight = 20;

    const legendSvg = legendContainer.append("svg")
        .attr("width", legendWidth)
        .attr("height", 40);

    const legendScale = d3.scaleLinear()
        .domain([0, maxCount])
        .range([0, legendWidth]);

    const legendAxis = d3.axisBottom(legendScale)
        .ticks(5)
        .tickSize(10);

    legendSvg.append("g")
        .attr("transform", "translate(0,20)")
        .call(legendAxis);

    const gradient = legendSvg.append("defs")
        .append("linearGradient")
        .attr("id", "legend-gradient")
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "100%")
        .attr("y2", "0%");

    gradient.selectAll("stop")
        .data(d3.range(0, 1.01, 0.1))
        .enter()
        .append("stop")
        .attr("offset", d => `${d * 100}%`)
        .attr("stop-color", d => d3.interpolateBlues(d));

    legendSvg.append("rect")
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .attr("fill", "url(#legend-gradient)");
}

function updatePagination() {
    // Calculate total pages
    totalPages = Math.ceil(filteredEvents.length / PAGE_SIZE);

    // Update page info
    document.getElementById('total-events').textContent = filteredEvents.length;

    // Clear page buttons
    const pageButtons = document.getElementById('page-buttons');
    pageButtons.innerHTML = '';

    // Calculate range of pages to show (max 5 pages)
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);

    // Adjust if we're at the beginning
    if (endPage - startPage < 4 && startPage > 1) {
        startPage = Math.max(1, endPage - 4);
    }

    // Create page buttons
    for (let i = startPage; i <= endPage; i++) {
        const button = document.createElement('button');
        button.className = `px-3 py-1 border rounded-md ${i === currentPage ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`;
        button.textContent = i;
        button.addEventListener('click', () => {
            currentPage = i;
            populateEventTable();
        });
        pageButtons.appendChild(button);
    }

    // Update start/end indicators
    const startIdx = (currentPage - 1) * PAGE_SIZE + 1;
    const endIdx = Math.min(currentPage * PAGE_SIZE, filteredEvents.length);
    document.getElementById('page-start').textContent = startIdx;
    document.getElementById('page-end').textContent = endIdx;

    // Enable/disable navigation buttons
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = currentPage === totalPages;
}

function populateEventTable() {
    const table = d3.select("#event-table tbody");
    table.html("");

    // Sort events by date and time
    const sortedEvents = [...filteredEvents].sort((a, b) => {
        // Use fallback values if properties are missing
        const aDate = a.date || '1970-01-01';
        const bDate = b.date || '1970-01-01';
        const aTime = a.time || '00:00:00';
        const bTime = b.time || '00:00:00';

        // Combine date and time for comparison
        const aDateTime = new Date(`${aDate}T${aTime}`);
        const bDateTime = new Date(`${bDate}T${bTime}`);

        return aDateTime - bDateTime;
    });

    // Get events for current page
    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, filteredEvents.length);
    const pageEvents = sortedEvents.slice(startIdx, endIdx);

    const rows = table.selectAll("tr")
        .data(pageEvents)
        .enter()
        .append("tr")
        .attr("class", "hover:bg-blue-50 cursor-pointer")
        .attr("data-event", d => JSON.stringify(d))
        .on("click", function (event, d) {
            showNodeDetails(d);
        });

    // Date & Time (with day of week)
    rows.append("td")
        .attr("class", "px-3 py-2")
        .text(d => d.full_timestamp);

    // Event Type
    rows.append("td")
        .attr("class", "px-3 py-2")
        .text(d => d.sub_type);

    // Evidence
    rows.append("td")
        .attr("class", "px-3 py-2")
        .html(d => {
            if (d.evidence.length > 0) {
                return d.evidence.map(e =>
                    `<div class="text-xs bg-purple-100 rounded px-2 py-1 mb-1">
                        ${e.source_sub_type} (${e.source_type})
                    </div>`
                ).join('');
            }
            return '<span class="text-gray-400">None</span>';
        });

    // Event Text (truncated)
    rows.append("td")
        .attr("class", "px-3 py-2 max-w-xs truncate")
        .text(d => d.text || '');

    // Sources
    rows.append("td")
        .attr("class", "px-3 py-2")
        .html(d => d.sources.map(s =>
            `<div class="text-xs bg-blue-100 rounded px-2 py-1 mb-1">${s.name} (${s.sub_type})</div>`
        ).join(''));

    // Targets
    rows.append("td")
        .attr("class", "px-3 py-2")
        .html(d => d.targets.map(t =>
            `<div class="text-xs bg-green-100 rounded px-2 py-1 mb-1">${t.name} (${t.sub_type})</div>`
        ).join(''));

    // Add pagination event listeners
    document.getElementById('prev-page').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            populateEventTable();
            updatePagination();
        }
    });

    document.getElementById('next-page').addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            populateEventTable();
            updatePagination();
        }
    });

    // Add modal close listener
    document.getElementById('close-modal').addEventListener('click', () => {
        document.getElementById('node-details-modal').classList.add('hidden');
    });

    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        const modal = document.getElementById('node-details-modal');
        if (event.target === modal) {
            modal.classList.add('hidden');
        }
    });

    // Update pagination controls
    updatePagination();
}

function showNodeDetails(event) {
    const modal = document.getElementById('node-details-modal');
    const content = document.getElementById('node-details-content');

    // Create HTML for event details
    let html = `<div class="mb-6">
        <h4 class="font-bold text-lg mb-2">Event Details</h4>
        <pre class="bg-white p-3 rounded border">${JSON.stringify(event.raw, null, 2)}</pre>
    </div>`;

    // Create HTML for sources
    if (event.sources.length > 0) {
        html += `<div class="mb-6">
            <h4 class="font-bold text-lg mb-2">Source Entities</h4>`;

        event.sources.forEach(source => {
            html += `<div class="mb-4">
                <h5 class="font-semibold mb-1">${source.name} (${source.sub_type})</h5>
                <div class="mb-2">
                    <span class="font-medium">Edge Data:</span>
                    <pre class="bg-white p-3 rounded border">${JSON.stringify(source.edge, null, 2)}</pre>
                </div>
                <div>
                    <span class="font-medium">Node Data:</span>
                    <pre class="bg-white p-3 rounded border">${JSON.stringify(source.raw, null, 2)}</pre>
                </div>
            </div>`;
        });

        html += `</div>`;
    }

    // Create HTML for targets
    if (event.targets.length > 0) {
        html += `<div class="mb-6">
            <h4 class="font-bold text-lg mb-2">Target Entities</h4>`;

        event.targets.forEach(target => {
            html += `<div class="mb-4">
                <h5 class="font-semibold mb-1">${target.name} (${target.sub_type})</h5>
                <div class="mb-2">
                    <span class="font-medium">Edge Data:</span>
                    <pre class="bg-white p-3 rounded border">${JSON.stringify(target.edge, null, 2)}</pre>
                </div>
                <div>
                    <span class="font-medium">Node Data:</span>
                    <pre class="bg-white p-3 rounded border">${JSON.stringify(target.raw, null, 2)}</pre>
                </div>
            </div>`;
        });

        html += `</div>`;
    }

    // Create HTML for evidence
    if (event.evidence.length > 0) {
        html += `<div class="mb-6">
            <h4 class="font-bold text-lg mb-2">Evidence</h4>`;

        event.evidence.forEach(evidence => {
            html += `<div class="mb-4">
                <h5 class="font-semibold mb-1">${evidence.source_sub_type} (${evidence.source_type})</h5>
                <div class="mb-2">
                    <span class="font-medium">Edge Data:</span>
                    <pre class="bg-white p-3 rounded border">${JSON.stringify(evidence.edge, null, 2)}</pre>
                </div>
                <div>
                    <span class="font-medium">Node Data:</span>
                    <pre class="bg-white p-3 rounded border">${JSON.stringify(evidence.raw, null, 2)}</pre>
                </div>
            </div>`;
        });

        html += `</div>`;
    }

    content.innerHTML = html;
    modal.classList.remove('hidden');
}

// Export the init function for external access
window.init_time_patterns = init_time_patterns;