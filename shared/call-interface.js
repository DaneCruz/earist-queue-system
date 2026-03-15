/**
 * Call Interface Modal
 * UI for conducting WebRTC calls with recording
 */

class CallInterface {
  constructor() {
    this.modalId = 'callModal';
    this.callManager = null;
  }

  render() {
    const modal = document.createElement('div');
    modal.id = this.modalId;
    modal.className = 'call-modal';
    modal.innerHTML = `
      <div class="call-container">
        <div class="call-header">
          <h2>Consultation Call</h2>
          <div class="call-timer">
            <span id="callDuration">00:00</span>
          </div>
        </div>

        <div class="call-status">
          <span id="callStatus" class="status-badge">Connecting...</span>
          <span id="recordingStatus" class="recording-badge" style="display: none;">
            <span class="recording-dot"></span> Recording
          </span>
        </div>

        <div class="call-content">
          <div class="audio-stream-container">
            <div class="stream-info">
              <p>🎤 Audio Connected</p>
            </div>
          </div>
        </div>

        <div class="call-actions">
          <button id="endCallBtn" class="btn btn-danger">
            <span>End Call</span>
          </button>
        </div>

        <div class="call-info">
          <small>Your audio is being recorded for quality assurance purposes.</small>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  show() {
    const modal = document.getElementById(this.modalId);
    if (modal) {
      modal.classList.add('active');
    }
  }

  hide() {
    const modal = document.getElementById(this.modalId);
    if (modal) {
      modal.classList.remove('active');
    }
  }

  setStatus(status) {
    const statusElement = document.getElementById('callStatus');
    if (statusElement) {
      statusElement.textContent = status;
      
      if (status.includes('Connected')) {
        statusElement.className = 'status-badge connected';
      } else if (status.includes('Failed')) {
        statusElement.className = 'status-badge failed';
      } else {
        statusElement.className = 'status-badge';
      }
    }
  }

  showRecordingIndicator() {
    const indicator = document.getElementById('recordingStatus');
    if (indicator) {
      indicator.style.display = 'flex';
    }
  }

  updateTimer(seconds) {
    const timerElement = document.getElementById('callDuration');
    if (timerElement) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;

      let time = '';
      if (hours > 0) {
        time = `${String(hours).padStart(2, '0')}:`;
      }
      time += `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      
      timerElement.textContent = time;
    }
  }

  onEndCall(callback) {
    const endBtn = document.getElementById('endCallBtn');
    if (endBtn) {
      endBtn.addEventListener('click', callback);
    }
  }

  destroy() {
    const modal = document.getElementById(this.modalId);
    if (modal) {
      modal.remove();
    }
  }
}
