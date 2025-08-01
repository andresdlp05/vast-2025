from flask import Flask, render_template, jsonify, request
import importlib
import logging
import os
import glob

app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Suppress numba debug messages
logging.getLogger("numba").setLevel(logging.WARNING)
logging.getLogger("numba.core").setLevel(logging.WARNING)
logging.getLogger("numba.typed").setLevel(logging.WARNING)

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Data file configurations - AUTO-DETECT based on available files
def setup_data_files():
    data_dir = os.path.join(base_dir, "data")
    config = {}
    
    if os.path.exists(data_dir):
        for file in os.listdir(data_dir):
            file_path = os.path.join(data_dir, file)
            
            # Map files based on naming patterns
            if "communication" in file.lower() and file.endswith('.json'):
                config["COMMUNICATION_FILE"] = file_path
                logger.info(f"Found communication file: {file}")
            elif "graph" in file.lower() and file.endswith('.json') and "communication" not in file.lower():
                config["DATA_FILE"] = file_path
                logger.info(f"Found main graph file: {file}")
            elif "relationship" in file.lower() and file.endswith('.json'):
                config["RELATIONSHIPS_FILE"] = file_path
                logger.info(f"Found relationships file: {file}")
            elif "similarity" in file.lower() and file.endswith('.csv'):
                config["HEATMAP_SIMILARITY_FILE"] = file_path
                logger.info(f"Found similarity matrix file: {file}")
    
    # Set fallbacks if specific files not found
    if "COMMUNICATION_FILE" not in config:
        # Try to find any JSON file that might contain communication data
        potential_files = ["MC3_graph.json", "MC3_messages.json", "MC3_commun.json"]
        for filename in potential_files:
            filepath = os.path.join(data_dir, filename)
            if os.path.exists(filepath):
                config["COMMUNICATION_FILE"] = filepath
                logger.warning(f"Using fallback communication file: {filename}")
                break
    
    if "DATA_FILE" not in config and "COMMUNICATION_FILE" in config:
        # Use the same file for both if we only have one
        config["DATA_FILE"] = config["COMMUNICATION_FILE"]
        logger.warning("Using communication file as main data file")
    
    return config

# Setup data file configurations
data_config = setup_data_files()
for key, value in data_config.items():
    app.config[key] = value
    logger.info(f"Configured {key}: {os.path.basename(value)}")

# Log configuration status
logger.info(f"Data configuration complete. Files found: {list(data_config.keys())}")

# AUTO-DETECT VISUALIZATIONS: Find all Python files in visualizations folder
def detect_visualizations():
    """Automatically detect available visualizations"""
    viz_dir = os.path.join(os.path.dirname(__file__), "visualizations")
    if not os.path.exists(viz_dir):
        logger.warning(f"Visualizations directory not found: {viz_dir}")
        return []
    
    visualizations = []
    for file in glob.glob(os.path.join(viz_dir, "*.py")):
        filename = os.path.basename(file)
        if filename != "__init__.py" and not filename.startswith("_"):
            viz_name = filename[:-3]  # Remove .py extension
            
            # Check if corresponding template exists
            template_path = os.path.join(os.path.dirname(__file__), "templates", f"{viz_name}.html")
            
            # Check if JS file exists
            js_path = os.path.join(os.path.dirname(__file__), "static", "js", f"{viz_name}.js")
            
            if os.path.exists(template_path) and os.path.exists(js_path):
                visualizations.append(viz_name)
                logger.info(f"Found complete visualization: {viz_name}")
            else:
                logger.warning(f"Incomplete visualization {viz_name}: template={os.path.exists(template_path)}, js={os.path.exists(js_path)}")
                # For nadia_analysis, force include even if files are missing (we'll create them)
                if viz_name == "nadia_analysis":
                    visualizations.append(viz_name)
                    logger.info(f"Force-included nadia_analysis (creating missing files if needed)")
    
    return visualizations

# Detect available visualizations
VISUALIZATIONS = detect_visualizations()
logger.info(f"Detected visualizations: {VISUALIZATIONS}")

