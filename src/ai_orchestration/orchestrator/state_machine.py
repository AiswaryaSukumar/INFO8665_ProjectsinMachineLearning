"""
State Machine - Manages conversation state transitions
Ensures the conversation follows valid paths and prevents invalid state changes
"""
from enum import Enum
from typing import Optional, List, Dict
from .models import ConversationState


class StateTransitionError(Exception):
    """Raised when an invalid state transition is attempted"""
    pass


class StateMachine:
    """
    Manages conversation state transitions with validation
    Ensures the system only moves through valid conversation flows
    """
    
    # Define all valid state transitions
    # Format: current_state: [list of valid next states]
    VALID_TRANSITIONS: Dict[ConversationState, List[ConversationState]] = {
        ConversationState.INITIALIZED: [
            ConversationState.GREETING
        ],
        
        ConversationState.GREETING: [
            ConversationState.LISTENING
        ],
        
        ConversationState.LISTENING: [
            ConversationState.PROCESSING,
            ConversationState.ESCALATED  # Can escalate if audio issues
        ],
        
        ConversationState.PROCESSING: [
            ConversationState.COLLECTING_INFO,
            ConversationState.VALIDATING,
            ConversationState.ESCALATED,  # Can escalate if NLU fails
            ConversationState.FAILED
        ],
        
        ConversationState.COLLECTING_INFO: [
            ConversationState.LISTENING,  # Ask follow-up question, then listen
            ConversationState.VALIDATING,  # Check if we have everything
            ConversationState.ESCALATED,  # Escalate if too many retries
            ConversationState.FAILED
        ],
        
        ConversationState.VALIDATING: [
            ConversationState.COLLECTING_INFO,  # Missing info, ask more questions
            ConversationState.CONFIRMING,  # Have all info, confirm with user
            ConversationState.ESCALATED,  # Validation issues
            ConversationState.FAILED
        ],
        
        ConversationState.CONFIRMING: [
            ConversationState.LISTENING,  # Wait for yes/no response
            ConversationState.CREATING_TICKET,  # User said yes
            ConversationState.CORRECTING,  # User said no
            ConversationState.ESCALATED,
            ConversationState.FAILED
        ],
        
        ConversationState.CORRECTING: [
            ConversationState.LISTENING,  # Listen to what needs correction
            ConversationState.VALIDATING,  # Re-validate after correction
            ConversationState.ESCALATED,
            ConversationState.FAILED
        ],
        
        ConversationState.CREATING_TICKET: [
            ConversationState.COMPLETED,  # Ticket created successfully
            ConversationState.FAILED  # Ticket creation failed
        ],
        
        ConversationState.ESCALATED: [
            ConversationState.COMPLETED  # Agent handles and completes
        ],
        
        # Terminal states (no transitions out)
        ConversationState.COMPLETED: [],
        ConversationState.FAILED: []
    }
    
    def __init__(self):
        """Initialize the state machine"""
        self.transition_history: List[Dict] = []
    
    def can_transition(
        self, 
        current_state: ConversationState, 
        new_state: ConversationState
    ) -> bool:
        """
        Check if transition from current_state to new_state is valid
        
        Args:
            current_state: Current conversation state
            new_state: Desired next state
            
        Returns:
            True if transition is valid, False otherwise
        """
        valid_next_states = self.VALID_TRANSITIONS.get(current_state, [])
        return new_state in valid_next_states
    
    def transition(
        self,
        current_state: ConversationState,
        new_state: ConversationState,
        reason: Optional[str] = None
    ) -> ConversationState:
        """
        Perform state transition with validation
        
        Args:
            current_state: Current conversation state
            new_state: Desired next state
            reason: Optional reason for transition (for logging)
            
        Returns:
            The new state
            
        Raises:
            StateTransitionError: If transition is invalid
        """
        # Check if transition is valid
        if not self.can_transition(current_state, new_state):
            valid_states = self.VALID_TRANSITIONS.get(current_state, [])
            raise StateTransitionError(
                f"Invalid transition from {current_state.value} to {new_state.value}. "
                f"Valid transitions: {[s.value for s in valid_states]}"
            )
        
        # Log the transition
        self.transition_history.append({
            "from": current_state.value,
            "to": new_state.value,
            "reason": reason,
            "timestamp": self._get_timestamp()
        })
        
        return new_state
    
    def get_valid_next_states(
        self, 
        current_state: ConversationState
    ) -> List[ConversationState]:
        """
        Get all valid next states from current state
        
        Args:
            current_state: Current conversation state
            
        Returns:
            List of valid next states
        """
        return self.VALID_TRANSITIONS.get(current_state, [])
    
    def is_terminal_state(self, state: ConversationState) -> bool:
        """
        Check if a state is terminal (no transitions out)
        
        Args:
            state: State to check
            
        Returns:
            True if terminal state
        """
        return len(self.VALID_TRANSITIONS.get(state, [])) == 0
    
    def get_transition_history(self) -> List[Dict]:
        """
        Get the full history of state transitions
        
        Returns:
            List of transition records
        """
        return self.transition_history
    
    def reset_history(self) -> None:
        """
        Clear transition history
        Useful when starting a new session
        """
        self.transition_history = []
    
    @staticmethod
    def _get_timestamp() -> str:
        """
        Get current timestamp as ISO string
        
        Returns:
            Timestamp string
        """
        from datetime import datetime
        return datetime.utcnow().isoformat()
    
    def validate_state_path(
        self, 
        start_state: ConversationState, 
        end_state: ConversationState
    ) -> bool:
        """
        Check if there's a valid path from start_state to end_state
        Uses breadth-first search
        
        Args:
            start_state: Starting state
            end_state: Target state
            
        Returns:
            True if path exists
        """
        if start_state == end_state:
            return True
        
        # BFS to find path
        visited = set()
        queue = [start_state]
        
        while queue:
            current = queue.pop(0)
            
            if current == end_state:
                return True
            
            if current in visited:
                continue
            
            visited.add(current)
            
            # Add all valid next states to queue
            next_states = self.get_valid_next_states(current)
            queue.extend(next_states)
        
        return False
    
    def get_state_description(self, state: ConversationState) -> str:
        """
        Get human-readable description of what happens in each state
        
        Args:
            state: State to describe
            
        Returns:
            Description string
        """
        descriptions = {
            ConversationState.INITIALIZED: "Session created, waiting to start",
            ConversationState.GREETING: "Playing welcome message to citizen",
            ConversationState.LISTENING: "Listening to citizen's speech",
            ConversationState.PROCESSING: "Converting speech to text and analyzing with NLU",
            ConversationState.COLLECTING_INFO: "Asking follow-up questions to gather missing information",
            ConversationState.VALIDATING: "Checking if all required information is collected",
            ConversationState.CONFIRMING: "Asking citizen to confirm collected information",
            ConversationState.CORRECTING: "Citizen is correcting previously provided information",
            ConversationState.CREATING_TICKET: "Creating service ticket in database",
            ConversationState.COMPLETED: "Conversation successfully completed",
            ConversationState.ESCALATED: "Escalated to human agent",
            ConversationState.FAILED: "Conversation failed due to error"
        }
        
        return descriptions.get(state, "Unknown state")
    
    def get_recommended_actions(self, state: ConversationState) -> List[str]:
        """
        Get recommended actions for each state
        Helps guide what the orchestrator should do
        
        Args:
            state: Current state
            
        Returns:
            List of recommended actions
        """
        actions = {
            ConversationState.INITIALIZED: [
                "Initialize conversation context",
                "Prepare greeting message"
            ],
            ConversationState.GREETING: [
                "Play TTS greeting",
                "Transition to listening"
            ],
            ConversationState.LISTENING: [
                "Capture audio stream",
                "Monitor for speech completion",
                "Send audio to STT service"
            ],
            ConversationState.PROCESSING: [
                "Process STT transcript",
                "Send to NLU for entity extraction",
                "Update conversation context"
            ],
            ConversationState.COLLECTING_INFO: [
                "Identify missing fields",
                "Generate appropriate question",
                "Play question via TTS",
                "Return to listening"
            ],
            ConversationState.VALIDATING: [
                "Check all required fields present",
                "Verify confidence scores",
                "Decide: collect more info or confirm"
            ],
            ConversationState.CONFIRMING: [
                "Generate confirmation message with all info",
                "Play via TTS",
                "Wait for yes/no response"
            ],
            ConversationState.CORRECTING: [
                "Ask what needs to be corrected",
                "Update specific field",
                "Re-validate"
            ],
            ConversationState.CREATING_TICKET: [
                "Generate ticket number",
                "Save to database",
                "Send confirmation to citizen"
            ],
            ConversationState.COMPLETED: [
                "Log successful completion",
                "Close session",
                "Send notifications if needed"
            ],
            ConversationState.ESCALATED: [
                "Notify available agent",
                "Transfer context",
                "Connect call"
            ],
            ConversationState.FAILED: [
                "Log error details",
                "Notify monitoring system",
                "Offer callback if possible"
            ]
        }
        
        return actions.get(state, ["No specific actions defined"])
    
    def visualize_transitions(self) -> str:
        """
        Generate a text-based visualization of valid state transitions
        Useful for documentation and debugging
        
        Returns:
            ASCII diagram of state transitions
        """
        lines = ["State Transition Map:", "=" * 60]
        
        for state, next_states in self.VALID_TRANSITIONS.items():
            if next_states:
                lines.append(f"\n{state.value}")
                for next_state in next_states:
                    lines.append(f"  └─→ {next_state.value}")
            else:
                lines.append(f"\n{state.value} (TERMINAL)")
        
        return "\n".join(lines)


