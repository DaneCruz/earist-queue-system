/**
 * EXAMPLE: Faculty Dashboard Call Integration
 * Copy patterns from this file to integrate into faculty-dashboard.html and faculty-dashboard.js
 */

// ============================================
// 1. HTML Integration (faculty-dashboard.html)
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

<!-- Add button in faculty consultation dashboard -->
<button id="initiateFacultyCallBtn" onclick="initiateFacultyCall()" class="btn btn-primary">
  <span>📞</span> Call Student
</button>

<!-- Call history section -->
<div id="recordingsList" style="margin-top: 20px;">
  <h3>Call Recordings</h3>
  <div id="recordingsContainer"></div>
</div>
*/

// ============================================
// 2. JavaScript Integration (faculty-dashboard.js)
// ============================================

let consultationCallManager;
let recordingStorageService;
let currentConsultationId = null;
let studentPeerId = null;

// Initialize call system on page load
async function initializeFacultyCallSystem() {
  try {
    consultationCallManager = new ConsultationCallManager(window.supabaseClient);
    recordingStorageService = new RecordingStorageService(window.supabaseClient);

    // Get current faculty user ID
    const { data: { user } } = await window.supabaseClient.auth.getUser();
    const facultyId = user?.id;

    await consultationCallManager.initialize(facultyId, 'faculty');
    console.log('Call system initialized for faculty:', facultyId);
  } catch (error) {
    console.error('Error initializing call system:', error);
  }
}

// Initiate call from faculty side (faculty is initiator)
async function initiateFacultyCall() {
  try {
    // Get selected consultation
    const consultationId = document.getElementById('consultationSelect')?.value;
    if (!consultationId) {
      alert('Please select a student consultation');
      return;
    }

    // Fetch consultation info
    const { data: consultation, error } = await window.supabaseClient
      .from('consultations')
      .select('id, student_id, status')
      .eq('id', consultationId)
      .single();

    if (error || !consultation) {
      alert('Error retrieving consultation');
      return;
    }

    // Check if already in call
    if (consultation.status === 'interviewing') {
      alert('Call already in progress');
      return;
    }

    currentConsultationId = consultationId;
    studentPeerId = consultation.student_id;

    // Faculty initiates the call (creates offer)
    const success = await consultationCallManager.startCall(
      consultationId,
      studentPeerId,
      true // Faculty is the initiator
    );

    if (success) {
      console.log('Call initiated with student');
    } else {
      alert('Failed to initiate call');
    }
  } catch (error) {
    console.error('Error initiating call:', error);
    alert('Error initiating call');
  }
}

