# app/visualizations/nadia_analysis.py
import logging
from datetime import datetime
import json
from collections import Counter
from flask import current_app

logger = logging.getLogger(__name__)

NAME = "nadia_analysis"
TITLE = "Analysis of Nadia Conti"
DESCRIPTION = "Visual analysis of Nadia Conti's activities to evaluate suspicions of illegal activities"

def get_data():
    logger.debug("Generating Nadia Conti analysis data")
    
    try:
        # Load communication data
        comm_file = current_app.config.get("COMMUNICATION_FILE")
        if not comm_file:
            return {"error": "Communication file not configured"}
        
        with open(comm_file, "r") as f:
            comm_data = json.load(f)
        
        # Find Nadia Conti communications
        nadia_id = "Nadia Conti"
        nadia_communications = []
        
        for link in comm_data.get("links", []):
            if link.get("source") == nadia_id or link.get("target") == nadia_id:
                try:
                    comm_datetime = datetime.fromisoformat(link.get("datetime", "2040-01-01T00:00:00"))
                    
                    nadia_communications.append({
                        "id": link.get("event_id"),
                        "datetime": link.get("datetime"),
                        "date": comm_datetime.strftime("%Y-%m-%d"),
                        "time": comm_datetime.strftime("%H:%M:%S"),
                        "hour": comm_datetime.hour,
                        "source": link.get("source"),
                        "target": link.get("target"),
                        "content": link.get("content", ""),
                        "is_sender": link.get("source") == nadia_id
                    })
                except Exception as e:
                    logger.warning(f"Error parsing datetime: {e}")
                    continue
        
        if not nadia_communications:
            return {"error": "No communications found for Nadia Conti"}
        
        # Sort by datetime
        nadia_communications.sort(key=lambda x: x["datetime"])
        
        # Analyze contacts using Counter (not defaultdict!)
        contacts = Counter()
        for comm in nadia_communications:
            other_party = comm["target"] if comm["is_sender"] else comm["source"]
            if other_party:
                contacts[other_party] += 1
        
        # Analyze timing patterns
        time_patterns = {
            "early_morning": 0,
            "business_hours": 0,
            "evening": 0,
            "late_night": 0
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
            else:
                time_patterns["late_night"] += 1
        
        # Analyze suspicious keywords
        suspicious_keywords = [
            "permit", "authorization", "clearance", "secret", "private", "special",
            "arrangement", "deal", "payment", "money", "cash", "funding",
            "restricted", "access", "corridor", "bypass", "loophole",
            "mining", "extraction", "drilling", "equipment", "operation"
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
        
        # Find permit-related communications
        permit_related = []
        for comm in nadia_communications:
            content_lower = comm["content"].lower()
            if any(term in content_lower for term in ["permit", "authorization", "approval", "clearance"]):
                permit_related.append(comm)
        
        # Create network data
        network_nodes = [{
            "id": nadia_id,
            "name": "Nadia Conti",
            "type": "Person",
            "category": "central",
            "communication_count": len(nadia_communications)
        }]
        
        network_links = []
        
        for contact, count in contacts.items():
            if contact:
                network_nodes.append({
                    "id": contact,
                    "name": contact,
                    "type": "Person",
                    "category": "contact",
                    "communication_count": count
                })
                
                network_links.append({
                    "source": nadia_id,
                    "target": contact,
                    "weight": count,
                    "type": "communication"
                })
        
        # Create timeline events
        timeline_events = []
        for i, comm in enumerate(nadia_communications):
            event_type = "normal"
            
            if comm["id"] in [msg["id"] for msg in suspicious_messages]:
                event_type = "suspicious"
            elif any(term in comm["content"].lower() for term in ["permit", "authorization"]):
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
        
        if time_patterns["late_night"] > len(nadia_communications) * 0.2:
            suspicion_indicators.append({
                "type": "timing",
                "description": f"High number of late-night communications ({time_patterns['late_night']} out of {len(nadia_communications)})",
                "severity": "medium"
            })
        
        if len(keyword_mentions) > 0:
            suspicion_indicators.append({
                "type": "content",
                "description": f"Multiple suspicious keywords found: {', '.join(list(keyword_mentions.keys())[:5])}",
                "severity": "high"
            })
        
        if len(permit_related) > 3:
            suspicion_indicators.append({
                "type": "authority_abuse",
                "description": f"Frequent involvement in permit-related communications ({len(permit_related)} instances)",
                "severity": "high"
            })
        
        high_contact_entities = [contact for contact, count in contacts.items() if count > 5]
        if len(high_contact_entities) > 0:
            suspicion_indicators.append({
                "type": "network",
                "description": f"Frequent communication with key entities: {', '.join(high_contact_entities[:3])}",
                "severity": "medium"
            })
        
        # Return the data structure
        return {
            "nadia_profile": {
                "total_communications": len(nadia_communications),
                "date_range": {
                    "start": nadia_communications[0]["date"] if nadia_communications else None,
                    "end": nadia_communications[-1]["date"] if nadia_communications else None
                },
                "top_contacts": dict(contacts.most_common(10))  # This line now works with Counter
            },
            "communication_patterns": {
                "time_distribution": time_patterns,
                "hourly_distribution": hourly_distribution,
                "suspicious_messages_count": len(suspicious_messages)
            },
            "keyword_analysis": {
                "keyword_mentions": dict(keyword_mentions.most_common(10)),
                "suspicious_messages": suspicious_messages[:20]
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
                "recommendation": "INVESTIGATE FURTHER" if len(suspicion_indicators) >= 3 else "MONITOR" if len(suspicion_indicators) >= 1 else "LOW RISK"
            }
        }
        
    except Exception as e:
        logger.error(f"Error in nadia_analysis: {str(e)}")
        return {"error": f"Analysis error: {str(e)}"}