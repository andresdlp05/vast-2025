// app/static/js/nadia_analysis.js

function init_nadia_analysis() {
  console.log("🚀 Initializing Nadia Conti analysis…");
  let analysisData = null;

  // 1) Prepara el switch de pestañas
  initTabSwitching();

  // 2) Carga los datos desde el endpoint de Flask
  d3.json("/data/nadia_analysis")
    .then(data => {
      if (data.error) {
        showError(data.error);
        return;
      }
      analysisData = data;
      console.log("✅ Nadia analysis data loaded:", data);

      // 3) Inicializa todas las visualizaciones
      updateExecutiveSummary(data);
      updateTimelineTab(data);
      updateNetworkTab(data);
      updatePatternsTab(data);
      updateEvidenceTab(data);
      updateConclusion(data);
    })
    .catch(error => {
      console.error("❌ Error loading Nadia analysis data:", error);
      showError(`Failed to load data: ${error.message}`);
    });

  // —————————————————————————————————————————
  // Helper: Mostrar errores
  function showError(message) {
    d3.select("#executive-summary").html(`
      <h3 class="text-red-600">Error</h3>
      <p>${message}</p>
    `);
  }

  // —————————————————————————————————————————
  // 1) Función de tab‐switching
  function initTabSwitching() {
    console.log("🔀 Initializing tab switching…");

    // Limpia listeners previos y añade los nuevos
    d3.selectAll(".analysis-tab").on("click", null);
    d3.selectAll(".analysis-tab").on("click", function(event) {
      event.preventDefault();
      // No redibujar sin datos
      if (!analysisData) {
        console.warn("Data not loaded yet, please wait…");
        return;
      }

      const tabKey = d3.select(this).attr("data-tab");
      if (!tabKey) return;

      // 1a) Actualiza estilos de pestañas
      d3.selectAll(".analysis-tab")
        .classed("active", false)
        .classed("border-blue-500 text-blue-600", false)
        .classed("border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300", true);

      d3.select(this)
        .classed("active", true)
        .classed("border-blue-500 text-blue-600", true)
        .classed("border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300", false);

      // 1b) Oculta todas las secciones y muestra la correcta
      d3.selectAll(".tab-content").classed("hidden", true);
      const target = d3.select(`#${tabKey}-tab`);
      if (target.empty()) {
        console.error(`Target tab not found: #${tabKey}-tab`);
        return;
      }
      target.classed("hidden", false);

      // 1c) Redibuja sólo la pestaña activa
      switch(tabKey) {
        case "timeline": updateTimelineTab(analysisData);  break;
        case "network":  updateNetworkTab(analysisData);   break;
        case "patterns": updatePatternsTab(analysisData);  break;
        case "evidence": updateEvidenceTab(analysisData);  break;
        default: break;
      }
    });

    console.log("✅ Tab switching initialized");
  }

  // —————————————————————————————————————————
  // 2) Executive summary
  function updateExecutiveSummary(data) {
    const profile    = data.nadia_profile || {};
    const suspicion  = data.suspicion_analysis || {};

    d3.select("#total-communications").text(profile.total_communications || 0);
    d3.select("#suspicion-score").text(suspicion.overall_score || 0);
    d3.select("#risk-level").text(suspicion.recommendation || "Unknown");

    // Color‐code recommendation
    const rec = (suspicion.recommendation || "Unknown").toUpperCase();
    const recEl = d3.select("#recommendation");
    recEl.text(`Recommendation: ${rec}`);
    if (rec === "INVESTIGATE FURTHER") {
      recEl.attr("class","mt-4 p-3 rounded-lg font-medium bg-red-100 text-red-800");
    } else if (rec === "MONITOR") {
      recEl.attr("class","mt-4 p-3 rounded-lg font-medium bg-yellow-100 text-yellow-800");
    } else {
      recEl.attr("class","mt-4 p-3 rounded-lg font-medium bg-green-100 text-green-800");
    }
  }

  // —————————————————————————————————————————
  // 3) Communication Timeline
  function updateTimelineTab(data) {
    console.log("📅 Updating timeline tab…");
    if (data.communication_patterns?.hourly_distribution) {
      createHourlyChart(data.communication_patterns.hourly_distribution);
    }
    if (data.timeline) {
      createTimelineEvents(data.timeline);
    }
  }
  function createHourlyChart(hourlyData) {
    const c = d3.select("#hourly-chart").html("");
    if (!Array.isArray(hourlyData)) {
      c.html("<p>No hourly data available</p>"); return;
    }
    const width = 400, height = 200, margin = {top:20,right:20,bottom:40,left:40};
    const svg = c.append("svg").attr("width",width).attr("height",height);
    const arr = hourlyData.map((cnt,h)=>({hour:h,count:cnt}));
    const x = d3.scaleBand().domain(d3.range(24)).range([margin.left,width-margin.right]).padding(0.1);
    const y = d3.scaleLinear().domain([0,d3.max(arr,d=>d.count)]).nice().range([height-margin.bottom,margin.top]);
    svg.selectAll("rect")
      .data(arr).join("rect")
        .attr("x",d=>x(d.hour)).attr("y",d=>y(d.count))
        .attr("width",x.bandwidth()).attr("height",d=>y(0)-y(d.count))
        .attr("fill", d => (d.hour>=23||d.hour<=4) ? "#ef4444" : (d.hour<=7? "#f59e0b" : "#3b82f6"))
        .attr("rx",2)
      .append("title").text(d=>`${d.count} msgs at ${d.hour}:00`);
    svg.append("g").attr("transform",`translate(0,${height-margin.bottom})`)
      .call(d3.axisBottom(x).tickValues([0,6,12,18]).tickFormat(d=>`${d}:00`));
    svg.append("g").attr("transform",`translate(${margin.left},0)`)
      .call(d3.axisLeft(y));
    svg.append("text")
      .attr("x",width/2).attr("y",height-5)
      .attr("text-anchor","middle")
      .style("font-size","12px")
      .text("Hour of Day");
  }
  function createTimelineEvents(timelineData) {
    const c = d3.select("#timeline-events").html("");
    if (!Array.isArray(timelineData)) {
      c.html("<p>No timeline data</p>"); return;
    }
    c.selectAll(".timeline-event")
      .data(timelineData.slice(0,20)).join("div")
        .attr("class","timeline-event p-3 border rounded-lg cursor-pointer hover:bg-gray-50")
        .style("border-color", d => 
           d.event_type==="suspicious"   ? "#ef4444" :
           d.event_type==="permit_related"? "#f59e0b" :
                                            "#e5e7eb")
        .on("click", (_,d)=> showMessageModal(d))
      .each(function(d){
        const ev = d3.select(this);
        ev.append("div").attr("class","flex justify-between mb-2")
          .html(`<strong>${d.datetime||'?'}</strong> <em>${d.event_type||''}</em>`);
        ev.append("div").attr("class","text-sm text-gray-600 mb-1")
          .text(`${d.is_sender ? 'To' : 'From'}: ${d.other_party||'Unknown'}`);
        ev.append("div").attr("class","text-xs text-gray-500")
          .text(d.content_preview||'–');
      });
  }

  // —————————————————————————————————————————
  // 4) Network Analysis
  function updateNetworkTab(data) {
    console.log("🔗 Updating network tab…");
    if (data.network_data) {
      createNetworkGraph(data.network_data);
    }
    if (data.nadia_profile?.top_contacts) {
      createContactsList(data.nadia_profile.top_contacts);
    }
  }
  function createNetworkGraph({nodes,links}) {
    const c = d3.select("#network-graph").html("");
    if (!nodes||!links) {
      c.html("<p>No network data</p>"); return;
    }
    const width=500,height=350;
    const svg = c.append("svg")
      .attr("width",width).attr("height",height)
      .attr("viewBox",[0,0,width,height]);
    const sim = d3.forceSimulation(nodes)
      .force("link",d3.forceLink(links).id(d=>d.id).distance(100))
      .force("charge",d3.forceManyBody().strength(-300))
      .force("center",d3.forceCenter(width/2,height/2));
    const link = svg.append("g").selectAll("line")
      .data(links).join("line")
        .attr("class","network-link")
        .attr("stroke","#999")
        .attr("stroke-width",d=>Math.sqrt(d.weight||1));
    const node = svg.append("g").selectAll("circle")
      .data(nodes).join("circle")
        .attr("class","network-node")
        .attr("r",d=> d.category==="central"?15:Math.max(5,Math.sqrt((d.communication_count||1)*2)))
        .attr("fill",d=> d.category==="central"? "#dc2626" :
                        d.type==="Person"? "#3b82f6" :
                        d.type==="Organization"? "#059669" :
                        d.type==="Vessel"? "#d97706" :
                                           "#6b7280")
        .attr("stroke","#fff").attr("stroke-width",2)
        .call(d3.drag()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended));
    const label = svg.append("g").selectAll("text")
      .data(nodes).join("text")
        .attr("class","network-label")
        .text(d=>d.name||d.id)
        .attr("dx",15).attr("dy",4);
    node.append("title").text(d=>`${d.name||d.id} (${d.type})\n${d.communication_count||0} msgs`);
    sim.on("tick",()=>{
      link.attr("x1",d=>d.source.x).attr("y1",d=>d.source.y)
          .attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);
      node.attr("cx",d=>d.x).attr("cy",d=>d.y);
      label.attr("x",d=>d.x).attr("y",d=>d.y);
    });
    function dragstarted(e){ if(!e.active) sim.alphaTarget(0.3).restart(); e.subject.fx=e.subject.x; e.subject.fy=e.subject.y; }
    function dragged(e){ e.subject.fx=e.x; e.subject.fy=e.y; }
    function dragended(e){ if(!e.active) sim.alphaTarget(0); e.subject.fx=null; e.subject.fy=null; }
  }
  function createContactsList(topContacts) {
    const c = d3.select("#contacts-list").html("");
    if (!topContacts || typeof topContacts!=="object") {
      c.html("<p>No contacts data</p>"); return;
    }
    Object.entries(topContacts)
      .sort((a,b)=>b[1]-a[1]).slice(0,10)
      .forEach(([name,count])=>{
        c.append("div")
         .attr("class","contact-item flex justify-between p-2 bg-gray-50 rounded")
         .html(`<span>${name}</span><strong>${count}</strong>`);
      });
  }

  // —————————————————————————————————————————
  // 5) Behavioral Patterns
  function updatePatternsTab(data) {
    console.log("🔍 Updating patterns tab…");
    if (data.communication_patterns?.time_distribution) {
      createTimingChart(data.communication_patterns.time_distribution);
    }
    if (data.keyword_analysis?.keyword_mentions) {
      createKeywordChart(data.keyword_analysis.keyword_mentions);
    }
    if (data.authority_patterns) {
      createAuthorityAnalysis(data.authority_patterns);
    }
  }
  function createTimingChart(dist) {
    const c = d3.select("#timing-chart").html("");
    if (!dist || typeof dist!=="object") {
      c.html("<p>No timing data</p>"); return;
    }
    const width=300,height=180,radius=Math.min(width,height)/2-10;
    const svg = c.append("svg").attr("width",width).attr("height",height);
    const g   = svg.append("g").attr("transform",`translate(${width/2},${height/2})`);
    const data = Object.entries(dist).map(([k,v])=>({key:k.replace("_"," "),value:v}));
    const color = d3.scaleOrdinal().domain(data.map(d=>d.key)).range(["#ef4444","#3b82f6","#059669","#dc2626"]);
    const pie = d3.pie().value(d=>d.value);
    const arc = d3.arc().innerRadius(0).outerRadius(radius);
    const arcs = g.selectAll("arc").data(pie(data)).join("g");
    arcs.append("path").attr("d",arc).attr("fill",d=>color(d.data.key))
        .append("title").text(d=>`${d.data.key}: ${d.data.value} msgs`);
    arcs.append("text")
        .attr("transform",d=>`translate(${arc.centroid(d)})`)
        .attr("text-anchor","middle").attr("font-size","10px")
        .text(d=>d.data.value>0?d.data.value:"");
  }
  function createKeywordChart(keywords) {
    const c = d3.select("#keyword-chart").html("");
    if (!keywords||!Object.keys(keywords).length) {
      c.append("div").attr("class","text-gray-500 text-center py-8")
       .text("No suspicious keywords detected");
      return;
    }
    const data = Object.entries(keywords).slice(0,8).map(([k,v])=>({keyword:k,count:v}));
    const width=300,height=180,margin={top:20,right:20,bottom:40,left:60};
    const svg = c.append("svg").attr("width",width).attr("height",height);
    const x = d3.scaleLinear().domain([0,d3.max(data,d=>d.count)]).range([margin.left,width-margin.right]);
    const y = d3.scaleBand().domain(data.map(d=>d.keyword)).range([margin.top,height-margin.bottom]).padding(0.1);
    svg.selectAll("rect").data(data).join("rect")
      .attr("x",margin.left).attr("y",d=>y(d.keyword))
      .attr("width",d=>x(d.count)-margin.left).attr("height",y.bandwidth())
      .attr("fill","#ef4444").attr("rx",2);
    svg.selectAll(".label").data(data).join("text")
      .attr("x",margin.left-5).attr("y",d=>y(d.keyword)+y.bandwidth()/2)
      .attr("dy","0.35em").attr("text-anchor","end").attr("font-size","10px")
      .text(d=>d.keyword);
    svg.selectAll(".count-label").data(data).join("text")
      .attr("x",d=>x(d.count)+3).attr("y",d=>y(d.keyword)+y.bandwidth()/2)
      .attr("dy","0.35em").attr("font-size","10px")
      .text(d=>d.count);
  }
  function createAuthorityAnalysis(pats) {
    const c = d3.select("#authority-analysis").html("");
    if (!pats) {
      c.html("<p>No authority patterns</p>"); return;
    }
    const permits = (pats.permit_related||[]).length;
    const abuses  = (pats.authority_abuse_indicators||[]).length;
    c.append("div").attr("class","grid grid-cols-2 gap-4 mb-4").html(`
      <div class="p-2 bg-yellow-50 rounded"><strong>${permits}</strong><br/>Permit-related</div>
      <div class="p-2 bg-red-50 rounded"><strong>${abuses}</strong><br/>Abuse indicators</div>
    `);
  }

  // —————————————————————————————————————————
  // 6) Suspicious Evidence  ← AQUÍ EL CAMBIO CLAVE
  function updateEvidenceTab(data) {
    console.log("🕵️‍♀️ Updating evidence tab…");

    // 6a) Indicadores
    const indicators = data.suspicion_analysis?.indicators || [];
    const indC = d3.select("#suspicion-indicators").html("");
    if (!indicators.length) {
      indC.append("p").text("No suspicion indicators found");
    } else {
      indicators.forEach(item => {
        indC.append("div")
          .attr("class", `evidence-card ${item.severity === 'high' ? 'high-risk' : item.severity === 'medium' ? 'medium-risk' : 'low-risk'} p-3 rounded-lg flex justify-between`)
          .html(`<span>${item.description}</span><span class="font-bold">${item.severity.toUpperCase()}</span>`);
      });
    }

    // 6b) Mensajes sospechosos
    const suspectMsgs = data.keyword_analysis?.suspicious_messages || [];
    const msgC = d3.select("#suspicious-messages").html("");
    if (!suspectMsgs.length) {
      msgC.append("p").text("No suspicious messages found");
    } else {
      suspectMsgs.forEach(msg => {
        msgC.append("div")
          .attr("class","suspicious-message p-2 rounded mb-2")
          .html(`
            <div class="text-xs text-gray-500 mb-1">
              <strong>${msg.date} ${msg.time}</strong> with <em>${msg.other_party}</em>
            </div>
            <div>${msg.content_preview}</div>
          `);
      });
    }
  }

  // —————————————————————————————————————————
  // 7) Conclusión
  function updateConclusion(data) {
    const c = d3.select("#conclusion-content").html("");
    if (data.conclusion) {
      c.append("p").attr("class","italic text-gray-700").text(data.conclusion);
    }
  }
}

// Exportamos para que el HTML lo ejecute al cargar la pestaña
window.init_nadia_analysis = init_nadia_analysis;
