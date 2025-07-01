import networkx as nx
import logging
import json
import pandas as pd
from flask import current_app

logger = logging.getLogger(__name__)

# Visualization metadata
NAME = "graph"
TITLE = "Network Exploration"
DESCRIPTION = "Vizualize the interaction between entities and their relationships."


def get_data():
    logger.debug("Generating graph data")

    logger.debug("Loading graph data from static/graph.json")
    data_file = current_app.config["COMMUNICATION_FILE"]
    relationships_file = current_app.config["RELATIONSHIPS_FILE"]
    if not data_file:
        logger.error("COMMUNICATION_FILE not configured")
        return {"error": "Data file not configured"}

    # Load graph data from file
    try:
        with open(data_file, "r") as f:
            graph_data = json.load(f)
    except Exception as e:
        logger.error(f"Error loading graph data: {str(e)}")
        return {"error": f"Could not load data file: {str(e)}"}
    # breakpoint()
    nodes = graph_data.get("nodes", [])
    links = graph_data.get("links", graph_data.get("edges", []))

    try:
        csv_path = current_app.config["HEATMAP_SIMILARITY_FILE"]
        df = pd.read_csv(csv_path, index_col=0)
        entities = df.index.tolist()
        matrix = df.values.tolist()
    except Exception as e:
        logger.error(f"Error loading entity similarity matrix: {str(e)}")
        return {"error": f"Could not load entity similarity matrix: {str(e)}"}

    # Load relationships data
    try:
        with open(relationships_file, "r") as f:
            relationships_data = json.load(f)
    except Exception as e:
        logger.error(f"Error loading relationships data: {str(e)}")
        return {"error": f"Could not load relationships file: {str(e)}"}
    relationships_nodes = relationships_data.get("nodes", [])
    relationships_edges = relationships_data.get(
        "links", relationships_data.get("edges", [])
    )

    logger.debug(f"Loaded graph: {len(nodes)} nodes, {len(links)} edges")
    return {
        "communication": {
            "nodes": nodes,
            "links": links,
        },
        "relationships": {
            "nodes": relationships_nodes,
            "links": relationships_edges,
        },
        "heatmap": {"entities": entities, "matrix": matrix},
    }
