/**
 * Call Signaling Service
 * Manages WebRTC signaling between faculty and students
 */

class CallSignalingService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.channel = null;
    this.userId = null;
    this.userType = null; // 'student' or 'faculty'
  }

  async initialize(userId, userType) {
    this.userId = userId;
    this.userType = userType;
  }

  subscribeToCallSignals(consultationId, callbacks) {
    // Create a channel for this consultation
    this.channel = this.supabase.channel(`consultation_${consultationId}`);

    this.channel
      .on('broadcast', { event: 'webrtc_signal' }, (payload) => {
        const { data } = payload;
        
        if (data.to === this.userId) {
          console.log('Received signal:', data.type);
          
          if (data.type === 'offer' && callbacks.onOffer) {
            callbacks.onOffer(data.sdp, data.from);
          } else if (data.type === 'answer' && callbacks.onAnswer) {
            callbacks.onAnswer(data.sdp, data.from);
          } else if (data.type === 'ice-candidate' && callbacks.onIceCandidate) {
            callbacks.onIceCandidate(data.candidate, data.from);
          } else if (data.type === 'call-initiated' && callbacks.onCallInitiated) {
            callbacks.onCallInitiated(data.from);
          } else if (data.type === 'call-ended' && callbacks.onCallEnded) {
            callbacks.onCallEnded();
          }
        }
      })
      .subscribe();
  }

  async sendOffer(consultationId, peerId, offerSDP) {
    if (!this.channel) return;

    await this.channel.send({
      type: 'broadcast',
      event: 'webrtc_signal',
      payload: {
        type: 'offer',
        from: this.userId,
        to: peerId,
        sdp: offerSDP,
        timestamp: new Date().toISOString()
      }
    });
  }

  async sendAnswer(consultationId, peerId, answerSDP) {
    if (!this.channel) return;

    await this.channel.send({
      type: 'broadcast',
      event: 'webrtc_signal',
      payload: {
        type: 'answer',
        from: this.userId,
        to: peerId,
        sdp: answerSDP,
        timestamp: new Date().toISOString()
      }
    });
  }

  async sendIceCandidate(consultationId, peerId, candidate) {
    if (!this.channel) return;

    await this.channel.send({
      type: 'broadcast',
      event: 'webrtc_signal',
      payload: {
        type: 'ice-candidate',
        from: this.userId,
        to: peerId,
        candidate: candidate,
        timestamp: new Date().toISOString()
      }
    });
  }

  async notifyCallInitiated(consultationId, peerId) {
    if (!this.channel) return;

    await this.channel.send({
      type: 'broadcast',
      event: 'webrtc_signal',
      payload: {
        type: 'call-initiated',
        from: this.userId,
        to: peerId,
        timestamp: new Date().toISOString()
      }
    });
  }

  async notifyCallEnded(consultationId, peerId) {
    if (!this.channel) return;

    await this.channel.send({
      type: 'broadcast',
      event: 'webrtc_signal',
      payload: {
        type: 'call-ended',
        from: this.userId,
        to: peerId,
        timestamp: new Date().toISOString()
      }
    });
  }

  cleanup() {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CallSignalingService;
}
