# WebRTC Consultation Call System

Custom WebRTC implementation for automatic recording of faculty-student consultations.

## Components

### 1. **CallManager** (`call-manager.js`)
Core WebRTC peer connection management.

**Features:**
- P2P audio/video connections using WebRTC
- Automatic recording when both peers are connected
- Combines both audio streams for the recording
- Auto-recovery from connection failures

**Usage:**
```javascript
const callManager = new CallManager({
  iceServers: [...] // Optional: custom STUN/TURN servers
});

await callManager.startCall(isInitiator = false);
```

### 2. **CallInterface** (`call-interface.js`)
UI component for the call modal.

**Features:**
- Connection status display
- Call duration timer
- Recording indicator (red dot pulse animation)
- End call button
- Responsive design for mobile

**Usage:**
```javascript
const callInterface = new CallInterface();
callInterface.render();
callInterface.show();
callInterface.setStatus('Connected');
callInterface.showRecordingIndicator();
callInterface.onEndCall(() => { /* handle */ });
```

### 3. **CallSignalingService** (`call-signaling.js`)
WebRTC signaling using Supabase Realtime broadcasts.

**Features:**
- Sends SDP offers/answers
- Exchanges ICE candidates
- Call state notifications
- Broadcast channel per consultation

**Usage:**
```javascript
const signalingService = new CallSignalingService(supabaseClient);
await signalingService.initialize(userId, userType);

signalingService.subscribeToCallSignals(consultationId, {
  onOffer: (sdp, from) => { /* handle */ },
  onAnswer: (sdp, from) => { /* handle */ },
  onIceCandidate: (candidate, from) => { /* handle */ },
  onCallInitiated: (from) => { /* handle */ },
  onCallEnded: () => { /* handle */ }
});

await signalingService.sendOffer(consultationId, peerId, offerSDP);
```

### 4. **RecordingStorageService** (`recording-storage.js`)
Saves recordings to Supabase Storage and tracks metadata.

**Features:**
- Uploads WebM audio files
- Stores recording metadata in database
- Auto-creates storage bucket
- Generates signed download URLs
- RLS-protected access

**Usage:**
```javascript
const recordingService = new RecordingStorageService(supabaseClient);

const result = await recordingService.saveRecording(
  consultationId,
  recordingBlob,
  { duration: 300 }
);

const recordings = await recordingService.getConsultationRecordings(consultationId);
const url = await recordingService.getRecordingUrl(fileName);
```

### 5. **ConsultationCallManager** (`consultation-call-manager.js`)
High-level integration that coordinates all components.

**Features:**
- Single API for starting/ending calls
- Auto-manages all signaling
- Handles recording lifecycle
- Updates consultation status
- Timer management

**Usage:**
```javascript
const consultationCallManager = new ConsultationCallManager(supabaseClient);
await consultationCallManager.initialize(userId, userType);

await consultationCallManager.startCall(
  consultationId = 'uuid',
  peerId = 'peer-user-id',
  isInitiator = true
);

// Later...
await consultationCallManager.endCall();
```

## Integration Steps

### Step 1: Add Scripts to HTML
```html
<!-- Shared call components -->
<script src="/shared/call-manager.js"></script>
<script src="/shared/call-interface.js"></script>
<script src="/shared/call-signaling.js"></script>
<script src="/shared/recording-storage.js"></script>
<script src="/shared/consultation-call-manager.js"></script>

<!-- Styles -->
<link rel="stylesheet" href="/shared/call-interface.css">
```

### Step 2: Initialize in Dashboard
```javascript
// In student or faculty dashboard
let callManager;

async function initializeCallSystem() {
  callManager = new ConsultationCallManager(window.supabaseClient);
  await callManager.initialize(currentUserId, 'student'); // or 'faculty'
}

initializeCallSystem();
```

### Step 3: Start Call When Consultation Begins
```javascript
async function startConsultation(consultationId, peerUserId, isInitiator) {
  const success = await callManager.startCall(
    consultationId,
    peerUserId,
    isInitiator
  );

  if (success) {
    console.log('Call started');
  } else {
    console.log('Failed to start call');
  }
}
```

### Step 4: Setup Database
Run the migration SQL:
```sql
-- Execute consultation_recordings.sql in Supabase SQL editor
```

This creates:
- `consultation_recordings` table
- Storage bucket `consultation-recordings`
- RLS policies for access control

