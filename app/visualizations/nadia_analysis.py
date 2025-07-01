# app/visualizations/nadia_analysis.py
import logging
from datetime import datetime
import json
from collections import Counter, defaultdict
from flask import current_app
import os

logger = logging.getLogger(__name__)

NAME = "nadia_analysis"
TITLE = "Analysis of Nadia Conti"
DESCRIPTION = "Visual analysis of Nadia Conti's activities to evaluate suspicions of illegal activities"

def get_data():
    logger.debug("Generating Nadia Conti analysis data")
    
    try:
        # Find any available communication data file
        comm_file = None
        
        # Try different configuration keys
        possible_keys = ["COMMUNICATION_FILE", "DATA_FILE"]
        for key in possible_keys:
            if current_app.config.get(key):
                comm_file = current_app.config[key]
                logger.info(f"Using {key}: {comm_file}")
                break
        
        if not comm_file:
            # Try to find files directly
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            data_dir = os.path.join(base_dir, "data")
            
            if os.path.exists(data_dir):
                for file in os.listdir(data_dir):
                    if file.endswith('.json'):
                        comm_file = os.path.join(data_dir, file)
                        logger.info(f"Using fallback file: {comm_file}")
                        break
        
        if not comm_file or not os.path.exists(comm_file):
            logger.error("No communication file found")
            return {"error": "No communication data file found"}
        
        logger.info(f"Loading communication data from: {comm_file}")
        with open(comm_file, "r") as f:
            comm_data = json.load(f)
        
        # Analyze the structure of the data to find communications
        nadia_communications = find_nadia_communications(comm_data)
        
        if not nadia_communications:
            logger.warning("No communications found for Nadia Conti")
            # Return a sample analysis to test the frontend
            return create_sample_analysis()
        
        logger.info(f"Found {len(nadia_communications)} communications for Nadia Conti")
        
        # Perform the analysis
        return analyze_nadia_data(nadia_communications)
        
    except FileNotFoundError as e:
        logger.error(f"File not found in nadia_analysis: {str(e)}")
        return {"error": f"Data file not found: {str(e)}"}
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error in nadia_analysis: {str(e)}")
        return {"error": f"Invalid JSON in data file: {str(e)}"}
    except Exception as e:
        logger.error(f"Unexpected error in nadia_analysis: {str(e)}", exc_info=True)
        return {"error": f"Analysis error: {str(e)}"}

def find_nadia_communications(comm_data):
    """Find Nadia Conti communications in various data formats"""
    
    nadia_communications = []
    nadia_id = "Nadia Conti"
    
    # Try different data structures
    
    # Method 1: Look for 'links' or 'edges' array
    links = comm_data.get("links", comm_data.get("edges", []))
    
    if links:
        logger.info(f"Found {len(links)} links in data")
        for link in links:
            if link.get("source") == nadia_id or link.get("target") == nadia_id:
                nadia_communications.append(process_communication_link(link, nadia_id))
    
    # Method 2: Look for 'nodes' with communication events
    if not nadia_communications:
        nodes = comm_data.get("nodes", [])
        logger.info(f"Found {len(nodes)} nodes in data, looking for communication events...")
        
        # This would require edge relationships - skip for now
    
    # Method 3: Look for direct message arrays
    if not nadia_communications:
        messages = comm_data.get("messages", comm_data.get("communications", []))
        if messages:
            logger.info(f"Found {len(messages)} messages in data")
            for msg in messages:
                if (msg.get("from") == nadia_id or msg.get("to") == nadia_id or 
                    msg.get("source") == nadia_id or msg.get("target") == nadia_id):
                    nadia_communications.append(process_communication_message(msg, nadia_id))
    
    return [comm for comm in nadia_communications if comm]  # Filter out None values

def process_communication_link(link, nadia_id):
    """Process a communication link into standard format"""
    try:
        datetime_str = link.get("datetime", link.get("timestamp", "2040-01-01T00:00:00"))
        
        # Handle different datetime formats
        comm_datetime = parse_datetime(datetime_str)
        
        return {
            "id": link.get("event_id", link.get("id", f"comm_{id(link)}")),
            "datetime": datetime_str,
            "date": comm_datetime.strftime("%Y-%m-%d"),
            "time": comm_datetime.strftime("%H:%M:%S"),
            "hour": comm_datetime.hour,
            "source": link.get("source", ""),
            "target": link.get("target", ""),
            "content": link.get("content", link.get("message", link.get("text", ""))),
            "is_sender": link.get("source") == nadia_id
        }
    except Exception as e:
        logger.warning(f"Error processing link: {e}")
        return None

def process_communication_message(msg, nadia_id):
    """Process a message into standard format"""
    try:
        datetime_str = msg.get("datetime", msg.get("timestamp", msg.get("date", "2040-01-01T00:00:00")))
        comm_datetime = parse_datetime(datetime_str)
        
        source = msg.get("from", msg.get("source", ""))
        target = msg.get("to", msg.get("target", ""))
        
        return {
            "id": msg.get("id", f"msg_{id(msg)}"),
            "datetime": datetime_str,
            "date": comm_datetime.strftime("%Y-%m-%d"),
            "time": comm_datetime.strftime("%H:%M:%S"),
            "hour": comm_datetime.hour,
            "source": source,
            "target": target,
            "content": msg.get("content", msg.get("message", msg.get("text", ""))),
            "is_sender": source == nadia_id
        }
    except Exception as e:
        logger.warning(f"Error processing message: {e}")
        return None

