import json
import logging
import numpy as np
from collections import defaultdict
from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer
from sklearn.decomposition import LatentDirichletAllocation
from sklearn.metrics import pairwise_distances
from bertopic import BERTopic
from bertopic.representation import KeyBERTInspired
from flask import current_app
import re

logger = logging.getLogger(__name__)

NAME = "topic_modeling"
TITLE = "Topic Modeling Explorer"
DESCRIPTION = "Visualize entity participation in different communication topics"

# Common stopwords for filtering
STOPWORDS = set(
    [
        "the",
        "a",
        "an",
        "and",
        "or",
        "but",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "with",
        "by",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "must",
        "can",
        "this",
        "that",
        "these",
        "those",
        "i",
        "you",
        "he",
        "she",
        "it",
        "we",
        "they",
        "me",
        "him",
        "her",
        "us",
        "them",
    ]
)


def is_meaningful_text(text, min_words=3):
    """Check if text contains meaningful content beyond stopwords"""
    if not text or not isinstance(text, str):
        return False

    # Remove punctuation and convert to lowercase
    words = re.findall(r"\b\w+\b", text.lower())

    # Filter out stopwords
    meaningful_words = [
        word for word in words if word not in STOPWORDS and len(word) > 2
    ]

    return len(meaningful_words) >= min_words


