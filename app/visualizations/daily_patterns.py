import logging
from datetime import datetime
import json
import networkx as nx
import os
from flask import current_app
from sklearn.feature_extraction.text import TfidfVectorizer
import re
import numpy as np
from .topic_modeling import extract_topics_bertopic, extract_topics_lda, extract_topics_tfidf

logger = logging.getLogger(__name__)

NAME = "daily_patterns"
TITLE = "Daily Communication Patterns"
DESCRIPTION = "Visualization of daily communication events with entity markers"


def get_data(include_topics=False, method="bertopic", **kwargs):
    logger.debug(f"Generating daily patterns data, include_topics: {include_topics}")

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

    # Create networkx graph using the correct 'edges' key
    try:
        G = nx.node_link_graph(graph_data, edges="edges")
    except Exception as e:
        logger.error(f"Error creating graph: {str(e)}")
        return {"error": f"Could not create graph: {str(e)}"}

    october_events = []
    entities = {}

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
                        # ISO format with 'T'
                        dt = datetime.fromisoformat(timestamp)
                    elif " " in timestamp:
                        # Space-separated format "YYYY-MM-DD HH:MM:SS"
                        dt = datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S")
                    else:
                        # Date-only format
                        dt = datetime.strptime(timestamp, "%Y-%m-%d")

                    # Filter for October 2040
                    if dt.year == 2040 and dt.month == 10:
                        # Find source entity by looking for "sent" edges
                        source_entity = None
                        target_entities = []
                        content = node_data.get("content", "")

                        # Check all incoming edges to this event
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

                        # Find target entities by looking for "received" edges
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

                        if source_entity:
                            # Convert datetime objects to string representations
                            october_events.append(
                                {
                                    "id": node_id,
                                    "timestamp": timestamp,
                                    "entity_id": source_entity["id"],
                                    "entity_sub_type": source_entity["sub_type"],
                                    "time": dt.time().isoformat(),  # Convert to ISO time string
                                    "day": dt.day,
                                    "datetime": dt.isoformat(),  # Full datetime for frontend
                                    "content": content,
                                    "target_entities": target_entities,
                                }
                            )
                except (ValueError, TypeError) as e:
                    logger.debug(f"Skipping invalid timestamp: {timestamp} - {str(e)}")
                    continue

    logger.info(f"Found {len(october_events)} communication events in October 2040")

    # Base response with events and entities
    response = {
        "events": october_events,
        "entities": list(entities.values()),
    }

    # Only include topic/keyword data if requested
    if include_topics:
        response.update(get_topic_data(october_events, method, **kwargs))
    else:
        # Include basic keywords for backward compatibility
        keywords = extract_keywords(
            [e["content"] for e in october_events if e.get("content")],
            max_keywords=15,
            ngram_range=(1, 2),
        )
        response["keywords"] = keywords

    return response


def get_topic_data(october_events, method="bertopic", **kwargs):
    """Get topic modeling data for events"""
    logger.debug(f"Generating topic data with method: {method}")
    
    # Extract topics using the specified method
    topics = []
    event_contents = [e["content"] for e in october_events if e.get("content")]
    
    if len(event_contents) >= 5:  # Need minimum events for topic modeling
        # Get topic count parameters
        num_topics = kwargs.get("num_topics", "auto")
        min_topic_size = kwargs.get("min_topic_size", 3)
        
        try:
            if method == "tfidf":
                # Handle auto topic count for TF-IDF
                tfidf_num_topics = num_topics
                if num_topics == "auto":
                    tfidf_num_topics = max(3, min(8, len(event_contents) // 5))
                else:
                    try:
                        tfidf_num_topics = int(num_topics)
                    except:
                        tfidf_num_topics = 5
                        
                topics_list, doc_topics = extract_topics_tfidf(event_contents, num_topics=tfidf_num_topics)
                
            elif method.startswith("lda"):
                # Parse vectorizer for LDA
                vectorizer_type = "tfidf"
                if "?" in method:
                    parts = method.split("?")
                    if len(parts) > 1:
                        vectorizer_type = parts[1].split("=")[1] if "=" in parts[1] else "tfidf"
                    
                topics_list, doc_topics, _, _ = extract_topics_lda(
                    event_contents, num_topics=num_topics, vectorizer=vectorizer_type
                )
                
            else:  # Default to BERTopic
                topics_list, doc_topics, _ = extract_topics_bertopic(
                    event_contents, min_topic_size=min_topic_size
                )
            
            # Format topics for frontend
            for i, keywords in enumerate(topics_list):
                if keywords and len(keywords) > 0:
                    topics.append({
                        "id": i,
                        "keywords": keywords,
                        "name": f"Topic {i}: {', '.join(keywords[:3])}"
                    })
            
            # Create event topic assignments
            event_topic_data = []
            content_index = 0
            for event in october_events:
                if event.get("content"):
                    if content_index < len(doc_topics):
                        topic_weights = doc_topics[content_index]
                        # Find dominant topic
                        if topic_weights:
                            dominant_topic = int(np.argmax(topic_weights))
                            dominant_weight = float(topic_weights[dominant_topic])
                        else:
                            dominant_topic = -1
                            dominant_weight = 0.0
                        
                        event_topic_data.append({
                            "event_id": event["id"],
                            "topic_weights": [float(w) for w in topic_weights],
                            "dominant_topic": dominant_topic,
                            "dominant_weight": dominant_weight
                        })
                    content_index += 1
                    
        except Exception as e:
            logger.error(f"Topic modeling failed: {str(e)}")
            # Fallback to simple keyword extraction
            keywords = extract_keywords(event_contents, max_keywords=10)
            topics = [{"id": i, "keywords": [kw["term"]], "name": kw["term"]} for i, kw in enumerate(keywords)]
            event_topic_data = []
    else:
        # Not enough content for topic modeling
        logger.warning(f"Not enough content for topic modeling ({len(event_contents)} events)")
        topics = []
        event_topic_data = []

    return {
        "topics": topics,
        "method_used": method,
        "total_communications": len(event_contents),
        "event_topic_data": event_topic_data
    }


def extract_keywords(contents, max_keywords=15, ngram_range=(1, 3)):
    """Extract important keywords using TF-IDF with n-grams"""
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
        ngram_range=ngram_range,  # 1,2 and 3-grams
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