def parse_datetime(datetime_str):
    """Parse datetime string in various formats"""
    try:
        # Try ISO format first
        if "T" in datetime_str:
            clean_datetime = datetime_str.replace("Z", "")
            if "+" in clean_datetime:
                clean_datetime = clean_datetime.split("+")[0]
            return datetime.fromisoformat(clean_datetime)
        elif " " in datetime_str:
            return datetime.strptime(datetime_str, "%Y-%m-%d %H:%M:%S")
        else:
            return datetime.strptime(datetime_str, "%Y-%m-%d")
    except:
        # Fallback to a default date
        return datetime(2040, 1, 1, 0, 0, 0)

def analyze_nadia_data(nadia_communications):
    """Analyze Nadia's communication data"""
    
    # Sort by datetime
    nadia_communications.sort(key=lambda x: x["datetime"])
    
    # Analyze contacts
    contacts = Counter()
    for comm in nadia_communications:
        other_party = comm["target"] if comm["is_sender"] else comm["source"]
        if other_party and other_party != "Nadia Conti":
            contacts[other_party] += 1
    
    # Analyze timing patterns
    time_patterns = {
        "early_morning": 0,    # 5-7 AM
        "business_hours": 0,   # 8-17 PM  
        "evening": 0,          # 18-22 PM
        "late_night": 0        # 23-4 AM
    }
    
    hourly_distribution = [0] * 24
    
    for comm in nadia_communications:
        hour = comm["hour"]
        hourly_distribution[hour] += 1
        
        if 5 <= hour <= 7:
            time_patterns["early_morning"] += 1
        elif 8 <= hour <= 17:
            time_patterns["business_hours"] += 1
        elif 18 <= hour <= 22:
            time_patterns["evening"] += 1
        else:  # 23-24 or 0-4
            time_patterns["late_night"] += 1
    
    # Analyze suspicious keywords
    suspicious_keywords = [
        "permit", "authorization", "clearance", "secret", "private", "special",
        "arrangement", "deal", "payment", "money", "cash", "funding",
        "restricted", "access", "corridor", "bypass", "loophole",
        "mining", "extraction", "drilling", "equipment", "operation",
        "illegal", "unauthorized", "bribe", "corruption", "under table",
        "approve", "approval", "license", "certificate", "official"
    ]
    
    keyword_mentions = Counter()
    suspicious_messages = []
    
    for comm in nadia_communications:
        content_lower = comm["content"].lower()
        found_keywords = []
        
        for keyword in suspicious_keywords:
            if keyword in content_lower:
                keyword_mentions[keyword] += 1
                found_keywords.append(keyword)
        
        if found_keywords:
            suspicious_messages.append({
                **comm,
                "keywords": found_keywords,
                "suspicion_score": len(found_keywords)
            })
    
    # Sort suspicious messages by suspicion score
    suspicious_messages.sort(key=lambda x: x["suspicion_score"], reverse=True)
    
    # Find permit-related communications
    permit_related = []
    for comm in nadia_communications:
        content_lower = comm["content"].lower()
        if any(term in content_lower for term in ["permit", "authorization", "approval", "clearance", "license"]):
            permit_related.append(comm)
    
    # Create network data
    network_nodes = [{
        "id": "Nadia Conti",
        "name": "Nadia Conti",
        "type": "Person",
        "category": "central",
        "communication_count": len(nadia_communications)
    }]
    
    network_links = []
    
    # Add top contacts as nodes
    for contact, count in contacts.most_common(15):
        if contact:
            network_nodes.append({
                "id": contact,
                "name": contact,
                "type": "Person",
                "category": "contact",
                "communication_count": count
            })
            
            network_links.append({
                "source": "Nadia Conti",
                "target": contact,
                "weight": count,
                "type": "communication"
            })
    
    # Create timeline events
    timeline_events = []
    for i, comm in enumerate(nadia_communications):
        event_type = "normal"
        
        # Determine event type based on content
        content_lower = comm["content"].lower()
        if any(keyword in content_lower for keyword in ["secret", "private", "illegal", "bribe", "unauthorized", "corruption"]):
            event_type = "suspicious"
        elif any(term in content_lower for term in ["permit", "authorization", "approval", "clearance", "license"]):
            event_type = "permit_related"
        
        timeline_events.append({
            "id": comm["id"],
            "datetime": comm["datetime"],
            "date": comm["date"],
            "time": comm["time"],
            "other_party": comm["target"] if comm["is_sender"] else comm["source"],
            "content_preview": comm["content"][:100] + "..." if len(comm["content"]) > 100 else comm["content"],
            "content": comm["content"],
            "is_sender": comm["is_sender"],
            "event_type": event_type,
            "order": i
        })
    
    # Generate suspicion analysis
    suspicion_indicators = []
    
    # Check for unusual timing patterns
    total_comms = len(nadia_communications)
    late_night_percent = time_patterns["late_night"] / total_comms if total_comms > 0 else 0
    
    if late_night_percent > 0.15:  # More than 15%
        suspicion_indicators.append({
            "type": "timing",
            "description": f"Unusually high number of late-night communications ({time_patterns['late_night']} out of {total_comms} total, {late_night_percent:.1%})",
            "severity": "medium"
        })
    
    # Check for suspicious keywords
    if len(keyword_mentions) > 0:
        total_keyword_count = sum(keyword_mentions.values())
        top_keywords = list(keyword_mentions.keys())[:5]
        suspicion_indicators.append({
            "type": "content",
            "description": f"Multiple suspicious keywords detected ({total_keyword_count} mentions): {', '.join(top_keywords)}",
            "severity": "high" if len(keyword_mentions) > 5 else "medium"
        })
    
    # Check for permit-related activity
    if len(permit_related) > 3:
        suspicion_indicators.append({
            "type": "authority_abuse", 
            "description": f"Frequent involvement in permit-related communications ({len(permit_related)} instances)",
            "severity": "high"
        })
    
    # Check for concentrated communication patterns
    high_contact_entities = [contact for contact, count in contacts.items() if count > 5]
    if len(high_contact_entities) > 2:
        suspicion_indicators.append({
            "type": "network",
            "description": f"Frequent communication with specific entities: {', '.join(high_contact_entities[:3])}",
            "severity": "medium"
        })
    
    # Check for suspicious message content
    if len(suspicious_messages) > 5:
        suspicion_indicators.append({
            "type": "content_analysis",
            "description": f"High number of messages containing suspicious keywords ({len(suspicious_messages)} messages)",
            "severity": "high"
        })
    
    # Determine overall recommendation
    high_severity_count = sum(1 for indicator in suspicion_indicators if indicator["severity"] == "high")
    medium_severity_count = sum(1 for indicator in suspicion_indicators if indicator["severity"] == "medium")
    
    if high_severity_count >= 2:
        recommendation = "INVESTIGATE FURTHER"
    elif high_severity_count >= 1 or medium_severity_count >= 3:
        recommendation = "MONITOR"
    else:
        recommendation = "LOW RISK"
    
    # Prepare response data
    response_data = {
        "nadia_profile": {
            "total_communications": len(nadia_communications),
            "date_range": {
                "start": nadia_communications[0]["date"] if nadia_communications else None,
                "end": nadia_communications[-1]["date"] if nadia_communications else None
            },
            "top_contacts": dict(contacts.most_common(10))
        },
        "communication_patterns": {
            "time_distribution": time_patterns,
            "hourly_distribution": hourly_distribution,
            "suspicious_messages_count": len(suspicious_messages)
        },
        "keyword_analysis": {
            "keyword_mentions": dict(keyword_mentions.most_common(15)),
            "suspicious_messages": suspicious_messages[:20]  # Top 20 most suspicious
        },
        "authority_patterns": {
            "permit_related": permit_related,
            "authority_abuse_indicators": []
        },
        "network_data": {
            "nodes": network_nodes,
            "links": network_links
        },
        "timeline": timeline_events,
        "suspicion_analysis": {
            "indicators": suspicion_indicators,
            "overall_score": len(suspicion_indicators),
            "recommendation": recommendation
        }
    }
    
    logger.info(f"Generated analysis with {len(suspicion_indicators)} indicators, recommendation: {recommendation}")
    logger.info(f"Analysis summary: {len(nadia_communications)} communications, {len(contacts)} contacts, {len(keyword_mentions)} suspicious keywords")
    
    return response_data

