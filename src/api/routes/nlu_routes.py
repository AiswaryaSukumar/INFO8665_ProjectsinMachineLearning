"""
NLU Routes - Flask Blueprint for NLU API endpoints
Place this in: src/api/routes/nlu_routes.py
"""

from flask import Blueprint, request, jsonify
import sys
import os

# Add project root to path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(os.path.dirname(current_dir)))
sys.path.insert(0, project_root)

from src.nlu.nlu_processor import NLUProcessor

# Create Blueprint
nlu_bp = Blueprint('nlu', __name__, url_prefix='/api/nlu')

# Initialize NLU Processor (single instance)
print("Initializing NLU Processor...")
nlu_processor = NLUProcessor(use_ml_classifier=True)
print("✓ NLU Processor ready!")


# ========== ENDPOINT 1: PROCESS TRANSCRIPT ==========

@nlu_bp.route('/process', methods=['POST'])
def process_transcript():
    """
    Process initial transcript from Speech-to-Text
    
    POST /api/nlu/process
    
    Request Body:
    {
        "transcript": "There's a pothole on Main Street",
        "session_id": "optional-session-id"
    }
    """
    try:
        data = request.json
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        transcript = data.get('transcript')
        session_id = data.get('session_id', None)
        
        if not transcript:
            return jsonify({"error": "Missing 'transcript' field"}), 400
        
        # Process with NLU
        result = nlu_processor.process(transcript, session_id)
        
        return jsonify(result), 200
    
    except Exception as e:
        print(f"Error in /process: {e}")
        return jsonify({
            "error": "Internal server error",
            "message": str(e)
        }), 500


# ========== ENDPOINT 2: UPDATE FIELD ==========

@nlu_bp.route('/update', methods=['POST'])
def update_field():
    """
    Update a specific field when orchestrator gets clarification from user
    
    POST /api/nlu/update
    
    Request Body:
    {
        "session_id": "abc-123",
        "field": "caller_name",
        "value": "John Smith"
    }
    """
    try:
        data = request.json
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        session_id = data.get('session_id')
        field = data.get('field')
        value = data.get('value')
        
        if not session_id:
            return jsonify({"error": "Missing 'session_id' field"}), 400
        if not field:
            return jsonify({"error": "Missing 'field' field"}), 400
        if value is None:
            return jsonify({"error": "Missing 'value' field"}), 400
        
        # Update field
        result = nlu_processor.update_field(session_id, field, value)
        
        if result is None:
            return jsonify({"error": "Session not found"}), 404
        
        return jsonify(result), 200
    
    except Exception as e:
        print(f"Error in /update: {e}")
        return jsonify({
            "error": "Internal server error",
            "message": str(e)
        }), 500


# ========== ENDPOINT 3: CONFIRM SUBMISSION ==========

@nlu_bp.route('/confirm', methods=['POST'])
def confirm_submission():
    """
    Mark session as confirmed when user says YES to final confirmation
    
    POST /api/nlu/confirm
    
    Request Body:
    {
        "session_id": "abc-123"
    }
    """
    try:
        data = request.json
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        session_id = data.get('session_id')
        
        if not session_id:
            return jsonify({"error": "Missing 'session_id' field"}), 400
        
        # Confirm submission
        result = nlu_processor.confirm_submission(session_id)
        
        if result is None:
            return jsonify({"error": "Session not found"}), 404
        
        return jsonify(result), 200
    
    except Exception as e:
        print(f"Error in /confirm: {e}")
        return jsonify({
            "error": "Internal server error",
            "message": str(e)
        }), 500


# ========== ENDPOINT 4: SET CORRECTION FIELD ==========

@nlu_bp.route('/set-correction', methods=['POST'])
def set_correction_field():
    """
    Mark a field as needing correction (used by orchestrator before asking)
    
    POST /api/nlu/set-correction
    
    Request Body:
    {
        "session_id": "abc-123",
        "field": "location"
    }
    """
    try:
        data = request.json
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        session_id = data.get('session_id')
        field = data.get('field')
        
        if not session_id:
            return jsonify({"error": "Missing 'session_id' field"}), 400
        if not field:
            return jsonify({"error": "Missing 'field' field"}), 400
        
        # Set correction field
        result = nlu_processor.set_correction_field(session_id, field)
        
        if result is None:
            return jsonify({"error": "Session not found"}), 404
        
        return jsonify(result), 200
    
    except Exception as e:
        print(f"Error in /set-correction: {e}")
        return jsonify({
            "error": "Internal server error",
            "message": str(e)
        }), 500


# ========== ENDPOINT 5: GET SESSION ==========

@nlu_bp.route('/session/<session_id>', methods=['GET'])
def get_session(session_id):
    """
    Retrieve current session data
    
    GET /api/nlu/session/{session_id}
    """
    try:
        result = nlu_processor.get_session(session_id)
        
        if result is None:
            return jsonify({"error": "Session not found"}), 404
        
        return jsonify(result), 200
    
    except Exception as e:
        print(f"Error in /session: {e}")
        return jsonify({
            "error": "Internal server error",
            "message": str(e)
        }), 500


# ========== ENDPOINT 6: CLEAR SESSION ==========

@nlu_bp.route('/session/<session_id>', methods=['DELETE'])
def clear_session(session_id):
    """
    Clear session data (cleanup after submission)
    
    DELETE /api/nlu/session/{session_id}
    """
    try:
        success = nlu_processor.clear_session(session_id)
        
        if not success:
            return jsonify({"error": "Session not found"}), 404
        
        return jsonify({"message": "Session cleared"}), 200
    
    except Exception as e:
        print(f"Error in /clear: {e}")
        return jsonify({
            "error": "Internal server error",
            "message": str(e)
        }), 500


# ========== HEALTH CHECK ==========

@nlu_bp.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint
    
    GET /api/nlu/health
    """
    return jsonify({
        "status": "healthy",
        "service": "NLU API",
        "version": "2.0"
    }), 200