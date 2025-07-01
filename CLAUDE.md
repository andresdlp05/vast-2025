# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VAST Challenge 3 2025 project for analyzing corruption acts on "Oceanus" Island through visual analytics of intercepted radio communications. The project analyzes a knowledge graph representing two weeks of communications to identify temporal patterns, relationships, pseudonyms, and potential illegal activities.

## Development Commands

### Environment Setup
```bash
# Install UV package manager (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh
# or: pip install uv

# Install dependencies and create virtual environment
uv sync

# Add new dependencies
uv add <package-name>
```

### Running the Application
```bash
# Run Flask development server
flask run --debug

# Alternative: run with Python directly
python -m flask run --debug
```

### Jupyter Notebooks
```bash
# Start Jupyter for data analysis
jupyter notebook
# or
jupyter lab
```

## Architecture

### Core Structure
- **Flask Web Application**: Main entry point in `app/__init__.py` with modular visualization system
- **Visualization Modules**: Each analysis type (daily patterns, topic modeling, etc.) is a separate module in `app/visualizations/`
- **Data Layer**: JSON files in `data/` containing knowledge graph and communication data
- **Frontend**: Templates in `app/templates/` with corresponding CSS/JS in `app/static/`

### Visualization System
The app uses a plugin-like architecture where each visualization:
- Has its own module in `app/visualizations/` 
- Implements `get_data()` function that returns JSON data
- Includes metadata: `NAME`, `TITLE`, `DESCRIPTION`
- Is automatically loaded and exposed via `/data/<viz_name>` endpoints

Current visualizations:
- `daily_patterns`: Temporal communication analysis
- `time_patterns`: Time-based pattern detection  
- `topic_modeling`: Content clustering and topic analysis
- `graph`: Network visualization of communications
- `keyword_analysis`: TF-IDF based keyword extraction

### Data Processing
- **NetworkX**: Core graph processing library for communication network analysis
- **Scientific Stack**: Uses pandas, scikit-learn, matplotlib, plotly for data analysis
- **NLP Pipeline**: NLTK, sentence-transformers, BERTopic for text analysis
- **Configuration**: Data file paths configured in Flask app config (`DATA_FILE`, `COMMUNICATION_FILE`)

### Key Data Structures
- Main graph data: `MC3_graph.json` and `MC3_graph_communication.json`
- CSV exports: `MC3_messages.csv`, `MC3_persons.csv`
- Schema documentation: `MC3_schema.json`

## Analysis Focus Areas

1. **Daily Temporal Patterns**: Communication timing analysis to identify influence relationships
2. **Entity Relationships**: Grouping and topic analysis of vessel/person interactions  
3. **Pseudonym Detection**: Visual analytics to identify aliases in communications
4. **Illegal Activity Investigation**: Evidence gathering for suspected illegal fishing activities

## Dependencies
- Python 3.13+ required
- Core: Flask, NetworkX, pandas, scikit-learn
- Visualization: plotly, matplotlib
- NLP: NLTK, sentence-transformers, BERTopic
- Clustering: HDBSCAN, UMAP