/**
 * Admin Recordings Management
 * Handle loading, filtering, playing, and deleting consultation recordings
 */

class RecordingsManager {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.recordingStorageService = new RecordingStorageService(supabaseClient);
    this.allRecordings = [];
    this.filteredRecordings = [];
    this.currentPage = 1;
    this.recordsPerPage = 10;
    this.currentRecording = null;
    this.facultyList = [];
  }

  async initialize() {
    try {
      // Check authentication
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) {
        window.location.href = '/index.html';
        return;
      }

      // Check if admin (optional - for now allow any authenticated user)
      try {
        const { data: adminUser } = await this.supabase
          .from('admin_users')
          .select('id')
          .eq('id', user.id)
          .single();

        if (!adminUser) {
          console.warn('User not in admin_users table, but allowing access for now');
        }
      } catch (adminCheckError) {
        console.warn('Could not verify admin status:', adminCheckError.message);
      }

      // Load initial data
      await this.loadFacultyList();
      await this.loadRecordings();
      this.setupEventListeners();
    } catch (error) {
      console.error('Error initializing recordings manager:', error);
      alert('Error loading recordings: ' + error.message);
    }
  }

  async loadFacultyList() {
    try {
      const { data: faculty } = await this.supabase
        .from('faculty')
        .select('id, name')
        .order('name');

      this.facultyList = faculty || [];

      // Populate faculty filter
      const facultyFilter = document.getElementById('facultyFilter');
      this.facultyList.forEach(f => {
        const option = document.createElement('option');
        option.value = f.id;
        option.textContent = f.name;
        facultyFilter.appendChild(option);
      });
    } catch (error) {
      console.error('Error loading faculty list:', error);
    }
  }

  async loadRecordings() {
    try {
      const loadingSpinner = document.getElementById('loadingSpinner');
      loadingSpinner.style.display = 'flex';

      // Get all recordings with consultation details
      const { data: recordings, error } = await this.supabase
        .from('consultation_recordings')
        .select(`
          id,
          file_name,
          file_size,
          recorded_at,
          metadata,
          consultation_id,
          consultations!inner (
            id,
            faculty_id,
            student_id,
            slot_time
          )
        `)
        .order('recorded_at', { ascending: false });

      if (error) throw error;

      // Enrich with faculty and student names
      this.allRecordings = await Promise.all((recordings || []).map(async (r) => {
        const faculty = this.facultyList.find(f => f.id === r.consultations.faculty_id);
        
        // Get student name
        let studentName = r.consultations.student_id;
        try {
          const { data: student } = await this.supabase
            .from('students')
            .select('name')
            .eq('id', r.consultations.student_id)
            .single();
          
          if (student) {
            studentName = student.name;
          }
        } catch (e) {
          console.log('Could not fetch student name');
        }

        return {
          ...r,
          faculty_name: faculty?.name || 'Unknown Faculty',
          student_name: studentName,
          duration: r.metadata?.duration || 0,
          size_mb: (r.file_size / 1024 / 1024).toFixed(2)
        };
      }));

      this.filteredRecordings = [...this.allRecordings];
      this.updateStats();
      this.renderRecordings();

      loadingSpinner.style.display = 'none';
    } catch (error) {
      console.error('Error loading recordings:', error);
      loadingSpinner.style.display = 'none';
      alert('Error loading recordings');
    }
  }

  updateStats() {
    const totalRecordings = this.filteredRecordings.length;
    const totalDuration = this.filteredRecordings.reduce((sum, r) => sum + (r.duration || 0), 0);
    const totalSize = this.filteredRecordings.reduce((sum, r) => sum + r.file_size, 0);

    document.getElementById('totalRecordings').textContent = totalRecordings;
    document.getElementById('totalDuration').textContent = this.formatDuration(totalDuration * 1000);
    document.getElementById('totalSize').textContent = (totalSize / 1024 / 1024).toFixed(1) + ' MB';
  }

  renderRecordings() {
    const tbody = document.getElementById('recordingsTableBody');
    const start = (this.currentPage - 1) * this.recordsPerPage;
    const end = start + this.recordsPerPage;
    const pageRecordings = this.filteredRecordings.slice(start, end);

    if (pageRecordings.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 40px; color: #999;">
            No recordings found
          </td>
        </tr>
      `;
      document.getElementById('paginationContainer').style.display = 'none';
      return;
    }

    tbody.innerHTML = pageRecordings.map(recording => `
      <tr>
        <td class="date-cell">
          <div class="date-time">
            ${new Date(recording.recorded_at).toLocaleDateString()}
          </div>
          <div class="time-time">
            ${new Date(recording.recorded_at).toLocaleTimeString()}
          </div>
        </td>
        <td>
          <strong>${this.escapeHtml(recording.faculty_name)}</strong>
        </td>
        <td>
          ${this.escapeHtml(recording.student_name)}
        </td>
        <td>
          <span class="duration-badge">
            ${this.formatDuration(recording.duration * 1000)}
          </span>
        </td>
        <td>
          <span class="size-badge">${recording.size_mb} MB</span>
        </td>
        <td class="actions-cell">
          <button
            class="btn btn-small btn-primary"
            onclick="recordingsManager.playRecording('${recording.id}', '${recording.file_name}')"
            title="Play"
          >
            ▶️ Play
          </button>
          <button
            class="btn btn-small btn-danger"
            onclick="recordingsManager.deleteRecording('${recording.id}')"
            title="Delete"
          >
            🗑️
          </button>
        </td>
      </tr>
    `).join('');

    this.updatePagination();
  }

  updatePagination() {
    const totalPages = Math.ceil(this.filteredRecordings.length / this.recordsPerPage);
    const paginationContainer = document.getElementById('paginationContainer');

    if (totalPages > 1) {
      paginationContainer.style.display = 'flex';
      document.getElementById('pageInfo').textContent = `Page ${this.currentPage} of ${totalPages}`;
      document.getElementById('prevBtn').disabled = this.currentPage === 1;
      document.getElementById('nextBtn').disabled = this.currentPage === totalPages;
    } else {
      paginationContainer.style.display = 'none';
    }
  }

  filterRecordings() {
    let filtered = [...this.allRecordings];

    // Search filter
    const searchInput = document.getElementById('searchInput')?.value.toLowerCase() || '';
    if (searchInput) {
      filtered = filtered.filter(r =>
        r.faculty_name.toLowerCase().includes(searchInput) ||
        r.student_name.toLowerCase().includes(searchInput)
      );
    }

    // Faculty filter
    const facultyFilter = document.getElementById('facultyFilter')?.value;
    if (facultyFilter) {
      filtered = filtered.filter(r => r.consultations.faculty_id === facultyFilter);
    }

    // Date filter
    const dateFilter = document.getElementById('dateFilter')?.value;
    if (dateFilter) {
      const now = new Date();
      let startDate;

      switch (dateFilter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate = new Date(now);
          startDate.setMonth(now.getMonth() - 1);
          break;
      }

      if (startDate) {
        filtered = filtered.filter(r =>
          new Date(r.recorded_at) >= startDate
        );
      }
    }

    this.filteredRecordings = filtered;
    this.currentPage = 1;
    this.updateStats();
    this.renderRecordings();
  }

  async playRecording(recordingId, fileName) {
    try {
      const recording = this.allRecordings.find(r => r.id === recordingId);
      if (!recording) return;

      this.currentRecording = recording;

      // Get signed URL
      const url = await this.recordingStorageService.getRecordingUrl(fileName, 3600);

      // Populate modal
      document.getElementById('playbackTitle').textContent = 
        `Call: ${recording.faculty_name} ↔ ${recording.student_name}`;
      document.getElementById('playbackFaculty').textContent = recording.faculty_name;
      document.getElementById('playbackStudent').textContent = recording.student_name;
      document.getElementById('playbackDate').textContent = 
        new Date(recording.recorded_at).toLocaleString();
      document.getElementById('playbackDuration').textContent = 
        this.formatDuration(recording.duration * 1000);

      // Set audio source
      const audioPlayer = document.getElementById('audioPlayer');
      audioPlayer.src = url;

      // Show modal
      document.getElementById('playbackModal').style.display = 'flex';
    } catch (error) {
      console.error('Error playing recording:', error);
      alert('Error loading recording');
    }
  }

  async downloadRecording() {
    try {
      if (!this.currentRecording) return;

      const url = await this.recordingStorageService.getRecordingUrl(
        this.currentRecording.file_name,
        3600
      );

      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.currentRecording.faculty_name}_${this.currentRecording.student_name}_${new Date(this.currentRecording.recorded_at).toISOString().split('T')[0]}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading recording:', error);
      alert('Error downloading recording');
    }
  }

  deleteRecording(recordingId) {
    const recording = this.allRecordings.find(r => r.id === recordingId);
    if (!recording) return;

    this.currentRecording = recording;
    document.getElementById('deleteConfirmModal').style.display = 'flex';
  }

  async confirmDelete() {
    try {
      if (!this.currentRecording) return;

      const fileName = this.currentRecording.file_name;

      // Delete from storage
      const { error: storageError } = await this.supabase.storage
        .from('consultation-recordings')
        .remove([fileName]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await this.supabase
        .from('consultation_recordings')
        .delete()
        .eq('id', this.currentRecording.id);

      if (dbError) throw dbError;

      alert('Recording deleted successfully');
      closeDeleteConfirmModal();
      closePlaybackModal();
      await this.loadRecordings();
    } catch (error) {
      console.error('Error deleting recording:', error);
      alert('Error deleting recording');
    }
  }

  setupEventListeners() {
    // Search
    document.getElementById('searchInput')?.addEventListener('input', () => {
      this.filterRecordings();
    });

    // Faculty filter
    document.getElementById('facultyFilter')?.addEventListener('change', () => {
      this.filterRecordings();
    });

    // Date filter
    document.getElementById('dateFilter')?.addEventListener('change', () => {
      this.filterRecordings();
    });

    // Refresh button
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
      this.loadRecordings();
    });

    // Pagination
    document.getElementById('prevBtn')?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.renderRecordings();
      }
    });

    document.getElementById('nextBtn')?.addEventListener('click', () => {
      const totalPages = Math.ceil(this.filteredRecordings.length / this.recordsPerPage);
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.renderRecordings();
      }
    });

    // Download button
    document.getElementById('downloadPlaybackBtn')?.addEventListener('click', () => {
      this.downloadRecording();
    });

    // Delete button
    document.getElementById('deletePlaybackBtn')?.addEventListener('click', () => {
      this.deleteRecording(this.currentRecording.id);
    });

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      logoutAdmin();
    });
  }

  formatDuration(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

let recordingsManager;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const supabaseClient = window.supabaseClient;
    recordingsManager = new RecordingsManager(supabaseClient);
    await recordingsManager.initialize();
  } catch (error) {
    console.error('Error initializing page:', error);
    alert('Error loading page');
  }
});

// Modal functions
function closePlaybackModal() {
  document.getElementById('playbackModal').style.display = 'none';
  document.getElementById('audioPlayer').pause();
  document.getElementById('audioPlayer').src = '';
}

function closeDeleteConfirmModal() {
  document.getElementById('deleteConfirmModal').style.display = 'none';
}

// Logout function
async function logoutAdmin() {
  try {
    const { error } = await window.supabaseClient.auth.signOut();
    if (error) throw error;
    window.location.href = '/index.html';
  } catch (error) {
    console.error('Error logging out:', error);
    alert('Error logging out');
  }
}
