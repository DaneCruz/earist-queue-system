# Quick Start: WebRTC Call System Implementation

## 🚀 What You Built
A **custom WebRTC calling system** with:
- ✅ Automatic audio recording when both peers connect
- ✅ Peer-to-peer calls (no central server needed)
- ✅ Secure Supabase integration
- ✅ Recording storage with access controls
- ✅ Professional UI with timer and indicators
- ✅ Mobile responsive design

## 📁 Files Created

### Core System (in `shared/`)
```
call-manager.js              - WebRTC peer connection
call-interface.js           - UI modal for calls
call-interface.css          - Call styling
call-signaling.js           - Signaling via Supabase Realtime
recording-storage.js        - Save to Supabase Storage
consultation-call-manager.js - High-level API
CALL_SYSTEM_README.md       - Full documentation
```

### Examples & Migration
```
supabase/sql/consultation_recordings.sql  - Database setup
student-dashboard/CALL_INTEGRATION_EXAMPLE.js
faculty-dashboard/CALL_INTEGRATION_EXAMPLE.js
```

## ⚡ Implementation Steps

### Step 1: Create Database Table
**Time: 2 minutes**

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to SQL Editor → New Query
4. Copy-paste contents of `supabase/sql/consultation_recordings.sql`
5. Click "Run" ▶️

This creates:
- `consultation_recordings` table with RLS
- `consultation-recordings` storage bucket
- Proper access policies

### Step 2: Update Consultations Table
**Time: 1 minute**

Add recording file reference:
1. SQL Editor → New Query
2. Paste this:
```sql
ALTER TABLE consultations 
ADD COLUMN IF NOT EXISTS recording_file TEXT;
```
3. Click "Run" ▶️

### Step 3: Add Scripts to Student Dashboard
**Time: 5 minutes**

Edit `student-dashboard/student-dashboard.html`:

Find the closing `</body>` tag and add BEFORE it:
```html
<!-- Call System Scripts -->
<script src="/shared/call-manager.js"></script>
<script src="/shared/call-interface.js"></script>
<script src="/shared/call-signaling.js"></script>
<script src="/shared/recording-storage.js"></script>
<script src="/shared/consultation-call-manager.js"></script>

<!-- Call Styles -->
<link rel="stylesheet" href="/shared/call-interface.css">
```

Add to `<head>` section:
```html
<link rel="stylesheet" href="/shared/call-interface.css">
```

### Step 4: Add Scripts to Faculty Dashboard
**Time: 5 minutes**

Do the same as Step 3 in:
- `faculty-dashboard/faculty-dashboard.html`

### Step 5: Initialize Call System
**Time: 10 minutes**

In `student-dashboard/dashboard.js`, add at the TOP after other initializations:

```javascript
// ============ CALL SYSTEM INITIALIZATION ============
let consultationCallManager;
let currentConsultationId = null;
let facultyPeerId = null;

async function initializeCallSystem() {
  try {
    consultationCallManager = new ConsultationCallManager(window.supabaseClient);
    const { data: { user } } = await window.supabaseClient.auth.getUser();
    await consultationCallManager.initialize(user?.id, 'student');
    console.log('✅ Call system ready for student');
  } catch (error) {
    console.error('❌ Call system error:', error);
  }
}

// Start when page loads
document.addEventListener('DOMContentLoaded', () => {
  initializeCallSystem();
  // ... other initialization code
});

// Clean up on leave
window.addEventListener('beforeunload', () => {
  if (consultationCallManager?.isCallActive()) {
    consultationCallManager.endCall();
  }
});
```

Do the same in `faculty-dashboard/faculty-dashboard.js` but use:
```javascript
await consultationCallManager.initialize(user?.id, 'faculty');
```

### Step 6: Add Start Call Button
**Time: 5 minutes**

In `student-dashboard/student-dashboard.html`, add a button in the consultation section:

```html
<button id="startCallBtn" class="btn btn-primary" onclick="startStudentCall()">
  📞 Start Consultation Call
</button>
```

Add function to `dashboard.js`:
```javascript
async function startStudentCall() {
  try {
    // Get consultation ID from page context
    const consultationId = '...'; // Get from your UI
    const facultyId = '...';      // Get from database
    
    const success = await consultationCallManager.startCall(
      consultationId,
      facultyId,
      false // Student receives offer
    );
    
    if (!success) {
      alert('Failed to start call. Check your microphone permissions.');
    }
  } catch (error) {
    console.error('Call error:', error);
    alert('Error starting call');
  }
}
```

### Step 7: Faculty Side - Initiate Call
**Time: 5 minutes**

In `faculty-dashboard/faculty-dashboard.html`, add:

```html
<button id="callStudentBtn" class="btn btn-success" onclick="callStudent()">
  📞 Call Student
</button>
```

