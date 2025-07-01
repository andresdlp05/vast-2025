import logging
from datetime import datetime
import json
import networkx as nx
import os
import re
import math
from collections import defaultdict
from flask import current_app
from sklearn.feature_extraction.text import TfidfVectorizer
import numpy as np

logger = logging.getLogger(__name__)

NAME = "keyword_analysis"
TITLE = "Keyword Communication Analysis"
DESCRIPTION = "Identify important expressions and group communications by them"


def get_data():
    logger.debug("Generating keyword analysis data")

    # Get path to data file from config
    data_file = current_app.config["DATA_FILE"]
    if not data_file:
        logger.error("DATA_FILE not configured")
        return {"error": "Data file not configured"}

    # Load graph data from file
    try:
        with open(data_file, "r") as f:
            graph_data = json.load(f)
    except Exception as e:
        logger.error(f"Error loading graph data: {str(e)}")
        return {"error": f"Could not load data file: {str(e)}"}

    # Create networkx graph
    try:
        G = nx.node_link_graph(graph_data, edges="edges")
    except Exception as e:
        logger.error(f"Error creating graph: {str(e)}")
        return {"error": f"Could not create graph: {str(e)}"}

    october_events = []
    entities = {}
    event_contents = []

    # Process nodes to find communication events in October 2040
    for node_id, node_data in G.nodes(data=True):
        if (
            node_data.get("type") == "Event"
            and node_data.get("sub_type") == "Communication"
        ):
            # Handle different timestamp formats
            timestamp = node_data.get("timestamp") or node_data.get("date")

            if timestamp:
                try:
                    # Parse different timestamp formats
                    if "T" in timestamp:
                        dt = datetime.fromisoformat(timestamp)
                    elif " " in timestamp:
                        dt = datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S")
                    else:
                        dt = datetime.strptime(timestamp, "%Y-%m-%d")

                    # Filter for October 2040
                    if dt.year == 2040 and dt.month == 10:
                        # Find source entity
                        source_entity = None
                        target_entities = []
                        content = node_data.get("content", "")

                        # Check incoming edges
                        for predecessor, _, edge_data in G.in_edges(node_id, data=True):
                            if edge_data.get("type") == "sent":
                                pred_data = G.nodes[predecessor]
                                if pred_data.get("type") == "Entity":
                                    source_entity = {
                                        "id": predecessor,
                                        "sub_type": pred_data.get("sub_type"),
                                        "label": pred_data.get("label", ""),
                                    }
                                    entities[predecessor] = source_entity
                                    break

                        # Find target entities
                        for _, successor, edge_data in G.out_edges(node_id, data=True):
                            if edge_data.get("type") == "received":
                                succ_data = G.nodes[successor]
                                if succ_data.get("type") == "Entity":
                                    target_entity = {
                                        "id": successor,
                                        "sub_type": succ_data.get("sub_type"),
                                        "label": succ_data.get("label", ""),
                                    }
                                    entities[successor] = target_entity
                                    target_entities.append(successor)

                        if source_entity and content:
                            event_contents.append(content)
                            october_events.append(
                                {
                                    "id": node_id,
                                    "timestamp": timestamp,
                                    "entity_id": source_entity["id"],
                                    "entity_sub_type": source_entity["sub_type"],
                                    "datetime": dt.isoformat(),
                                    "content": content,
                                    "target_entities": target_entities,
                                }
                            )
                except (ValueError, TypeError) as e:
                    logger.debug(f"Skipping invalid timestamp: {timestamp} - {str(e)}")
                    continue

    logger.info(f"Found {len(october_events)} communication events in October 2040")

    # Extract keywords using TF-IDF
    keywords = extract_keywords(event_contents)

    # Group events by keywords
    keyword_events = group_events_by_keywords(october_events, keywords)

    # Prepare JSON-serializable response
    return {
        "keywords": keywords,
        "keyword_events": keyword_events,
        "events": october_events,
        "entities": list(entities.values()),
    }


def extract_keywords(contents, max_keywords=20):
    """Extract important keywords using TF-IDF"""
    if not contents:
        return []

    # Preprocess text
    processed_contents = [
        re.sub(r"[^\w\s]", "", content).lower().strip() for content in contents
    ]

    # Create TF-IDF matrix
    vectorizer = TfidfVectorizer(
        stop_words="english",
        max_features=500,
        ngram_range=(1, 2),  # Include 1-2 word phrases
    )

    try:
        tfidf_matrix = vectorizer.fit_transform(processed_contents)
    except ValueError:
        return []

    # Get feature names
    feature_names = vectorizer.get_feature_names_out()

    # Get top keywords across all documents
    tfidf_scores = np.sum(tfidf_matrix, axis=0)
    top_indices = np.argsort(tfidf_scores).tolist()[0][-max_keywords:]
    top_indices.reverse()

    # Prepare keyword data
    keywords = []
    for idx in top_indices:
        keyword = feature_names[idx]
        score = float(tfidf_scores[0, idx])
        keywords.append(
            {
                "term": keyword,
                "score": score,
                "id": f"kw_{len(keywords)}",  # Generate unique ID
            }
        )

    return keywords


def group_events_by_keywords(events, keywords):
    """Group events by which keywords they contain"""
    keyword_events = {kw["id"]: [] for kw in keywords}
    keyword_terms = {kw["id"]: kw["term"] for kw in keywords}

    for event in events:
        content = event["content"].lower()
        for kw_id, term in keyword_terms.items():
            # Check for whole word matches
            if re.search(rf"\b{re.escape(term)}\b", content):
                keyword_events[kw_id].append(event["id"])

    return keyword_events
