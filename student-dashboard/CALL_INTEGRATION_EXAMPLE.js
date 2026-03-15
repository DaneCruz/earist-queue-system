/**
 * EXAMPLE: Student Dashboard Call Integration
 * Copy patterns from this file to integrate into student-dashboard.html and dashboard.js
 */

// ============================================
// 1. HTML Integration (student-dashboard.html)
// ============================================

/*
<!-- Add these scripts before closing </body> tag -->
<script src="/shared/call-manager.js"></script>
<script src="/shared/call-interface.js"></script>
<script src="/shared/call-signaling.js"></script>
<script src="/shared/recording-storage.js"></script>
<script src="/shared/consultation-call-manager.js"></script>

<!-- Add this to <head> section -->
<link rel="stylesheet" href="/shared/call-interface.css">

<!-- Modify the consultation start button -->
<button id="startConsultationBtn" onclick="startStudentConsultation()">
  Start Consultation
</button>

<!-- Add this hidden div for receiving incoming calls -->
<div id="incomingCallNotification" style="display: none;">
  <div class="notification">
    <p>Faculty is calling...</p>
    <button onclick="acceptCall()">Accept</button>
    <button onclick="rejectCall()">Reject</button>
  </div>
</div>
*/

// ============================================
// 2. JavaScript Integration (dashboard.js)
// ============================================

let consultationCallManager;
let currentConsultationId = null;
let facultyPeerId = null;

// Initialize call system on page load
async function initializeCallSystem() {
  try {
    consultationCallManager = new ConsultationCallManager(window.supabaseClient);
    
    // Get current student user ID
    const { data: { user } } = await window.supabaseClient.auth.getUser();
    const studentId = user?.id;

    await consultationCallManager.initialize(studentId, 'student');
    console.log('Call system initialized for student:', studentId);
  } catch (error) {
    console.error('Error initializing call system:', error);
  }
}

// Start consultation and call
async function startStudentConsultation() {
  try {
    // Get selected consultation from dashboard
    const consultationId = document.getElementById('consultationSelect')?.value;
    if (!consultationId) {
      alert('Please select a consultation');
      return;
    }

    // Fetch consultation info to get faculty ID
    const { data: consultation, error } = await window.supabaseClient
      .from('consultations')
      .select('id, faculty_id, status')
      .eq('id', consultationId)
      .single();

    if (error || !consultation) {
      alert('Error retrieving consultation');
      return;
    }

    // Check if already interviewing
    if (consultation.status === 'interviewing') {
      alert('Call already in progress');
      return;
    }

    currentConsultationId = consultationId;
    facultyPeerId = consultation.faculty_id;

    // Start the call (student receives offer from faculty)
    const success = await consultationCallManager.startCall(
      consultationId,
      facultyPeerId,
      false // Student is not the initiator
    );

    if (success) {
      console.log('Waiting for faculty to call...');
    } else {
      alert('Failed to start call');
    }
  } catch (error) {
    console.error('Error starting consultation:', error);
    alert('Error starting consultation');
  }
}

// Accept incoming call
async function acceptCall() {
  try {
    const notification = document.getElementById('incomingCallNotification');
    if (notification) {
      notification.style.display = 'none';
    }

    // Continue with the incoming call setup
    console.log('Call accepted');
  } catch (error) {
    console.error('Error accepting call:', error);
  }
}

// Reject incoming call
async function rejectCall() {
  try {
    const notification = document.getElementById('incomingCallNotification');
    if (notification) {
      notification.style.display = 'none';
    }

    console.log('Call rejected');
  } catch (error) {
    console.error('Error rejecting call:', error);
  }
}

// Listen for consultation updates
function subscribeToConsultationUpdates(consultationId) {
  const channel = window.supabaseClient
    .channel(`consultation_${consultationId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'consultations',
        filter: `id=eq.${consultationId}`
      },
      (payload) => {
        console.log('Consultation updated:', payload.new);
        
        // If status changed to 'completed', close the call
        if (payload.new.status === 'completed' && consultationCallManager.isCallActive()) {
          consultationCallManager.endCall();
        }
      }
    )
    .subscribe();

  return channel;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initializeCallSystem();
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (consultationCallManager && consultationCallManager.isCallActive()) {
    consultationCallManager.endCall();
  }
});


// ============================================
// 3. Example Consultation List Display
// ============================================

/*
<div id="consultationsList">
  <label for="consultationSelect">Select Consultation:</label>
  <select id="consultationSelect">
    <option value="">-- Choose a consultation --</option>
  </select>
  <button onclick="startStudentConsultation()">Start Consultation</button>
</div>
*/

async function loadConsultations() {
  try {
    const { data: { user } } = await window.supabaseClient.auth.getUser();
    
    const { data: consultations, error } = await window.supabaseClient
      .from('consultations')
      .select('id, faculty_id, slot_time, status')
      .eq('student_id', user.id)
      .in('status', ['scheduled', 'pending'])
      .order('slot_time');

    if (error) throw error;

    const select = document.getElementById('consultationSelect');
    consultations?.forEach(consultation => {
      const option = document.createElement('option');
      option.value = consultation.id;
      option.text = `${consultation.faculty_id} - ${consultation.slot_time}`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading consultations:', error);
  }
}

loadConsultations();


// ============================================
// 4. Alternative: Auto-start Call on Page Load
// ============================================

/*
// If you want to auto-start call when student arrives at a consultation page
async function autoStartCall() {
  // Get consultation ID from URL params
  const params = new URLSearchParams(window.location.search);
  const consultationId = params.get('consultation');

  if (consultationId) {
    currentConsultationId = consultationId;

    // Fetch faculty ID
    const { data: consultation } = await window.supabaseClient
      .from('consultations')
      .select('faculty_id')
      .eq('id', consultationId)
      .single();

    if (consultation) {
      facultyPeerId = consultation.faculty_id;

      // Start call automatically
      await consultationCallManager.startCall(
        consultationId,
        facultyPeerId,
        false
      );
    }
  }
}

// Call on initialization
initializeCallSystem().then(() => autoStartCall());
*/