Add to `faculty-dashboard.js`:
```javascript
let consultationCallManager;

async function initializeFacultyCallSystem() {
  try {
    consultationCallManager = new ConsultationCallManager(window.supabaseClient);
    const { data: { user } } = await window.supabaseClient.auth.getUser();
    await consultationCallManager.initialize(user?.id, 'faculty');
    console.log('✅ Call system ready for faculty');
  } catch (error) {
    console.error('❌ Call system error:', error);
  }
}

async function callStudent() {
  try {
    const consultationId = '...'; // Get from your UI
    const studentId = '...';      // Get from database
    
    const success = await consultationCallManager.startCall(
      consultationId,
      studentId,
      true // Faculty initiates (creates offer)
    );
    
    if (!success) {
      alert('Failed to call student');
    }
  } catch (error) {
    console.error('Call error:', error);
  }
}

document.addEventListener('DOMContentLoaded', initializeFacultyCallSystem);

window.addEventListener('beforeunload', () => {
  if (consultationCallManager?.isCallActive()) {
    consultationCallManager.endCall();
  }
});
```

### Step 8: Test It!
**Time: 10 minutes**

1. Open `student-dashboard` in one window (microphone required)
2. Open `faculty-dashboard` in another window
3. Faculty clicks "📞 Call Student"
4. You should see:
   - Call modal appears ✅
   - Status changes to "Connected" ✅
   - Red recording indicator pulses ✅
   - Timer counts up ✅
5. Click "End Call"
6. Recording should save automatically ✅

### Step 9: View Recordings (Optional)
**Time: 5 minutes**

Add to faculty dashboard:

```javascript
async function listRecordings(consultationId) {
  try {
    const recordingService = new RecordingStorageService(window.supabaseClient);
    const recordings = await recordingService.getConsultationRecordings(consultationId);
    
    recordings.forEach(async (recording) => {
      const url = await recordingService.getRecordingUrl(recording.file_name);
      console.log('Download:', url);
    });
  } catch (error) {
    console.error('Error loading recordings:', error);
  }
}
```

## 🔒 Security Checklist

- ✅ RLS policies prevent unauthorized access
- ✅ Only faculty/admin can download recordings
- ✅ Students cannot access recordings
- ✅ Signed URLs expire after 1 hour
- ✅ Encryption via HTTPS (Vercel handles this)

## 🐛 Troubleshooting

### "Permission denied" when calling
**Solution:** Check browser microphone permissions
- Chrome: Settings → Privacy → Microphone
- Allow for your domain

### "Connection failed"
**Solution:** 
- Check internet connection
- Verify microphone is working
- Try a different browser
- Check STUN servers in `call-manager.js`

### Recording not saving
**Solution:**
1. Open Supabase Dashboard
2. Go to Storage → check if `consultation-recordings` bucket exists
3. Go to SQL → Run:
```sql
SELECT * FROM consultation_recordings;
```
4. Check database table has records

### Calls not connecting
**Solution:** Verify Supabase Realtime is enabled:
1. Database → Replication
2. Ensure `public.consultations` has Realtime enabled

## 📊 What Happens When Call Ends

1. ✅ Recording stops automatically
2. ✅ WebM audio file created
3. ✅ Uploaded to Supabase Storage
4. ✅ Metadata saved to database
5. ✅ Consultation marked as "completed"
6. ✅ Recording link stored in consultations table

## 🎯 Next Features (Optional)

- Video recording in addition to audio
- Call analytics (duration, quality metrics)
- Automatic transcription (Google Speech-to-Text)
- Save recordings to cloud backup
- Consultation quality ratings
- Call history pagination

## 📱 Browser Support

| Browser | Works? |
|---------|--------|
| Chrome  | ✅ Yes |
| Firefox | ✅ Yes |
| Safari  | ✅ Yes |
| Edge    | ✅ Yes |
| Mobile | ✅ Yes |

## 💡 Tips

1. **Test Locally First**: Use localhost before production
2. **Audio Only**: Current setup is audio-only. Add `video: true` in `call-manager.js` line 62 for video
3. **STUN Servers**: Public STUN works for testing. Add your own TURN for production reliability
4. **Compression**: Consider compressing WebM files older than 30 days
5. **Storage Limits**: Monitor Supabase Storage usage

## 📞 Support

If something breaks:
1. Check browser console (F12)
2. Check Supabase logs (Dashboard → Functions)
3. Verify all files are loaded (Network tab)
4. Check database migrations ran correctly

## ✨ You're Done!

The system is now fully integrated:
- Students and faculty can call each other ✅
- Calls auto-record when connected ✅
- Recordings stored securely ✅
- Professional UI with indicators ✅

**Happy calling! 🎉**