### Step 5: Update Consultations Table
Add recording column:
```sql
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS recording_file TEXT;
```

## API Reference

### CallManager
- `startCall(isInitiator)` - Start WebRTC connection
- `receiveOffer(sdp)` - Handle incoming offer
- `receiveAnswer(sdp)` - Handle incoming answer
- `startRecording()` - Begin recording (auto-called)
- `stopRecording()` - Stop and finalize recording
- `endCall()` - Close all connections
- `isCallActive()` - Check if call is ongoing
- `isRecordingActive()` - Check if recording active

### CallInterface
- `render()` - Create DOM elements
- `show()` - Display modal
- `hide()` - Hide modal
- `setStatus(status)` - Update connection status
- `showRecordingIndicator()` - Show red recording dot
- `updateTimer(seconds)` - Update call duration
- `onEndCall(callback)` - Set end callback
- `destroy()` - Remove from DOM

### CallSignalingService
- `initialize(userId, userType)` - Setup user info
- `subscribeToCallSignals(consultationId, callbacks)` - Listen for signals
- `sendOffer(consultationId, peerId, sdp)`
- `sendAnswer(consultationId, peerId, sdp)`
- `sendIceCandidate(consultationId, peerId, candidate)`
- `notifyCallInitiated(consultationId, peerId)`
- `notifyCallEnded(consultationId, peerId)`
- `cleanup()` - Stop listening

### RecordingStorageService
- `saveRecording(consultationId, blob, metadata)` - Upload recording
- `getConsultationRecordings(consultationId)` - List recordings
- `getRecordingUrl(fileName)` - Get download link
- `deleteRecording(fileName)`

### ConsultationCallManager
- `initialize(userId, userType)` - Setup manager
- `startCall(consultationId, peerId, isInitiator)` - Begin call
- `endCall()` - Finish call and save recording
- `isCallActive()` - Check status
- `isRecording()` - Check recording status

## Recording Details

### Format
- Type: WebM audio (Opus codec)
- Quality: 48kHz mono combine
- Size: ~1.5 MB per 30 minutes

### Storage
- Location: Supabase Storage bucket `consultation-recordings`
- Metadata: Stored in `consultation_recordings` table
- Retention: No automatic deletion (set policies as needed)

### Access
- Faculty: Can access their own consultation recordings
- Admin: Can access all recordings
- Students: Cannot access (RLS policy blocks)

### Download
```javascript
// Get signed URL (1 hour expiration)
const url = await recordingService.getRecordingUrl(fileName);

// Download or stream from the URL
window.location.href = url;
```

## Browser Compatibility

| Browser | Audio | Video | Recording |
|---------|-------|-------|-----------|
| Chrome  | ✅    | ✅    | ✅        |
| Firefox | ✅    | ✅    | ✅        |
| Safari  | ✅    | ✅    | ⚠️ Partial|
| Edge    | ✅    | ✅    | ✅        |

## Security Considerations

1. **Permissions**: Users must grant microphone access
2. **RLS Policies**: Only authorized users can access recordings
3. **Signed URLs**: Recording downloads expire after 1 hour
4. **Encryption**: Use HTTPS in production
5. **Consent**: Show notification that conversation is being recorded

## Troubleshooting

### "getUserMedia permission denied"
- Check browser permissions
- Ensure HTTPS in production
- Verify microphone is not in use

### "Connection failed"
- Check internet connectivity
- Verify firewall allows WebRTC
- Try with different STUN servers

### "Recording not saving"
- Verify Supabase Storage bucket exists
- Check RLS policies on `consultation_recordings` table
- Verify user has write permissions

### "ICE candidates not exchanged"
- Check Supabase Realtime is enabled
- Verify channel names match consultation ID
- Check browser console for signaling errors

## Performance Tips

1. **Audio Only**: Set `video: false` to reduce bandwidth
2. **TURN Servers**: Add TURN for better NAT traversal
3. **ICE Candidates**: Batch ICE candidates for efficiency
4. **Storage**: Archive old recordings to cold storage
5. **Compression**: Consider compressing WebM files

## Next Steps

1. ✅ Deploy SQL migration
2. ✅ Add scripts to HTML files
3. ✅ Initialize call manager in dashboards
4. ✅ Integrate with consultation UI
5. ✅ Test with multiple browsers
6. ✅ Set up recording playback interface
7. ✅ Configure backup/archival policies