# Force include essential visualizations
FORCE_INCLUDE = ["daily_patterns", "time_patterns", "topic_modeling", "graph", "keyword_analysis", "nadia_analysis"]
for viz in FORCE_INCLUDE:
    if viz not in VISUALIZATIONS:
        # Check if the Python file exists
        viz_file = os.path.join(os.path.dirname(__file__), "visualizations", f"{viz}.py")
        if os.path.exists(viz_file):
            VISUALIZATIONS.append(viz)
            logger.info(f"Force-added visualization: {viz}")

# Fallback if auto-detection fails completely
if not VISUALIZATIONS:
    VISUALIZATIONS = ["time_patterns", "daily_patterns", "topic_modeling", "graph", "keyword_analysis", "nadia_analysis"]
    logger.warning(f"Using fallback visualizations: {VISUALIZATIONS}")

visualization_modules = {}

def load_visualization_module(viz_name):
    """Lazy load visualization module when needed."""
    if viz_name not in visualization_modules:
        try:
            module = importlib.import_module(f"app.visualizations.{viz_name}")
            visualization_modules[viz_name] = module
            logger.info(f"Loaded visualization module: {viz_name}")
        except ImportError as e:
            logger.error(f"Error loading visualization module {viz_name}: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error loading {viz_name}: {e}")
            return None
    return visualization_modules.get(viz_name)

@app.route("/")
def index():
    viz_list = []
    for name in VISUALIZATIONS:
        # Try to load module to get metadata
        module = load_visualization_module(name)
        if module:
            viz_list.append(
                {
                    "name": name,
                    "title": getattr(module, "TITLE", name.replace("_", " ").title()),
                    "description": getattr(module, "DESCRIPTION", f"Visualization for {name}"),
                }
            )
        else:
            # Add with default values if module can't be loaded
            viz_list.append(
                {
                    "name": name,
                    "title": name.replace("_", " ").title(),
                    "description": f"Visualization for {name}",
                }
            )
            logger.warning(f"Visualization {name} could not be loaded, using defaults")

    logger.debug(f"Rendering index with visualizations: {[v['name'] for v in viz_list]}")
    return render_template("index.html", visualizations=viz_list)
@app.route('/network_analysis')
def network_analysis():
    return render_template('network_analysis.html')

@app.route('/behavioral_patterns')
def behavioral_patterns():
    return render_template('behavioral_patterns.html')

@app.route('/suspicious_evidence')
def suspicious_evidence():
    return render_template('suspicious_evidence.html')
@app.route("/data/<viz_name>", methods=["GET", "POST"])
def get_data(viz_name):
    logger.debug(f"Data request for: {viz_name}")

    # Check if visualization name is valid
    if viz_name not in VISUALIZATIONS:
        logger.error(f"Visualization not found: {viz_name}")
        return jsonify({"error": "Visualization not found"}), 404

    # Lazy load the module
    module = load_visualization_module(viz_name)
    if not module:
        logger.error(f"Failed to load visualization module: {viz_name}")
        return jsonify({"error": "Visualization module could not be loaded"}), 500

    # Check if get_data function exists
    if not hasattr(module, 'get_data'):
        logger.error(f"get_data function not found in {viz_name}")
        return jsonify({"error": f"get_data function not found in {viz_name}"}), 500

    try:
        # Extract parameters from both GET and POST requests
        params = {}

        # GET parameters from query string
        params.update(request.args.to_dict())

        # POST parameters from form data or JSON
        if request.method == "POST":
            if request.is_json:
                params.update(request.get_json() or {})
            else:
                params.update(request.form.to_dict())

        # Pass parameters as kwargs to get_data function
        data = module.get_data(**params)

        logger.debug(f"Returning data for {viz_name} with params {params}: data keys={list(data.keys()) if isinstance(data, dict) else 'non-dict'}")
        return jsonify(data)
    except Exception as e:
        logger.exception(f"Error generating data for {viz_name}")
        return jsonify({"error": str(e)}), 500

# Add a simple test route for debugging
@app.route("/test")
def test():
    return jsonify({
        "status": "OK",
        "visualizations": VISUALIZATIONS,
        "data_files": {k: os.path.basename(v) for k, v in data_config.items()}
    })

if __name__ == "__main__":
    app.run(debug=True)