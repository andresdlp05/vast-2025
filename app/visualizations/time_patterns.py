import os
import json
from datetime import datetime
import logging
from collections import defaultdict
from flask import current_app

# Metadata
NAME = "time_patterns"
TITLE = "Time of Day Patterns"
DESCRIPTION = "Visualization of event timing patterns with filtering capabilities"

# Set up logging
logger = logging.getLogger(__name__)


def get_data():
    try:
        data_file = current_app.config["DATA_FILE"]
        # Load the MC3 graph data
        logger.info(f"Loading graph data from: {data_file}")

        with open(data_file, "r") as f:
            graph_data = json.load(f)

        # Create node lookup dictionary
        node_map = {node["id"]: node for node in graph_data["nodes"]}

        # Create evidence map
        evidence_map = defaultdict(list)

        # First pass: Process evidence edges
        for edge in graph_data["edges"]:
            if edge.get("type") in ["evidence_for", "related_to", "supports"]:
                evidence_map[edge["target"]].append(
                    {"source": edge["source"], "edge": edge}
                )

        # Create source/target relationships
        event_connections = defaultdict(lambda: {"sources": [], "targets": []})

        # Second pass: Process all relationships
        for edge in graph_data["edges"]:
            source_id = edge["source"]
            target_id = edge["target"]

            source_node = node_map.get(source_id)
            target_node = node_map.get(target_id)

            if not source_node or not target_node:
                continue

            # Entity -> Event (source)
            if (
                source_node.get("type") == "Entity"
                and target_node.get("type") == "Event"
            ):
                event_connections[target_id]["sources"].append(
                    {
                        "id": source_id,
                        "name": source_node.get("name", "Unknown"),
                        "sub_type": source_node.get("sub_type", "Unknown"),
                        "raw": source_node,
                        "edge": edge,
                    }
                )

            # Event -> Entity (target)
            if (
                source_node.get("type") == "Event"
                and target_node.get("type") == "Entity"
            ):
                event_connections[source_id]["targets"].append(
                    {
                        "id": target_id,
                        "name": target_node.get("name", "Unknown"),
                        "sub_type": target_node.get("sub_type", "Unknown"),
                        "raw": target_node,
                        "edge": edge,
                    }
                )

        # Extract events with timestamps and connections
        events = []
        event_types = set()
        source_types = set()
        target_types = set()
        source_entities = set()
        target_entities = set()
        unique_dates = set()

        for node in graph_data["nodes"]:
            if node.get("type") == "Event":
                timestamp = None
                event_text = (
                    node.get("content")
                    or node.get("findings")
                    or node.get("results")
                    or ""
                )

                # Handle different timestamp attributes
                if node.get("timestamp"):
                    timestamp = node["timestamp"]
                elif node.get("date") and node.get("time"):
                    timestamp = f"{node['date']} {node['time']}"
                elif node.get("date"):
                    timestamp = node["date"]

                if timestamp:
                    try:
                        # Parse timestamp (handle different formats)
                        if " " in timestamp:
                            dt = datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S")
                        else:
                            dt = datetime.strptime(timestamp, "%Y-%m-%d")

                        # Get connections for this event
                        connections = event_connections.get(
                            node["id"], {"sources": [], "targets": []}
                        )

                        # Get evidence for this event
                        evidence = []
                        for ev in evidence_map.get(node["id"], []):
                            source_node = node_map.get(ev["source"])
                            if source_node:
                                evidence.append(
                                    {
                                        "source_id": ev["source"],
                                        "source_type": source_node.get(
                                            "type", "Unknown"
                                        ),
                                        "source_sub_type": source_node.get(
                                            "sub_type", "Unknown"
                                        ),
                                        "edge": ev["edge"],
                                        "raw": source_node,
                                    }
                                )

                        # Create event object
                        event_obj = {
                            "id": node["id"],
                            "raw": node,
                            "sub_type": node.get("sub_type", "Unknown"),
                            "hour": dt.hour,
                            "minute": dt.minute,
                            "day_of_week": dt.strftime("%A"),
                            "full_timestamp": f"{dt.strftime('%Y-%m-%d %H:%M:%S')} ({dt.strftime('%A')})",
                            "date": dt.strftime("%Y-%m-%d"),
                            "time": dt.strftime("%H:%M:%S"),
                            "text": event_text,
                            "sources": connections["sources"],
                            "targets": connections["targets"],
                            "evidence": evidence,
                        }

                        events.append(event_obj)

                        # Update filter options
                        event_types.add(node.get("sub_type", "Unknown"))
                        unique_dates.add(dt.strftime("%Y-%m-%d"))

                        for source in connections["sources"]:
                            source_types.add(source.get("sub_type", "Unknown"))
                            source_entities.add(source.get("name", "Unknown"))

                        for target in connections["targets"]:
                            target_types.add(target.get("sub_type", "Unknown"))
                            target_entities.add(target.get("name", "Unknown"))

                    except Exception as e:
                        logger.warning(
                            f"Error parsing timestamp '{timestamp}' for event {node.get('id')}: {str(e)}"
                        )
                        # Create a fallback event object with minimal data
                        event_obj = {
                            "id": node["id"],
                            "raw": node,
                            "sub_type": node.get("sub_type", "Unknown"),
                            "hour": 0,
                            "minute": 0,
                            "day_of_week": "Unknown",
                            "full_timestamp": "Unknown",
                            "date": "Unknown",
                            "time": "00:00:00",
                            "text": event_text,
                            "sources": [],
                            "targets": [],
                            "evidence": [],
                        }
                        events.append(event_obj)

        logger.info(f"Processed {len(events)} events")

        # Convert sets to sorted lists for filter options
        filter_options = {
            "event_types": sorted(event_types),
            "source_types": sorted(source_types),
            "target_types": sorted(target_types),
            "source_entities": sorted(source_entities),
            "target_entities": sorted(target_entities),
            "dates": sorted(unique_dates),
        }

        return {"events": events, "filter_options": filter_options}

    except Exception as e:
        logger.exception("Error in get_data for time_patterns")
        return {"error": str(e), "events": [], "filter_options": {}}
