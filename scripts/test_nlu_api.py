"""
NLU API Test Script
Tests all endpoints to verify API is working correctly
"""

import requests
import json
import time

# API Base URL
BASE_URL = "http://localhost:5000"

def print_header(title):
    print("\n" + "="*70)
    print(title)
    print("="*70)

def print_response(response):
    print(f"Status: {response.status_code}")
    print(f"Response:")
    print(json.dumps(response.json(), indent=2))

def test_health():
    """Test 1: Health Check"""
    print_header("TEST 1: Health Check")
    
    response = requests.get(f"{BASE_URL}/health")
    print_response(response)
    
    assert response.status_code == 200
    assert response.json()['status'] == 'healthy'
    print("✅ PASSED")

def test_process():
    """Test 2: Process Transcript"""
    print_header("TEST 2: Process Transcript")
    
    data = {
        "transcript": "There's a huge pothole on Main Street near the school. It's been there for weeks.",
        "session_id": "test-session-123"
    }
    
    response = requests.post(
        f"{BASE_URL}/api/nlu/process",
        json=data
    )
    
    print_response(response)
    
    assert response.status_code == 200
    result = response.json()
    assert result['session_id'] == 'test-session-123'
    assert result['category'] is not None
    assert 'missing_fields' in result
    
    print("✅ PASSED")
    
    return result['session_id']

def test_update(session_id):
    """Test 3: Update Field"""
    print_header("TEST 3: Update Field (Caller Name)")
    
    data = {
        "session_id": session_id,
        "field": "caller_name",
        "value": "John Smith"
    }
    
    response = requests.post(
        f"{BASE_URL}/api/nlu/update",
        json=data
    )
    
    print_response(response)
    
    assert response.status_code == 200
    result = response.json()
    assert result['caller_name'] == 'John Smith'
    assert result['confidence_scores']['caller_name'] == 1.0  # Manual entry = 100%
    
    print("✅ PASSED")

def test_update_phone(session_id):
    """Test 4: Update Phone Number"""
    print_header("TEST 4: Update Field (Phone Number)")
    
    data = {
        "session_id": session_id,
        "field": "phone_number",
        "value": "416-555-1234"
    }
    
    response = requests.post(
        f"{BASE_URL}/api/nlu/update",
        json=data
    )
    
    print_response(response)
    
    assert response.status_code == 200
    result = response.json()
    assert result['phone_number'] == '416-555-1234'
    
    print("✅ PASSED")

def test_get_session(session_id):
    """Test 5: Get Session"""
    print_header("TEST 5: Get Session Data")
    
    response = requests.get(f"{BASE_URL}/api/nlu/session/{session_id}")
    
    print_response(response)
    
    assert response.status_code == 200
    result = response.json()
    assert result['session_id'] == session_id
    
    print("✅ PASSED")

def test_confirm(session_id):
    """Test 6: Confirm Submission"""
    print_header("TEST 6: Confirm Submission")
    
    data = {
        "session_id": session_id
    }
    
    response = requests.post(
        f"{BASE_URL}/api/nlu/confirm",
        json=data
    )
    
    print_response(response)
    
    assert response.status_code == 200
    result = response.json()
    assert result['confirmed'] == True
    assert result['ready_to_submit'] == True  # Should be true since all fields filled
    
    print("✅ PASSED")

def test_complete_workflow():
    """Test 7: Complete Workflow"""
    print_header("TEST 7: Complete Workflow Simulation")
    
    # Step 1: User calls in with complaint
    print("\n📞 Step 1: User calls in...")
    transcript = "Hi, there's graffiti spray painted on the bridge at Queen Street. Lots of tags everywhere."
    
    process_data = {
        "transcript": transcript
    }
    
    response = requests.post(f"{BASE_URL}/api/nlu/process", json=process_data)
    result = response.json()
    session_id = result['session_id']
    
    print(f"   Category: {result['category']}")
    print(f"   Location: {result['location']}")
    print(f"   Missing: {result['missing_fields']}")
    
    # Step 2: Orchestrator asks for missing info
    print("\n🤖 Step 2: Orchestrator asks for name...")
    update_name = {
        "session_id": session_id,
        "field": "caller_name",
        "value": "Sarah Martinez"
    }
    
    response = requests.post(f"{BASE_URL}/api/nlu/update", json=update_name)
    result = response.json()
    print(f"   Name added: {result['caller_name']}")
    print(f"   Still missing: {result['missing_fields']}")
    
    # Step 3: Ask for phone
    print("\n🤖 Step 3: Orchestrator asks for phone...")
    update_phone = {
        "session_id": session_id,
        "field": "phone_number",
        "value": "416-555-9999"
    }
    
    response = requests.post(f"{BASE_URL}/api/nlu/update", json=update_phone)
    result = response.json()
    print(f"   Phone added: {result['phone_number']}")
    print(f"   Still missing: {result['missing_fields']}")
    
    # Step 4: Read back and confirm
    print("\n🤖 Step 4: User confirms details...")
    confirm_data = {
        "session_id": session_id
    }
    
    response = requests.post(f"{BASE_URL}/api/nlu/confirm", json=confirm_data)
    result = response.json()
    
    print(f"   Confirmed: {result['confirmed']}")
    print(f"   Ready to submit: {result['ready_to_submit']}")
    
    print("\n📊 Final result:")
    print(json.dumps(result, indent=2))
    
    print("\n✅ WORKFLOW PASSED")

def run_all_tests():
    """Run all API tests"""
    
    print("\n" + "="*70)
    print("NLU API TEST SUITE")
    print("="*70)
    print("\n⚠️  Make sure NLU API is running on http://localhost:5000")
    print("   Run: python src/api/nlu_api.py\n")
    
    try:
        # Test connection
        response = requests.get(f"{BASE_URL}/health", timeout=2)
    except requests.exceptions.ConnectionError:
        print("❌ ERROR: Cannot connect to API!")
        print("   Make sure the API is running on port 5000")
        return
    
    try:
        # Run basic tests
        test_health()
        session_id = test_process()
        test_update(session_id)
        test_update_phone(session_id)
        test_get_session(session_id)
        test_confirm(session_id)
        
        # Run complete workflow
        test_complete_workflow()
        
        print_header("ALL TESTS PASSED! ✅")
        print("\nYour NLU API is working perfectly!")
        print("Ready for orchestrator integration! 🚀")
    
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
    except Exception as e:
        print(f"\n❌ ERROR: {e}")

if __name__ == '__main__':
    run_all_tests()