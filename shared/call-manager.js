/**
 * WebRTC Call Manager
 * Handles P2P audio/video calls with auto-recording
 */

class CallManager {
  constructor(config = {}) {
    this.config = {
      iceServers: [
        { urls: ['stun:stun.l.google.com:19302'] },
        { urls: ['stun:stun1.l.google.com:19302'] }
      ],
      ...config
    };

    this.localStream = null;
    this.peerConnection = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.remoteStream = null;
    this.isCalling = false;
    this.isRecording = false;

    this.callbacks = {
      onLocalStream: null,
      onRemoteStream: null,
      onCallEnded: null,
      onRecordingReady: null,
      onError: null
    };
  }

  setCallback(event, callback) {
    if (this.callbacks.hasOwnProperty(event)) {
      this.callbacks[event] = callback;
    }
  }

  async startCall(isInitiator = false) {
    try {
      // Get local media stream
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false // Audio only for now, set to true for video
      });

      if (this.callbacks.onLocalStream) {
        this.callbacks.onLocalStream(this.localStream);
      }

      // Create peer connection
      this.peerConnection = new RTCPeerConnection({
        iceServers: this.config.iceServers
      });

      // Add local stream tracks
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      // Handle remote stream
      this.peerConnection.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind);
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }
        this.remoteStream.addTrack(event.track);

        if (this.callbacks.onRemoteStream) {
          this.callbacks.onRemoteStream(this.remoteStream);
        }

        // Auto-start recording when both streams are connected
        if (this.localStream && this.remoteStream && !this.isRecording) {
          setTimeout(() => {
            this.startRecording();
          }, 500);
        }
      };

      // Handle ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('ICE candidate:', event.candidate);
        }
      };

      // Handle connection state changes
      this.peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', this.peerConnection.connectionState);
        if (this.peerConnection.connectionState === 'failed' || 
            this.peerConnection.connectionState === 'disconnected') {
          this.endCall();
        }
      };

      this.isCalling = true;

      if (isInitiator) {
        // Create and send offer
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        return { type: 'offer', sdp: offer.sdp };
      }
    } catch (error) {
      console.error('Error starting call:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
    }
  }

  async receiveOffer(offerSDP) {
    try {
      const offer = new RTCSessionDescription({
        type: 'offer',
        sdp: offerSDP
      });

      await this.peerConnection.setRemoteDescription(offer);

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      return { type: 'answer', sdp: answer.sdp };
    } catch (error) {
      console.error('Error receiving offer:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
    }
  }

  async receiveAnswer(answerSDP) {
    try {
      const answer = new RTCSessionDescription({
        type: 'answer',
        sdp: answerSDP
      });

      await this.peerConnection.setRemoteDescription(answer);
    } catch (error) {
      console.error('Error receiving answer:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
    }
  }

  startRecording() {
    if (this.isRecording || !this.localStream || !this.remoteStream) {
      return;
    }

    try {
      // Combine both streams for recording
      const audioContext = new AudioContext();
      const localAudio = audioContext.createMediaStreamSource(this.localStream);
      const remoteAudio = audioContext.createMediaStreamSource(this.remoteStream);
      const destination = audioContext.createMediaStreamDestination();

      localAudio.connect(destination);
      remoteAudio.connect(destination);

      const combinedStream = destination.stream;

      this.mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        if (this.callbacks.onRecordingReady) {
          this.callbacks.onRecordingReady(blob);
        }
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      console.log('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      console.log('Recording stopped');
    }
  }

  async endCall() {
    if (this.isRecording) {
      this.stopRecording();
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.isCalling = false;
    this.remoteStream = null;

    if (this.callbacks.onCallEnded) {
      this.callbacks.onCallEnded();
    }
  }

  getLocalStream() {
    return this.localStream;
  }

  getRemoteStream() {
    return this.remoteStream;
  }

  isCallActive() {
    return this.isCalling;
  }

  isRecordingActive() {
    return this.isRecording;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CallManager;
}