def get_data(method="bertopic", **kwargs):
    logger.debug(f"Generating topic modeling data with method: {method}")

    # Parse vectorizer for LDA
    vectorizer_type = "tfidf"
    if method.startswith("lda"):
        parts = method.split("?")
        method = "lda"
        if len(parts) > 1:
            vectorizer_type = parts[1].split("=")[1] if "=" in parts[1] else "tfidf"

    # Get topic count parameters
    num_topics = kwargs.get("num_topics", "auto")
    min_topic_size = kwargs.get("min_topic_size", 5)

    # Load communication data
    data_file = current_app.config.get("COMMUNICATION_FILE")
    if not data_file:
        return {"error": "Communication file not configured"}

    try:
        with open(data_file, "r") as f:
            comm_data = json.load(f)
    except Exception as e:
        return {"error": f"Could not load communication data: {str(e)}"}

    # Extract communications from links
    communications = []
    for link in comm_data.get("links", []):
        content = link.get("content", "")
        if is_meaningful_text(content):
            communications.append(
                {
                    "id": link.get("event_id", ""),
                    "source": link.get("source"),
                    "target": link.get("target"),
                    "content": content,
                    "datetime": link.get("datetime", ""),
                }
            )

    if len(communications) < 5:
        return {
            "error": "Not enough meaningful communications found for topic modeling"
        }

    logger.debug(f"Found {len(communications)} meaningful communications")

    # Apply topic modeling based on method
    metrics = {}
    if method == "tfidf":
        # Handle auto topic count for TF-IDF
        tfidf_num_topics = num_topics
        if num_topics == "auto":
            tfidf_num_topics = max(5, min(15, len(communications) // 10))
        else:
            try:
                tfidf_num_topics = int(num_topics)
            except:
                tfidf_num_topics = 10
        
        topics, doc_topics = extract_topics_tfidf(
            [c["content"] for c in communications], num_topics=tfidf_num_topics
        )
        metrics = calculate_tfidf_metrics(topics)
    elif method == "lda":
        topics, doc_topics, lda_model, vectorizer = extract_topics_lda(
            [c["content"] for c in communications],
            num_topics=num_topics,
            vectorizer=vectorizer_type,
        )
        metrics = calculate_lda_metrics(
            lda_model, vectorizer, [c["content"] for c in communications]
        )
    else:  # Default to BERTopic
        topics, doc_topics, topic_model = extract_topics_bertopic(
            [c["content"] for c in communications], min_topic_size=min_topic_size
        )
        metrics = calculate_bertopic_metrics(
            topic_model, [c["content"] for c in communications]
        )

    # Calculate entity topic scores
    entity_topic_scores = defaultdict(lambda: defaultdict(float))
    for comm, topic_weights in zip(communications, doc_topics):
        if not comm["source"]:
            continue

        for topic_id, weight in enumerate(topic_weights):
            if weight > 0:  # Only count non-zero weights
                entity_topic_scores[comm["source"]][topic_id] += weight

    # Normalize scores per entity
    for entity, scores in entity_topic_scores.items():
        total = sum(scores.values())
        if total > 0:
            for topic_id in scores:
                scores[topic_id] /= total

    # Prepare topics for output (filter out empty topics)
    topic_output = []
    for i, keywords in enumerate(topics):
        if keywords and len(keywords) > 0:
            topic_output.append({"id": i, "keywords": keywords})

    # Prepare messages with topic assignments
    messages = []
    for comm, topic_weights in zip(communications, doc_topics):
        # Get the dominant topic for this message
        if topic_weights:
            # Convert numpy types to native Python types
            dominant_topic = int(np.argmax(topic_weights))
            dominant_weight = float(topic_weights[dominant_topic])
        else:
            dominant_topic = -1
            dominant_weight = 0.0

        # Convert topic weights to native Python floats
        native_topic_weights = [float(w) for w in topic_weights]

        messages.append(
            {
                "id": comm["id"],
                "source": comm["source"],
                "target": comm["target"],
                "content": comm["content"],
                "datetime": comm["datetime"],
                "topics": native_topic_weights,
                "dominant_topic": dominant_topic,
                "dominant_weight": dominant_weight,
            }
        )

    # Calculate topic metrics
    topic_metrics = []
    for topic in topic_output:
        topic_messages = [m for m in messages if m["dominant_topic"] == topic["id"]]
        topic_words = sum(len(m["content"].split()) for m in topic_messages)

        # Calculate averages as native Python floats
        avg_message_length = (
            float(topic_words) / len(topic_messages) if topic_messages else 0.0
        )
        total_score = sum(m["dominant_weight"] for m in topic_messages)
        avg_topic_score = (
            float(total_score) / len(topic_messages) if topic_messages else 0.0
        )

        topic_metrics.append(
            {
                "id": topic["id"],
                "message_count": len(topic_messages),
                "avg_message_length": avg_message_length,
                "avg_topic_score": avg_topic_score,
            }
        )

    # Create graph structure from communication data
    # Get unique entities from both original data and filtered communications
    entities = set()

    # Create node map from communication data
    node_map = {node["id"]: node for node in comm_data.get("nodes", [])}

    # Add entities from original data
    for link in comm_data.get("links", []):
        if link.get("source"):
            entities.add(link["source"])
        if link.get("target"):
            entities.add(link["target"])

    # Add entities from filtered communications (might have additional ones)
    for comm in communications:
        if comm["source"]:
            entities.add(comm["source"])
        if comm["target"]:
            entities.add(comm["target"])

    # Create nodes from entities
    nodes = []
    for entity in entities:
        if entity in node_map:
            # Use data from communication file
            node_data = node_map[entity]
            nodes.append(
                {
                    "id": entity,
                    "name": node_data.get("name", entity),
                    "type": node_data.get("type", "Entity"),
                    "sub_type": node_data.get("sub_type", "Unknown"),
                }
            )
        else:
            # Fallback if node not in communication file
            nodes.append(
                {
                    "id": entity,
                    "name": entity,
                    "type": "Entity",
                    "sub_type": "Unknown",
                }
            )

    # Create edges from filtered communications
    edges = []
    for comm in communications:
        if comm["source"] and comm["target"]:
            edges.append(
                {
                    "source": comm["source"],
                    "target": comm["target"],
                    "type": "communication",
                    "weight": 1,
                }
            )

    graph = {"nodes": nodes, "edges": edges}

    return {
        "graph": graph,
        "topics": topic_output,
        "entity_topic_scores": dict(entity_topic_scores),
        "method_used": method,
        "vectorizer_used": vectorizer_type if method == "lda" else "none",
        "total_communications": len(communications),
        "messages": messages,
        "topic_metrics": topic_metrics,
        "model_metrics": metrics,
    }


def extract_topics_tfidf(texts, num_topics=15):
    """Extract topics using TF-IDF keywords - each high-scoring term is treated as a separate topic"""
    if len(texts) < 2:
        return [["insufficient", "data"]], [[1.0] for _ in texts]

    try:
        # Create TF-IDF matrix
        tfidf = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            max_features=5000,
            min_df=2,
            max_df=0.8,
        )
        tfidf_matrix = tfidf.fit_transform(texts)

        # Get overall document scores
        doc_scores = tfidf_matrix.toarray()

        # Get top keywords across all documents
        feature_names = tfidf.get_feature_names_out()
        total_scores = np.sum(doc_scores, axis=0)
        top_indices = total_scores.argsort()[-num_topics:][::-1]

        # Create topics - each topic is a single keyword (term)
        topics = [[feature_names[i]] for i in top_indices]

        # Create document-topic matrix 
        # Each document gets scores for each term/topic based on TF-IDF values
        doc_topics = doc_scores[:, top_indices].tolist()

        # Normalize document-topic scores so they sum to 1 for each document
        # This makes the topic assignments more interpretable
        normalized_doc_topics = []
        for doc_scores_row in doc_topics:
            total_score = sum(doc_scores_row)
            if total_score > 0:
                normalized_row = [score / total_score for score in doc_scores_row]
            else:
                # If no terms match, assign equal weight to all topics
                normalized_row = [1.0 / len(doc_scores_row)] * len(doc_scores_row)
            normalized_doc_topics.append(normalized_row)

        return topics, normalized_doc_topics

    except Exception as e:
        logger.error(f"TF-IDF extraction failed: {str(e)}")
        return [["error", "processing"]], [[1.0] for _ in texts]


def extract_topics_lda(texts, num_topics="auto", vectorizer="tfidf", top_n=10):
    """Extract topics using LDA with choice of vectorizer"""
    if len(texts) < 5:
        return [["insufficient", "data"]], [[1.0] for _ in texts], None, None

    # Determine number of topics
    if num_topics == "auto":
        num_topics = max(2, min(10, len(texts) // 5))
    else:
        try:
            num_topics = int(num_topics)
        except:
            num_topics = 5

    try:
        # Create vectorizer with more lenient parameters for small datasets
        if vectorizer == "bow":
            vectorizer_model = CountVectorizer(
                stop_words="english",
                ngram_range=(1, 2),
                max_features=1000,
                min_df=1,  # More lenient for small datasets
                max_df=0.9,
            )
        else:  # default to tfidf
            vectorizer_model = TfidfVectorizer(
                stop_words="english",
                ngram_range=(1, 2),
                max_features=1000,
                min_df=1,  # More lenient for small datasets
                max_df=0.9,
            )

        # Create document-term matrix
        dtm = vectorizer_model.fit_transform(texts)
        feature_names = vectorizer_model.get_feature_names_out()

        # Run LDA with better parameters
        lda = LatentDirichletAllocation(
            n_components=num_topics,
            learning_method="batch",  # Better for small datasets
            random_state=42,
            max_iter=100,  # More iterations for better convergence
            doc_topic_prior=0.1,  # Lower alpha for sparser topics
            topic_word_prior=0.01,  # Lower beta for sparser word distributions
        )
        lda.fit(dtm)

        # Get topic keywords
        topics = []
        for topic_idx, topic in enumerate(lda.components_):
            top_features = topic.argsort()[: -top_n - 1 : -1]
            topic_words = [feature_names[i] for i in top_features]
            topics.append(topic_words)

        # Get document topic distributions
        doc_topics = lda.transform(dtm).tolist()

        return topics, doc_topics, lda, vectorizer_model
    except Exception as e:
        logger.error(f"LDA extraction failed: {str(e)}")
        # Fallback to TF-IDF
        topics, doc_topics = extract_topics_tfidf(texts)
        return topics, doc_topics, None, None


def extract_topics_bertopic(texts, min_topic_size=5, top_n=10):
    """Extract topics using BERTopic"""
    if len(texts) < min_topic_size * 2:
        min_topic_size = max(2, len(texts) // 4)

    try:
        # Use KeyBERT for better keyword extraction
        representation_model = KeyBERTInspired()

        topic_model = BERTopic(
            min_topic_size=min_topic_size,
            nr_topics="auto",
            language="english",
            calculate_probabilities=True,
            representation_model=representation_model,
            verbose=False,
        )
        topics, probs = topic_model.fit_transform(texts)

        # Get topic keywords
        topic_keywords = {}
        unique_topics = set(topics)
        if -1 in unique_topics:
            unique_topics.remove(-1)  # Remove outlier topic

        for topic_id in unique_topics:
            try:
                keywords = topic_model.get_topic(topic_id)
                topic_keywords[topic_id] = [word for word, _ in keywords[:top_n]]
            except:
                continue

        if not topic_keywords:
            # Fallback if no topics found
            return extract_topics_tfidf(texts) + (None,)

        # Prepare document topic weights
        doc_topics = []
        max_topic_id = max(topic_keywords.keys()) if topic_keywords else 0

        for i, doc_topic in enumerate(topics):
            weights = [0.0] * (max_topic_id + 1)
            if doc_topic in topic_keywords:
                weights[doc_topic] = 1.0
            doc_topics.append(weights)

        # Convert to ordered list of topic keywords
        topics_list = []
        for i in range(max_topic_id + 1):
            if i in topic_keywords:
                topics_list.append(topic_keywords[i])
            else:
                topics_list.append([])

        return topics_list, doc_topics, topic_model
    except Exception as e:
        logger.error(f"BERTopic failed: {str(e)}")
        # Fallback to TF-IDF
        topics, doc_topics = extract_topics_tfidf(texts)
        return topics, doc_topics, None


def calculate_tfidf_metrics(topics):
    """Calculate metrics for TF-IDF model"""
    if not topics or len(topics) == 0:
        return {}

    # Calculate diversity
    all_words = [word for topic in topics for word in topic]
    unique_words = set(all_words)
    diversity = len(unique_words) / len(all_words) if all_words else 0

    return {"diversity": round(diversity, 3), "coherence": "N/A", "perplexity": "N/A"}


def calculate_lda_metrics(lda_model, vectorizer, texts):
    """Calculate metrics for LDA model"""
    if not lda_model or not vectorizer:
        return {}

    try:
        # Transform texts to document-term matrix
        dtm = vectorizer.transform(texts)

        # Perplexity
        perplexity = lda_model.perplexity(dtm)

        # Coherence (based on topic concentration - higher is better)
        topics = lda_model.components_
        # Calculate topic coherence as the concentration of probability mass
        topic_concentrations = []
        for topic in topics:
            # Sort topic probabilities and take top 10 words
            top_probs = np.sort(topic)[-10:]
            # Calculate concentration (higher = more coherent)
            concentration = np.sum(top_probs) / np.sum(topic)
            topic_concentrations.append(concentration)
        coherence = np.mean(topic_concentrations)

        # Diversity
        top_words_per_topic = [np.argsort(topic)[-10:][::-1] for topic in topics]
        all_words = [word for topic in top_words_per_topic for word in topic]
        unique_words = set(all_words)
        diversity = len(unique_words) / len(all_words) if all_words else 0

        return {
            "perplexity": round(perplexity, 1),
            "coherence": round(coherence, 3),
            "diversity": round(diversity, 3),
        }
    except Exception as e:
        logger.error(f"Error calculating LDA metrics: {str(e)}")
        return {}


def calculate_bertopic_metrics(topic_model, texts):
    """Calculate metrics for BERTopic model"""
    if not topic_model:
        return {}

    try:
        # Get topics and probabilities
        topics, probs = topic_model.transform(texts)

        # Diversity
        topic_info = topic_model.get_topic_info()
        all_keywords = []
        for topic_id in topic_info.Topic.unique():
            if topic_id >= 0:
                keywords = topic_model.get_topic(topic_id)
                all_keywords.extend([word for word, _ in keywords])

        unique_keywords = set(all_keywords)
        diversity = len(unique_keywords) / len(all_keywords) if all_keywords else 0

        # Coherence (using topic similarity)
        topic_embeddings = topic_model.topic_embeddings_
        if topic_embeddings is not None and len(topic_embeddings) > 1:
            distances = pairwise_distances(topic_embeddings, metric="cosine")
            np.fill_diagonal(distances, np.nan)
            avg_distance = np.nanmean(distances)
            coherence = 1 - avg_distance  # Higher coherence = more similar topics
        else:
            coherence = "N/A"

        return {
            "diversity": round(diversity, 3),
            "coherence": round(coherence, 3) if coherence != "N/A" else "N/A",
            "perplexity": "N/A",
        }
    except Exception as e:
        logger.error(f"Error calculating BERTopic metrics: {str(e)}")
        return {}
