/**
 * Consultation Call Integration
 * High-level API for managing calls in consultations
 * Usage: Call this from student and faculty dashboards
 */

class ConsultationCallManager {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.callManager = null;
    this.signalingService = null;
    this.recordingService = null;
    this.callInterface = null;

    this.currentConsultationId = null;
    this.peerId = null;
    this.isInitiator = false;
    this.callStartTime = null;
    this.callTimerInterval = null;
  }

  /**
   * Initialize the consultation call manager
   */
  async initialize(userId, userType) {
    this.callManager = new CallManager();
    this.signalingService = new CallSignalingService(this.supabase);
    this.recordingService = new RecordingStorageService(this.supabase);

    await this.signalingService.initialize(userId, userType);

    this.setupCallManagerCallbacks();
  }

  /**
   * Start a consultation call
   */
  async startCall(consultationId, peerId, isInitiator = false) {
    try {
      this.currentConsultationId = consultationId;
      this.peerId = peerId;
      this.isInitiator = isInitiator;

      // Create call interface
      this.callInterface = new CallInterface();
      this.callInterface.render();
      this.callInterface.show();

      this.callInterface.onEndCall(() => {
        this.endCall();
      });

      // Start the call
      const result = await this.callManager.startCall(isInitiator);

      // Subscribe to signaling
      this.signalingService.subscribeToCallSignals(consultationId, {
        onOffer: (sdp, from) => this.handleOffer(sdp, from),
        onAnswer: (sdp, from) => this.handleAnswer(sdp, from),
        onIceCandidate: (candidate, from) => this.handleIceCandidate(candidate, from),
        onCallInitiated: (from) => this.handleCallInitiated(from),
        onCallEnded: () => this.handleCallEnded()
      });

      // If initiator, send offer
      if (isInitiator && result) {
        await this.signalingService.sendOffer(consultationId, peerId, result.sdp);
        this.callInterface.setStatus('Waiting for response...');
      } else if (!isInitiator) {
        this.callInterface.setStatus('Waiting for call...');
      }

      // Start call timer
      this.startCallTimer();

      return true;
    } catch (error) {
      console.error('Error starting call:', error);
      this.callInterface.setStatus('Failed to connect');
      return false;
    }
  }

  /**
   * Handle incoming offer
   */
  async handleOffer(sdp, from) {
    try {
      const answer = await this.callManager.receiveOffer(sdp);
      if (answer) {
        await this.signalingService.sendAnswer(this.currentConsultationId, from, answer.sdp);
        this.callInterface.setStatus('Connected');
      }
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }

  /**
   * Handle incoming answer
   */
  async handleAnswer(sdp, from) {
    try {
      await this.callManager.receiveAnswer(sdp);
      this.callInterface.setStatus('Connected');
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }

  /**
   * Handle ICE candidate
   */
  async handleIceCandidate(candidate, from) {
    try {
      if (this.callManager.peerConnection && candidate) {
        await this.callManager.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }

  /**
   * Handle call initiated notification
   */
  handleCallInitiated(from) {
    console.log('Call initiated by:', from);
    this.callInterface.setStatus('Incoming call...');
  }

  /**
   * Handle call ended notification
   */
  async handleCallEnded() {
    console.log('Peer ended the call');
    await this.endCall();
  }

  /**
   * End the call
   */
  async endCall() {
    try {
      // Stop recording and get blob
      if (this.callManager.isRecordingActive()) {
        this.callManager.stopRecording();
      }

      // Notify peer
      if (this.signalingService) {
        await this.signalingService.notifyCallEnded(this.currentConsultationId, this.peerId);
      }

      // End WebRTC call
      if (this.callManager) {
        this.callManager.endCall();
      }

      // Clean up timer
      if (this.callTimerInterval) {
        clearInterval(this.callTimerInterval);
      }

      // Update consultation status
      await this.updateConsultationStatus('completed');

      // Close interface
      if (this.callInterface) {
        this.callInterface.hide();
        setTimeout(() => {
          this.callInterface.destroy();
        }, 300);
      }

      // Clean up
      this.signalingService.cleanup();

      console.log('Call ended');
    } catch (error) {
      console.error('Error ending call:', error);
    }
  }

  /**
   * Start call duration timer
   */
  startCallTimer() {
    this.callStartTime = Date.now();
    this.callTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
      this.callInterface.updateTimer(elapsed);
    }, 1000);
  }

  /**
   * Set up call manager callbacks
   */
  setupCallManagerCallbacks() {
    this.callManager.setCallback('onLocalStream', (stream) => {
      console.log('Local stream ready');
    });

    this.callManager.setCallback('onRemoteStream', (stream) => {
      console.log('Remote stream received');
      if (this.callInterface) {
        this.callInterface.setStatus('Connected');
      }
    });

    this.callManager.setCallback('onRecordingReady', async (blob) => {
      console.log('Recording ready, saving...');
      try {
        const duration = this.callStartTime ? Math.floor((Date.now() - this.callStartTime) / 1000) : 0;
        const result = await this.recordingService.saveRecording(
          this.currentConsultationId,
          blob,
          { duration }
        );
        console.log('Recording saved:', result);

        // Update consultation with recording
        await this.updateConsultationRecording(result.fileName);
      } catch (error) {
        console.error('Error saving recording:', error);
      }
    });

    this.callManager.setCallback('onRecordingReady', () => {
      if (this.callInterface) {
        this.callInterface.showRecordingIndicator();
      }
    });

    this.callManager.setCallback('onError', (error) => {
      console.error('Call error:', error);
      if (this.callInterface) {
        this.callInterface.setStatus('Connection error');
      }
    });
  }

  /**
   * Update consultation to completed
   */
  async updateConsultationStatus(status) {
    try {
      const { error } = await this.supabase
        .from('consultations')
        .update({ status })
        .eq('id', this.currentConsultationId);

      if (error) {
        console.warn('Error updating consultation status:', error);
      }
    } catch (error) {
      console.error('Error updating consultation:', error);
    }
  }

  /**
   * Update consultation with recording file
   */
  async updateConsultationRecording(fileName) {
    try {
      const { error } = await this.supabase
        .from('consultations')
        .update({ recording_file: fileName })
        .eq('id', this.currentConsultationId);

      if (error) {
        console.warn('Error updating consultation recording:', error);
      }
    } catch (error) {
      console.error('Error updating consultation recording:', error);
    }
  }

  /**
   * Check call status
   */
  isCallActive() {
    return this.callManager?.isCallActive() || false;
  }

  /**
   * Check recording status
   */
  isRecording() {
    return this.callManager?.isRecordingActive() || false;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConsultationCallManager;
}