// Load available consultations for faculty
async function loadFacultyConsultations() {
  try {
    const { data: { user } } = await window.supabaseClient.auth.getUser();

    const { data: consultations, error } = await window.supabaseClient
      .from('consultations')
      .select('id, student_id, slot_time, status')
      .eq('faculty_id', user.id)
      .in('status', ['scheduled', 'pending'])
      .order('slot_time');

    if (error) throw error;

    const select = document.getElementById('consultationSelect');
    consultations?.forEach(consultation => {
      const option = document.createElement('option');
      option.value = consultation.id;
      option.text = `Student: ${consultation.student_id} - ${consultation.slot_time}`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading consultations:', error);
  }
}

// Load and display recordings for a consultation
async function loadRecordings(consultationId) {
  try {
    const recordings = await recordingStorageService.getConsultationRecordings(consultationId);

    const container = document.getElementById('recordingsContainer');
    container.innerHTML = '';

    if (recordings.length === 0) {
      container.innerHTML = '<p>No recordings available</p>';
      return;
    }

    recordings.forEach(recording => {
      const div = document.createElement('div');
      div.className = 'recording-item';
      div.innerHTML = `
        <div class="recording-info">
          <p><strong>${new Date(recording.recorded_at).toLocaleString()}</strong></p>
          <p>Duration: ${Math.floor(recording.metadata?.duration || 0) / 60} minutes</p>
          <p>Size: ${(recording.file_size / 1024 / 1024).toFixed(2)} MB</p>
        </div>
        <div class="recording-actions">
          <button onclick="downloadRecording('${recording.file_name}')">Download</button>
          <button onclick="deleteRecording('${recording.file_name}')">Delete</button>
        </div>
      `;
      container.appendChild(div);
    });
  } catch (error) {
    console.error('Error loading recordings:', error);
  }
}

// Download a recording
async function downloadRecording(fileName) {
  try {
    const url = await recordingStorageService.getRecordingUrl(fileName);
    if (url) {
      window.location.href = url;
    } else {
      alert('Failed to get download link');
    }
  } catch (error) {
    console.error('Error downloading recording:', error);
    alert('Error downloading recording');
  }
}

// Delete a recording (admin only)
async function deleteRecording(fileName) {
  try {
    if (!confirm('Are you sure you want to delete this recording?')) {
      return;
    }

    const success = await recordingStorageService.deleteRecording(fileName);
    if (success) {
      alert('Recording deleted');
      // Reload recordings
      if (currentConsultationId) {
        loadRecordings(currentConsultationId);
      }
    } else {
      alert('Failed to delete recording');
    }
  } catch (error) {
    console.error('Error deleting recording:', error);
    alert('Error deleting recording');
  }
}

// Subscribe to consultation updates
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

        // If recording file was added, update the display
        if (payload.new.recording_file) {
          console.log('Recording completed:', payload.new.recording_file);
          loadRecordings(consultationId);
        }

        // If call ended, show completion message
        if (payload.new.status === 'completed') {
          if (consultationCallManager.isCallActive()) {
            consultationCallManager.endCall();
          }
          alert('Consultation completed');
        }
      }
    )
    .subscribe();

  return channel;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initializeFacultyCallSystem();
  loadFacultyConsultations();
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (consultationCallManager && consultationCallManager.isCallActive()) {
    consultationCallManager.endCall();
  }
});

// When consultation is selected, load its recordings
document.addEventListener('change', (e) => {
  if (e.target.id === 'consultationSelect') {
    currentConsultationId = e.target.value;
    if (currentConsultationId) {
      loadRecordings(currentConsultationId);
      subscribeToConsultationUpdates(currentConsultationId);
    }
  }
});


// ============================================
// 3. Styling for Recording Items
// ============================================

/*
<style>
.recording-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 10px;
}

.recording-info p {
  margin: 5px 0;
  color: #333;
}

.recording-actions {
  display: flex;
  gap: 10px;
}

.recording-actions button {
  padding: 8px 12px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.recording-actions button:hover {
  background: #764ba2;
}

.recording-actions button.danger {
  background: #f44336;
}
</style>
*/


// ============================================
// 4. Admin Dashboard - View All Recordings
// ============================================

/*
// Add to admin-dashboard.js
async function loadAllRecordings() {
  try {
    const { data: recordings, error } = await window.supabaseClient
      .from('consultation_recordings')
      .select('*, consultations(id, faculty_id, student_id, slot_time)')
      .order('recorded_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const container = document.getElementById('allRecordingsContainer');
    container.innerHTML = '';

    recordings?.forEach(recording => {
      const consultation = recording.consultations;
      const div = document.createElement('div');
      div.className = 'recording-item';
      div.innerHTML = `
        <div>
          <p><strong>${consultation?.faculty_id}</strong> with <strong>${consultation?.student_id}</strong></p>
          <p>${new Date(recording.recorded_at).toLocaleString()}</p>
          <p>Duration: ${Math.floor(recording.metadata?.duration || 0) / 60} min</p>
        </div>
        <div>
          <button onclick="downloadRecording('${recording.file_name}')">Download</button>
          <button class="danger" onclick="deleteRecording('${recording.file_name}')">Delete</button>
        </div>
      `;
      container.appendChild(div);
    });
  } catch (error) {
    console.error('Error loading recordings:', error);
  }
}

// Call on page load
document.addEventListener('DOMContentLoaded', loadAllRecordings);
*/
