"""
Main Flask Application - NLU API
Run this file to start your NLU API server
"""

from flask import Flask, jsonify
from flask_cors import CORS
import sys
import os

# Add project root to path (go up one level from scripts/)
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)  # Go up one level
sys.path.insert(0, project_root)

# Import NLU routes
from src.api.routes.nlu_routes import nlu_bp

# Create Flask app
app = Flask(__name__)
CORS(app)

# Register NLU routes
app.register_blueprint(nlu_bp)

# Root endpoint
@app.route('/', methods=['GET'])
def root():
    return jsonify({
        "service": "NLU API",
        "version": "2.0",
        "status": "running",
        "endpoints": {
            "process": "POST /api/nlu/process",
            "update": "POST /api/nlu/update",
            "confirm": "POST /api/nlu/confirm",
            "health": "GET /api/nlu/health"
        }
    })

# Global health
@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy"}), 200

# Run server
if __name__ == '__main__':
    print("\n" + "="*70)
    print("NLU API SERVER - STARTING")
    print("="*70)
    print("\n📡 Available Endpoints:")
    print("  POST /api/nlu/process        - Process transcript")
    print("  POST /api/nlu/update         - Update field")
    print("  POST /api/nlu/confirm        - Confirm submission")
    print("  GET  /api/nlu/health         - Health check")
    print("  GET  /api/nlu/session/<id>   - Get session")
    print("\n🌐 Server: http://localhost:5000")
    print("="*70 + "\n")
    
    app.run(host='0.0.0.0', port=5000, debug=True)