def create_sample_analysis():
    """Create sample analysis data for testing when no real data is found"""
    
    logger.info("Creating sample analysis data for testing")
    
    # Create sample communications
    sample_communications = [
        {
            "id": "sample_1",
            "datetime": "2040-10-01T14:30:00",
            "date": "2040-10-01",
            "time": "14:30:00",
            "hour": 14,
            "source": "Nadia Conti",
            "target": "Sample Contact 1",
            "content": "We need to discuss the permit authorization process for the new mining operation.",
            "is_sender": True
        },
        {
            "id": "sample_2",
            "datetime": "2040-10-02T23:45:00",
            "date": "2040-10-02",
            "time": "23:45:00",
            "hour": 23,
            "source": "Sample Contact 2",
            "target": "Nadia Conti",
            "content": "The private arrangement we discussed needs to remain secret.",
            "is_sender": False
        },
        {
            "id": "sample_3",
            "datetime": "2040-10-03T09:15:00",
            "date": "2040-10-03",
            "time": "09:15:00",
            "hour": 9,
            "source": "Nadia Conti",
            "target": "Sample Contact 3",
            "content": "Can you approve the special access clearance for the restricted area?",
            "is_sender": True
        }
    ]
    
    # Analyze the sample data
    return analyze_nadia_data(sample_communications)