# Singleton instance for use across the application
state_machine = StateMachine()


# Convenience functions for direct use
def can_transition_to(current: ConversationState, target: ConversationState) -> bool:
    """Check if transition is valid"""
    return state_machine.can_transition(current, target)


def perform_transition(
    current: ConversationState, 
    target: ConversationState, 
    reason: str = None
) -> ConversationState:
    """Perform validated state transition"""
    return state_machine.transition(current, target, reason)


def get_next_states(current: ConversationState) -> List[ConversationState]:
    """Get valid next states"""
    return state_machine.get_valid_next_states(current)


# Example usage and testing
if __name__ == "__main__":
    """
    Demo of state machine usage
    """
    print("\n" + "="*60)
    print("STATE MACHINE DEMONSTRATION")
    print("="*60)
    
    sm = StateMachine()
    
    # Test 1: Valid transition path
    print("\n1. Testing valid transition path:")
    try:
        state = ConversationState.INITIALIZED
        print(f"   Starting state: {state.value}")
        
        state = sm.transition(state, ConversationState.GREETING, "Starting conversation")
        print(f"   ✅ Transitioned to: {state.value}")
        
        state = sm.transition(state, ConversationState.LISTENING, "Ready to listen")
        print(f"   ✅ Transitioned to: {state.value}")
        
        state = sm.transition(state, ConversationState.PROCESSING, "Got speech input")
        print(f"   ✅ Transitioned to: {state.value}")
        
    except StateTransitionError as e:
        print(f"   ❌ Error: {e}")
    
    # Test 2: Invalid transition
    print("\n2. Testing invalid transition:")
    try:
        state = ConversationState.GREETING
        print(f"   Current state: {state.value}")
        print(f"   Attempting to jump to: CREATING_TICKET")
        
        state = sm.transition(state, ConversationState.CREATING_TICKET)
        print(f"   ❌ Should not reach here!")
        
    except StateTransitionError as e:
        print(f"   ✅ Correctly prevented: {e}")
    
    # Test 3: Get valid next states
    print("\n3. Valid next states from PROCESSING:")
    next_states = sm.get_valid_next_states(ConversationState.PROCESSING)
    for s in next_states:
        print(f"   → {s.value}")
    
    # Test 4: Check if path exists
    print("\n4. Path validation:")
    path_exists = sm.validate_state_path(
        ConversationState.INITIALIZED,
        ConversationState.COMPLETED
    )
    print(f"   Path from INITIALIZED to COMPLETED exists: {path_exists}")
    
    path_exists = sm.validate_state_path(
        ConversationState.COMPLETED,
        ConversationState.INITIALIZED
    )
    print(f"   Path from COMPLETED to INITIALIZED exists: {path_exists}")
    
    # Test 5: State descriptions
    print("\n5. State description:")
    desc = sm.get_state_description(ConversationState.CONFIRMING)
    print(f"   CONFIRMING: {desc}")
    
    # Test 6: Recommended actions
    print("\n6. Recommended actions for COLLECTING_INFO:")
    actions = sm.get_recommended_actions(ConversationState.COLLECTING_INFO)
    for action in actions:
        print(f"   • {action}")
    
    # Test 7: Transition history
    print("\n7. Transition history:")
    for i, trans in enumerate(sm.get_transition_history(), 1):
        print(f"   {i}. {trans['from']} → {trans['to']}")
        if trans['reason']:
            print(f"      Reason: {trans['reason']}")
    
    # Test 8: Visualize all transitions
    print("\n8. Full state transition map:")
    print(sm.visualize_transitions())
    
    print("\n" + "="*60)
    print("✅ STATE MACHINE DEMO COMPLETE")
    print("="*60 + "\n")
