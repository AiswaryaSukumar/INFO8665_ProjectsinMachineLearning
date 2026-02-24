import requests
import time
import json

BASE_URL = "http://127.0.0.1:8311/INSIGHT311API"
API_KEY = "test123"
PARAMS = {"apikey": API_KEY}

def check_response(resp):
    """Check if the server returned a success status code."""
    if resp.status_code not in [200, 201]:
        print(f"❌ Server Error ({resp.status_code}): {resp.text}")
        return False
    return True

def run_simulation():
    print("\n--- Starting 311 Call Simulation ---")
    
    # 1. Start Session
    resp = requests.post(f"{BASE_URL}/sessions", params=PARAMS, json={"channel": "voice"})
    if not check_response(resp): return
    session_id = resp.json().get("session_id")
    print(f"✓ Session Started: {session_id}")

    # 2. Create Ticket
    resp = requests.post(f"{BASE_URL}/tickets", params=PARAMS, json={"session_id": session_id})
    if not check_response(resp): return
    ticket_id = resp.json().get("ticket_id")
    print(f"✓ Ticket Draft Created: {ticket_id}")

    turn = 1
    ready_to_submit = False

    while not ready_to_submit:
        print(f"\n" + "="*50)
        print(f" TURN {turn} ")
        print("="*50)
        
        input("Press Enter to start speaking...")
        
        # 3. STT: Transcribe
        print("🎙️ Listening...")
        resp = requests.post(f"{BASE_URL}/stt/transcribe", params=PARAMS, 
                             json={"session_id": session_id, "turn": turn})
        if not check_response(resp): break
        transcript = resp.json().get("transcript", "None")
        print(f"📝 User said: '{transcript}'")

        # 4. NLU: Analyze
        resp = requests.post(f"{BASE_URL}/nlu/analyze", params=PARAMS, 
                             json={"session_id": session_id, "transcript": transcript})
        if not check_response(resp): break
        nlu_result = resp.json()
        
        # --- NLU Debug Output (신뢰도 점수 출력) ---
        print("\n🔍 NLU Analysis Results:")
        scores = nlu_result.get("confidence_scores", {})
        for field in ["category", "location", "caller_name", "phone_number"]:
            val = nlu_result.get(field, "N/A")
            score = scores.get(field, 0.0)
            print(f"   - {field.capitalize()}: {val} (Confidence: {score:.2f})")

        # 5. Orchestrator Action
        resp = requests.post(f"{BASE_URL}/orchestrator/action", params=PARAMS, 
                             json={"session_id": session_id, "ticket_id": ticket_id, 
                                   "nlu_result": nlu_result, "turn": turn, "transcript": transcript, })
        if not check_response(resp): break
        
        action_data = resp.json()
        print(f"\n🤖 AI Response: {action_data.get('next_question', 'No question provided')}")
        
        ready_to_submit = action_data.get('ready_to_submit', False)
        if ready_to_submit:
            print("\n" + "*"*50)
            print("✅ TICKET SUBMITTED SUCCESSFULLY!")
            print(f"Collected Info: {json.dumps(action_data['collected_fields'], indent=2)}")
            print("*"*50)
            break
        
        turn += 1
        time.sleep(1)

if __name__ == "__main__":
    run_simulation()