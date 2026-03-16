const SUPABASE_URL = 'https://yhryfoimpqzmaaymsaat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6AxrmJlwC7pTgRevGgjTtA_F5b2F8Eb';
const LOGIN_PAGE_PATH = '../index.html';
const FACULTY_TABLE = 'faculty';
const CONSULTATIONS_TABLE = 'consultations';
const STUDENTS_TABLE = 'students';
const START_INTERVIEW_FUNCTION = 'start-interview';
const QUEUE_EMAIL_FUNCTION = 'send-queue-email';
const ACTIVITY_LOGS_TABLE = 'activity_logs';
const HISTORY_FILTERS = ['today', 'week', 'all'];
const DEFAULT_TIME_WINDOW = ['08:00', '11:00'];
const MAX_WINDOW_MINUTES = 180;
const NO_SHOW_TIMEOUT_MINUTES = 10;
const STATUS_EMAIL_NO_SHOW_COLUMN = 'no_show_email_sent_at';
const STATUS_EMAIL_COMPLETED_COLUMN = 'completed_email_sent_at';
const ACTION_RETRY_LIMIT = 2;
const ACTION_RETRY_DELAY_MS = 400;

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;
let currentFaculty = null;
let facultyRealtimeChannel = null;
let consultationsRealtimeChannel = null;
let queueReloadTimer = null;
let selectedHistoryFilter = 'today';
let interviewCountdownTimer = null;
let statusEmailJobRunning = false;
const statusActionInFlight = new Set();
let authStateSubscription = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!supabaseClient) {
    setStatus('Supabase SDK failed to load. Refresh the page and try again.', 'error');
    return;
  }

  const logoutButton = document.getElementById('faculty-logout-btn');
  const refreshButton = document.getElementById('refresh-queue-btn');
  const availabilitySelect = document.getElementById('faculty-availability-select');
  const historyFilterSelect = document.getElementById('history-filter');
  const saveWindowButton = document.getElementById('save-availability-window-btn');
  const nextStudentButton = document.getElementById('next-student-btn');

  if (logoutButton) {
    logoutButton.addEventListener('click', logoutFaculty);
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      void loadConsultationQueue();
    });
  }

  if (availabilitySelect) {
    availabilitySelect.addEventListener('change', () => {
      void updateFacultyAvailability(availabilitySelect.value);
    });
  }

  if (historyFilterSelect) {
    historyFilterSelect.addEventListener('change', () => {
      const next = historyFilterSelect.value;
      selectedHistoryFilter = HISTORY_FILTERS.includes(next) ? next : 'today';
      void loadConsultationQueue();
    });
  }

  if (saveWindowButton) {
    saveWindowButton.addEventListener('click', () => {
      void saveAvailabilityWindow();
    });
  }

  if (nextStudentButton) {
    nextStudentButton.addEventListener('click', () => {
      void startNextPendingInterview(nextStudentButton);
    });
  }

  void enforceFacultySession();
  window.addEventListener('beforeunload', cleanupRealtimeSubscriptions);
});

async function enforceFacultySession() {
  if (!supabaseClient) {
    return;
  }

  const { data, error } = await supabaseClient.auth.getUser();
  if (error || !data?.user) {
    window.location.href = LOGIN_PAGE_PATH;
    return;
  }

  const userEmail = data.user.email || '';
  const emailLabel = document.getElementById('faculty-email');
  if (emailLabel) {
    emailLabel.textContent = userEmail || 'Faculty account';
  }

  const facultyRecord = await getFacultyRecord(userEmail);
  if (!facultyRecord) {
    setStatus('This Gmail is not registered in the faculty table.', 'error');
    await logoutFaculty();
    return;
  }

  currentFaculty = facultyRecord;
  const nameLabel = document.getElementById('faculty-name');
  if (nameLabel) {
    nameLabel.textContent = `Signed in as ${facultyRecord.full_name || facultyRecord.name || userEmail}`;
  }
  initializeAvailabilityControl();
  startRealtimeSubscriptions();

  await loadConsultationQueue();
}

async function logoutFaculty() {
  if (!supabaseClient) {
    window.location.href = LOGIN_PAGE_PATH;
    return;
  }

  cleanupRealtimeSubscriptions();
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    alert('Logout failed: ' + error.message);
    return;
  }

  window.location.href = LOGIN_PAGE_PATH;
}

async function getFacultyRecord(email) {
  let query = await supabaseClient
    .from(FACULTY_TABLE)
    .select('id, email, full_name, name, status, is_available, available_start, available_end, created_at')
    .ilike('email', email)
    .order('created_at', { ascending: false })
    .limit(1);

  if (query.error && looksLikeMissingColumnError(query.error.message)) {
    query = await supabaseClient
      .from(FACULTY_TABLE)
      .select('id, email, full_name, name, status, is_available, created_at')
      .ilike('email', email)
      .order('created_at', { ascending: false })
      .limit(1);
    if (!query.error && Array.isArray(query.data)) {
      query.data = query.data.map((row) => ({
        ...row,
        available_start: null,
        available_end: null,
      }));
    }
  }

  const { data, error } = query;

  if (error) {
    console.error('Faculty table lookup error:', error.message);
    setStatus('Cannot read faculty table. Check RLS policy for faculty.', 'error');
    return null;
  }

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return data[0];
}

async function loadConsultationQueue() {
  if (!currentFaculty?.id) {
    return;
  }

  setStatus('Loading queue...', '');

  const historyRange = getHistoryRange(selectedHistoryFilter);
  let baseQuery = supabaseClient
    .from(CONSULTATIONS_TABLE)
    .select('id, student_number, concern, preferred_time, status, meet_link, interview_started_at, queue_date, created_at, no_show_email_sent_at, completed_email_sent_at')
    .eq('faculty_id', currentFaculty.id)
    .order('created_at', { ascending: true });

  if (historyRange.startDate && historyRange.endDate) {
    baseQuery = baseQuery.gte('queue_date', historyRange.startDate).lte('queue_date', historyRange.endDate);
  }

  let query = await baseQuery;

  if (query.error && String(query.error.message || '').toLowerCase().includes('meet_link')) {
    let fallbackQuery = supabaseClient
      .from(CONSULTATIONS_TABLE)
      .select('id, student_number, concern, preferred_time, status, queue_date, created_at, no_show_email_sent_at, completed_email_sent_at')
      .eq('faculty_id', currentFaculty.id)
      .order('created_at', { ascending: true });

    if (historyRange.startDate && historyRange.endDate) {
      fallbackQuery = fallbackQuery.gte('queue_date', historyRange.startDate).lte('queue_date', historyRange.endDate);
    }

    query = await fallbackQuery;

    if (!query.error && Array.isArray(query.data)) {
      query.data = query.data.map((item) => ({ ...item, meet_link: null }));
    }
  }

  if (
    query.error &&
    String(query.error.message || '').toLowerCase().includes('no_show_email_sent_at')
  ) {
    let fallbackQueryNoEmailFlags = supabaseClient
      .from(CONSULTATIONS_TABLE)
      .select('id, student_number, concern, preferred_time, status, meet_link, interview_started_at, queue_date, created_at')
      .eq('faculty_id', currentFaculty.id)
      .order('created_at', { ascending: true });

    if (historyRange.startDate && historyRange.endDate) {
      fallbackQueryNoEmailFlags = fallbackQueryNoEmailFlags.gte('queue_date', historyRange.startDate).lte('queue_date', historyRange.endDate);
    }

    query = await fallbackQueryNoEmailFlags;
    if (!query.error && Array.isArray(query.data)) {
      query.data = query.data.map((item) => ({
        ...item,
        no_show_email_sent_at: null,
        completed_email_sent_at: null,
      }));
    }
  }

  if (query.error && String(query.error.message || '').toLowerCase().includes('queue_date')) {
    let fallbackQueryNoDate = supabaseClient
      .from(CONSULTATIONS_TABLE)
      .select('id, student_number, concern, preferred_time, status, meet_link, created_at, no_show_email_sent_at, completed_email_sent_at')
      .eq('faculty_id', currentFaculty.id)
      .order('created_at', { ascending: true });

    query = await fallbackQueryNoDate;

    if (!query.error && Array.isArray(query.data)) {
      query.data = filterItemsByCreatedAtRange(query.data, historyRange);
      query.data = query.data.map((item) => ({ ...item, queue_date: null }));
    }
  }

  const { data, error } = query;

  if (error) {
    console.error('Consultations query error:', error.message);
    setStatus('Cannot read consultations table. Check table name and RLS policy.', 'error');
    renderQueue([]);
    updateQueueMeta(0);
    return;
  }

  const items = data || [];
  const studentMap = await getStudentInfoMap(items.map((item) => item.student_number).filter(Boolean));
  renderQueue(items, studentMap);
  void processAutomaticStatusEmails(items, studentMap);
  updateQueueMeta((items || []).length);
  setStatus('', '');
}

function updateQueueMeta(total) {
  const meta = document.getElementById('queue-meta');
  if (!meta) {
    return;
  }
  const suffix = getHistoryLabel(selectedHistoryFilter);
  meta.textContent = total > 0 ? `${total} consultation(s) in ${suffix}` : `No consultations in ${suffix}.`;
}

function renderQueue(items, studentMap) {
  const container = document.getElementById('queue-list');
  if (!container) {
    return;
  }

  if (!items.length) {
    container.innerHTML = '<p class="muted-text">No queue items found.</p>';
    return;
  }

  container.innerHTML = '';
  const pendingRankMap = new Map();
  let pendingCounter = 0;
  items.forEach((entry) => {
    if ((entry.status || '').toLowerCase() === 'pending') {
      pendingCounter += 1;
      pendingRankMap.set(String(entry.id), pendingCounter);
    }
  });

  items.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'queue-item';

    const status = item.status || 'pending';
    const student = studentMap[item.student_number] || {};
    const displayStart = item.interview_started_at || item.created_at || '';
    const pendingRank = pendingRankMap.get(String(item.id)) || null;
    card.innerHTML = `
      <h3>Student ${item.student_number || 'Unknown'}</h3>
      <p><strong>Queue #:</strong> ${index + 1}${
        pendingRank ? ` <span class="queue-rank-badge">Pending #${pendingRank}</span>` : ''
      }</p>
      <p><strong>Name:</strong> ${student.full_name || 'N/A'}</p>
      <p><strong>Email:</strong> ${student.email || 'N/A'}</p>
      <p><strong>Phone:</strong> ${student.phone_number || 'N/A'}</p>
      <p><strong>Concern:</strong> ${item.concern || 'N/A'}</p>
      <p><strong>Preferred Time:</strong> ${item.preferred_time || 'N/A'}</p>
      <p><strong>Status:</strong> <span class="pill ${status}">${status}</span></p>
      ${
        status === 'interviewing'
          ? `<p class="interview-countdown" data-start-ts="${displayStart}"><strong>Auto no-show in:</strong> --:--</p>`
          : ''
      }
      ${
        item.meet_link
          ? (
            status === 'interviewing'
              ? `<p><strong>Meet Link:</strong> <a href="${item.meet_link}" target="_blank" rel="noopener noreferrer">Open Interview Room</a></p>`
              : `<p><strong>Meet Link:</strong> <span class="meet-link-closed">Interview closed</span></p>`
          )
          : ''
      }
      <div class="queue-actions">
        <button class="action-btn start" data-id="${item.id}" data-status="interviewing" type="button">Start Interview</button>
        <button class="action-btn done" data-id="${item.id}" data-status="completed" type="button">Mark Completed</button>
        <button class="action-btn no-show" data-id="${item.id}" data-status="no_show" type="button">No Show</button>
        <button class="action-btn cancel" data-id="${item.id}" data-status="cancelled" type="button">Cancel</button>
      </div>
    `;
    container.appendChild(card);
});

container.querySelectorAll('.action-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      const target = event.currentTarget;
      const id = target.getAttribute('data-id');
      const status = target.getAttribute('data-status');
      if (!id || !status) {
        return;
      }
      const row = items.find((entry) => String(entry.id) === String(id)) || null;
      const student = row ? (studentMap[row.student_number] || {}) : {};
      const context = {
        studentNumber: row?.student_number || '',
        studentEmail: student.email || '',
        studentName: student.full_name || row?.student_number || 'Student',
        facultyName: currentFaculty?.full_name || currentFaculty?.name || 'Faculty',
        concern: row?.concern || 'N/A',
        preferredTime: row?.preferred_time || 'N/A',
      };
      await updateConsultationStatus(id, status, target, context);
    });
  });

  startInterviewCountdowns();
}

async function updateConsultationStatus(consultationId, nextStatus, triggerButton, context = null) {
  const actionKey = `${consultationId}:${nextStatus}`;
  if (statusActionInFlight.has(actionKey)) {
    return;
  }
  statusActionInFlight.add(actionKey);

  if (nextStatus === 'interviewing') {
    try {
      await startInterviewFlow(consultationId, triggerButton);
    } finally {
      statusActionInFlight.delete(actionKey);
    }
    return;
  }

  const updatePayload = { status: nextStatus };
  if (nextStatus === 'no_show') {
    updatePayload.no_show_marked_at = new Date().toISOString();
  }

  const actionButtons = getSiblingActionButtons(triggerButton);
  const restoreButtons = setButtonsLoading(actionButtons, triggerButton, 'Saving...');
  const { error } = await withRetry(async () => (
    supabaseClient
      .from(CONSULTATIONS_TABLE)
      .update(updatePayload)
      .eq('id', consultationId)
      .eq('faculty_id', currentFaculty.id)
  ));

  if (error) {
    console.error('Status update error:', error.message);
    setStatus('Failed to update status. Check update policy in consultations.', 'error');
    restoreButtons();
    statusActionInFlight.delete(actionKey);
    return;
  }

  if (nextStatus === 'no_show' && context) {
    const sent = await sendNoShowEmailNotification(context);
    if (sent) {
      await markStatusEmailSent(consultationId, STATUS_EMAIL_NO_SHOW_COLUMN);
    }
  }
  if (nextStatus === 'completed' && context) {
    const sent = await sendCompletedEmailNotification(context);
    if (sent) {
      await markStatusEmailSent(consultationId, STATUS_EMAIL_COMPLETED_COLUMN);
    }
  }

  void safeCreateActivityLog({
    actorRole: 'faculty',
    action: 'consultation_status_updated',
    targetType: 'consultation',
    targetId: consultationId,
    details: {
      nextStatus,
      studentNumber: context?.studentNumber || null,
      concern: context?.concern || null,
      preferredTime: context?.preferredTime || null,
    },
  });
  setStatus(`Status updated to "${nextStatus}".`, 'success');
  restoreButtons();
  statusActionInFlight.delete(actionKey);
  await loadConsultationQueue();
}

async function startInterviewFlow(consultationId, triggerButton) {
  const actionButtons = getSiblingActionButtons(triggerButton);
  const restoreButtons = setButtonsLoading(actionButtons, triggerButton, 'Starting...');
  setStatus('Starting interview session...', '');

  const { data, error } = await withRetry(async () => (
    supabaseClient.functions.invoke(START_INTERVIEW_FUNCTION, {
      body: {
        consultationId,
        facultyId: currentFaculty?.id || null,
        facultyEmail: currentFaculty?.email || '',
      },
    })
  ));

  if (error) {
    console.error('Start interview function error:', error.message);
    setStatus('Failed to start interview. Check start-interview function logs.', 'error');
    restoreButtons();
    return;
  }

  if (!data?.ok) {
    const message = data?.error || 'Failed to start interview.';
    setStatus(String(message), 'error');
    restoreButtons();
    return;
  }

  if (data?.meetLink) {
    setStatus('Interview started. Meeting link sent to student.', 'success');
  } else {
    setStatus('Interview started. Student notified by email.', 'success');
  }
  void safeCreateActivityLog({
    actorRole: 'faculty',
    action: 'interview_started',
    targetType: 'consultation',
    targetId: consultationId,
    details: { hasMeetLink: Boolean(data?.meetLink) },
  });

  restoreButtons();
  await loadConsultationQueue();
}

async function updateFacultyAvailability(nextStatus) {
  if (!currentFaculty?.id) {
    return;
  }

  const normalizedStatus = ['available', 'busy', 'offline'].includes(nextStatus) ? nextStatus : 'offline';
  const { error } = await supabaseClient
    .from(FACULTY_TABLE)
    .update({
      status: normalizedStatus,
      is_available: normalizedStatus === 'available',
    })
    .eq('id', currentFaculty.id);

  if (error) {
    console.error('Faculty availability update failed:', error.message);
    setStatus('Failed to update availability.', 'error');
    return;
  }

  currentFaculty = {
    ...currentFaculty,
    status: normalizedStatus,
    is_available: normalizedStatus === 'available',
  };
  void safeCreateActivityLog({
    actorRole: 'faculty',
    action: 'availability_status_updated',
    targetType: 'faculty',
    targetId: currentFaculty.id,
    details: { status: normalizedStatus },
  });
  setStatus(`Availability updated to "${normalizedStatus}".`, 'success');
}

async function getStudentInfoMap(studentNumbers) {
  const uniqueNumbers = Array.from(new Set(studentNumbers)).filter(Boolean);
  if (!uniqueNumbers.length) {
    return {};
  }

  const { data, error } = await supabaseClient
    .from(STUDENTS_TABLE)
    .select('student_number, full_name, email, phone_number')
    .in('student_number', uniqueNumbers);

  if (error) {
    console.error('Student info lookup failed:', error.message);
    return {};
  }

  return (data || []).reduce((acc, row) => {
    acc[row.student_number] = row;
    return acc;
  }, {});
}

function initializeAvailabilityControl() {
  const availabilitySelect = document.getElementById('faculty-availability-select');
  if (!availabilitySelect) {
    return;
  }
  availabilitySelect.value = currentFaculty?.status || 'offline';

  const startInput = document.getElementById('availability-start');
  const endInput = document.getElementById('availability-end');
  const [fallbackStart, fallbackEnd] = DEFAULT_TIME_WINDOW;
  if (startInput) {
    startInput.value = normalizeTimeValue(currentFaculty?.available_start) || fallbackStart;
  }
  if (endInput) {
    endInput.value = normalizeTimeValue(currentFaculty?.available_end) || fallbackEnd;
  }
}

async function saveAvailabilityWindow() {
  if (!currentFaculty?.id) {
    return;
  }

  const startInput = document.getElementById('availability-start');
  const endInput = document.getElementById('availability-end');
  const startValue = String(startInput?.value || '').trim();
  const endValue = String(endInput?.value || '').trim();

  if (!startValue || !endValue) {
    setStatus('Please select both start and end time.', 'error');
    return;
  }

  const startMinutes = toMinutes(startValue);
  const endMinutes = toMinutes(endValue);
  if (endMinutes <= startMinutes) {
    setStatus('End time must be later than start time.', 'error');
    return;
  }

  const duration = endMinutes - startMinutes;
  if (duration > MAX_WINDOW_MINUTES) {
    setStatus('Maximum consultation window is 3 hours.', 'error');
    return;
  }
  if (duration < 20) {
    setStatus('Minimum window is 20 minutes.', 'error');
    return;
  }

  const { error } = await supabaseClient
    .from(FACULTY_TABLE)
    .update({
      available_start: startValue,
      available_end: endValue,
    })
    .eq('id', currentFaculty.id);

  if (error) {
    console.error('Availability window update failed:', error.message);
    if (looksLikeMissingColumnError(error.message)) {
      setStatus('Schedule columns are missing. Add available_start and available_end in faculty table.', 'error');
    } else if (isPermissionError(error)) {
      setStatus('Not allowed to update faculty row (RLS). Add/update policy for faculty self-update.', 'error');
    } else {
      setStatus(`Failed to save time window: ${error.message}`, 'error');
    }
    return;
  }

  currentFaculty = {
    ...currentFaculty,
    available_start: startValue,
    available_end: endValue,
  };
  void safeCreateActivityLog({
    actorRole: 'faculty',
    action: 'availability_window_saved',
    targetType: 'faculty',
    targetId: currentFaculty.id,
    details: { availableStart: startValue, availableEnd: endValue },
  });
  setStatus(`Availability window saved: ${formatTimeForDisplay(startValue)} - ${formatTimeForDisplay(endValue)}.`, 'success');
}

async function startNextPendingInterview(triggerButton) {
  if (!currentFaculty?.id) {
    return;
  }

  const restoreButton = setSingleButtonLoading(triggerButton, 'Calling...');
  setStatus('Looking for next pending student...', '');

  const today = getManilaDateKey();
  let interviewingQuery = await supabaseClient
    .from(CONSULTATIONS_TABLE)
    .select('id, queue_date, created_at')
    .eq('faculty_id', currentFaculty.id)
    .eq('status', 'interviewing')
    .eq('queue_date', today)
    .limit(1);

  if (interviewingQuery.error && String(interviewingQuery.error.message || '').toLowerCase().includes('queue_date')) {
    interviewingQuery = await supabaseClient
      .from(CONSULTATIONS_TABLE)
      .select('id, created_at')
      .eq('faculty_id', currentFaculty.id)
      .eq('status', 'interviewing')
      .order('created_at', { ascending: false })
      .limit(1);
  }

  if (!interviewingQuery.error) {
    let interviewingItem = (interviewingQuery.data || [])[0] || null;
    if (interviewingItem && !('queue_date' in interviewingItem)) {
      const createdDate = String(interviewingItem.created_at || '').slice(0, 10);
      if (createdDate !== today) {
        interviewingItem = null;
      }
    }
    if (interviewingItem?.id) {
      setStatus('You already have an active interviewing student. Finish or mark no-show first.', 'error');
      restoreButton();
      return;
    }
  }

  let query = await supabaseClient
    .from(CONSULTATIONS_TABLE)
    .select('id, queue_date, created_at')
    .eq('faculty_id', currentFaculty.id)
    .eq('status', 'pending')
    .eq('queue_date', today)
    .order('created_at', { ascending: true })
    .limit(1);

  if (query.error && String(query.error.message || '').toLowerCase().includes('queue_date')) {
    query = await supabaseClient
      .from(CONSULTATIONS_TABLE)
      .select('id, created_at')
      .eq('faculty_id', currentFaculty.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);
  }

  if (query.error) {
    console.error('Next student query failed:', query.error.message);
    setStatus('Failed to get next pending student.', 'error');
    restoreButton();
    return;
  }

  let nextItem = (query.data || [])[0] || null;

  if (nextItem && !('queue_date' in nextItem)) {
    const createdDate = String(nextItem.created_at || '').slice(0, 10);
    if (createdDate !== today) {
      nextItem = null;
    }
  }

  if (!nextItem?.id) {
    setStatus('No pending student in today queue.', '');
    restoreButton();
    return;
  }

  await startInterviewFlow(nextItem.id, triggerButton);
  restoreButton();
}

function setStatus(message, type) {
  const el = document.getElementById('faculty-status');
  if (!el) {
    return;
  }
  el.textContent = message || '';
  el.classList.remove('error', 'success');
  if (type) {
    el.classList.add(type);
  }
}

async function safeCreateActivityLog({ actorRole, action, targetType = null, targetId = null, details = null }) {
  if (!supabaseClient) {
    return;
  }

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();

  const payload = {
    actor_email: user?.email || currentFaculty?.email || null,
    actor_role: actorRole || 'faculty',
    action: action || 'unknown_action',
    target_type: targetType,
    target_id: targetId ? String(targetId) : null,
    details: details || {},
  };

  const { error } = await supabaseClient.from(ACTIVITY_LOGS_TABLE).insert(payload);
  if (error) {
    console.warn('Activity log insert skipped:', error.message);
  }
}

function startRealtimeSubscriptions() {
  if (!supabaseClient || !currentFaculty?.id) {
    return;
  }

  try {
    cleanupRealtimeSubscriptions();

    facultyRealtimeChannel = supabaseClient
      .channel(`faculty-self-${currentFaculty.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: FACULTY_TABLE,
          filter: `id=eq.${currentFaculty.id}`,
        },
        (payload) => {
          const next = payload.new || {};
          if (next.status) {
            currentFaculty = { ...currentFaculty, status: next.status, is_available: next.is_available };
            initializeAvailabilityControl();
          }
        }
      )
      .subscribe();

    consultationsRealtimeChannel = supabaseClient
      .channel(`faculty-consultations-${currentFaculty.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: CONSULTATIONS_TABLE,
          filter: `faculty_id=eq.${currentFaculty.id}`,
        },
        () => {
          scheduleQueueReload();
        }
      )
      .subscribe();
  } catch (error) {
    console.error('Realtime subscription failed:', error);
  }
}

function scheduleQueueReload() {
  if (queueReloadTimer) {
    clearTimeout(queueReloadTimer);
  }
  queueReloadTimer = setTimeout(() => {
    void loadConsultationQueue();
  }, 250);
}

function cleanupRealtimeSubscriptions() {
  if (!supabaseClient) {
    return;
  }

  if (queueReloadTimer) {
    clearTimeout(queueReloadTimer);
    queueReloadTimer = null;
  }

  if (facultyRealtimeChannel) {
    void supabaseClient.removeChannel(facultyRealtimeChannel);
    facultyRealtimeChannel = null;
  }

  if (consultationsRealtimeChannel) {
    void supabaseClient.removeChannel(consultationsRealtimeChannel);
    consultationsRealtimeChannel = null;
  }

  if (authStateSubscription) {
    authStateSubscription.unsubscribe();
    authStateSubscription = null;
  }

  stopInterviewCountdowns();
}

async function withRetry(task, retries = ACTION_RETRY_LIMIT, delayMs = ACTION_RETRY_DELAY_MS) {
  let lastResult = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    lastResult = await task();
    if (!lastResult?.error) {
      return lastResult;
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return lastResult || { data: null, error: new Error('Unknown request failure') };
}

function getHistoryRange(filter) {
  const now = new Date();
  const toDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  if (filter === 'today') {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const key = toDateKey(today);
    return { startDate: key, endDate: key };
  }

  if (filter === 'week') {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = today.getDay();
    const distanceToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - distanceToMonday);
    return { startDate: toDateKey(monday), endDate: toDateKey(today) };
  }

  return { startDate: null, endDate: null };
}

function getHistoryLabel(filter) {
  if (filter === 'today') {
    return 'Today';
  }
  if (filter === 'week') {
    return 'This Week';
  }
  return 'All';
}

function filterItemsByCreatedAtRange(items, range) {
  if (!range.startDate || !range.endDate) {
    return items;
  }
  return items.filter((item) => {
    const createdDate = String(item.created_at || '').slice(0, 10);
    if (!createdDate) {
      return false;
    }
    return createdDate >= range.startDate && createdDate <= range.endDate;
  });
}

function looksLikeMissingColumnError(message) {
  const text = String(message || '').toLowerCase();
  return text.includes('column') && text.includes('does not exist');
}

function isPermissionError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return (
    code === '42501' ||
    message.includes('permission denied') ||
    message.includes('row-level security') ||
    message.includes('violates row-level security policy')
  );
}

function normalizeTimeValue(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const matched = raw.match(/^(\d{2}):(\d{2})/);
  if (!matched) {
    return '';
  }
  return `${matched[1]}:${matched[2]}`;
}

function toMinutes(value) {
  const [h, m] = String(value || '00:00').split(':').map((part) => Number(part));
  return (h * 60) + m;
}

function formatTimeForDisplay(value) {
  const safe = normalizeTimeValue(value);
  if (!safe) {
    return 'N/A';
  }
  const [h, m] = safe.split(':').map((part) => Number(part));
  const date = new Date('2023-01-01T00:00:00');
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function getManilaDateKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const values = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  });

  return `${values.year}-${values.month}-${values.day}`;
}

function getSiblingActionButtons(triggerButton) {
  if (!triggerButton) {
    return [];
  }
  const actionRoot = triggerButton.closest('.queue-actions');
  if (!actionRoot) {
    return [triggerButton];
  }
  return Array.from(actionRoot.querySelectorAll('.action-btn'));
}

function setButtonsLoading(buttons, activeButton, loadingText) {
  const safeButtons = (buttons || []).filter(Boolean);
  const snapshots = safeButtons.map((button) => ({
    button,
    disabled: button.disabled,
    text: button.textContent,
  }));

  safeButtons.forEach((button) => {
    button.disabled = true;
  });

  if (activeButton) {
    activeButton.textContent = loadingText;
  }

  return () => {
    snapshots.forEach((item) => {
      item.button.disabled = item.disabled;
      item.button.textContent = item.text;
    });
  };
}

function setSingleButtonLoading(button, loadingText) {
  if (!button) {
    return () => {};
  }

  const snapshot = {
    disabled: button.disabled,
    text: button.textContent,
  };

  button.disabled = true;
  button.textContent = loadingText;

  return () => {
    button.disabled = snapshot.disabled;
    button.textContent = snapshot.text;
  };
}

function startInterviewCountdowns() {
  stopInterviewCountdowns();
  updateInterviewCountdowns();

  const countdowns = document.querySelectorAll('.interview-countdown[data-start-ts]');
  if (!countdowns.length) {
    return;
  }

  interviewCountdownTimer = setInterval(() => {
    updateInterviewCountdowns();
  }, 1000);
}

function stopInterviewCountdowns() {
  if (interviewCountdownTimer) {
    clearInterval(interviewCountdownTimer);
    interviewCountdownTimer = null;
  }
}

function updateInterviewCountdowns() {
  const countdowns = document.querySelectorAll('.interview-countdown[data-start-ts]');
  countdowns.forEach((el) => {
    const startTs = el.getAttribute('data-start-ts');
    const parsed = Date.parse(String(startTs || ''));
    if (Number.isNaN(parsed)) {
      el.innerHTML = '<strong>Auto no-show in:</strong> --:--';
      return;
    }

    const deadline = parsed + (NO_SHOW_TIMEOUT_MINUTES * 60 * 1000);
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      el.classList.add('expired');
      el.innerHTML = '<strong>Auto no-show in:</strong> 00:00';
      return;
    }

    el.classList.remove('expired');
    const remainingSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    el.innerHTML = `<strong>Auto no-show in:</strong> ${mm}:${ss}`;
  });
}

async function sendNoShowEmailNotification(context) {
  try {
    const resolved = await resolveStudentContact(context);
    if (!resolved.email) {
      console.warn('No-show email skipped: student email missing for', context.studentNumber);
      return false;
    }

    const { data, error } = await supabaseClient.functions.invoke(QUEUE_EMAIL_FUNCTION, {
      body: {
        to: resolved.email,
        studentName: resolved.name,
        studentNumber: context.studentNumber,
        facultyName: context.facultyName,
        concern: context.concern,
        preferredTime: context.preferredTime,
        subject: 'No Show Notice - EARIST Queue System',
        text: [
          `Hello ${resolved.name},`,
          '',
          'You were marked as NO SHOW for your consultation.',
          `Faculty: ${context.facultyName}`,
          `Concern: ${context.concern}`,
          `Preferred Time: ${context.preferredTime}`,
          '',
          'Please file a new queue if you still need consultation.',
          'EARIST Queue System Notification',
        ].join('\n'),
        html: `
          <h2>Hello ${escapeHtmlLocal(resolved.name)},</h2>
          <p>You were marked as <strong>NO SHOW</strong> for your consultation.</p>
          <ul>
            <li><strong>Faculty:</strong> ${escapeHtmlLocal(context.facultyName)}</li>
            <li><strong>Concern:</strong> ${escapeHtmlLocal(context.concern)}</li>
            <li><strong>Preferred Time:</strong> ${escapeHtmlLocal(context.preferredTime)}</li>
          </ul>
          <p>Please file a new queue if you still need consultation.</p>
          <p style="font-size:12px;color:#666;">EARIST Queue System Notification</p>
        `,
      },
    });

    if (error) {
      console.warn('No-show email function error:', error.message);
      return false;
    }
    if (!data?.ok) {
      console.warn('No-show email response not ok:', data);
      return false;
    }
    if (!context?.silent) {
      setStatus(`No-show email sent to ${resolved.email}.`, 'success');
    }
    return true;
  } catch (error) {
    console.warn('No-show email unexpected error:', error);
    return false;
  }
}

async function sendCompletedEmailNotification(context) {
  try {
    const resolved = await resolveStudentContact(context);
    if (!resolved.email) {
      console.warn('Completed email skipped: student email missing for', context.studentNumber);
      return false;
    }

    const { data, error } = await supabaseClient.functions.invoke(QUEUE_EMAIL_FUNCTION, {
      body: {
        to: resolved.email,
        studentName: resolved.name,
        studentNumber: context.studentNumber,
        facultyName: context.facultyName,
        concern: context.concern,
        preferredTime: context.preferredTime,
        subject: 'Consultation Completed - EARIST Queue System',
        text: [
          `Hello ${resolved.name},`,
          '',
          'Your consultation session has been marked as COMPLETED.',
          `Faculty: ${context.facultyName}`,
          `Concern: ${context.concern}`,
          `Time Slot: ${context.preferredTime}`,
          '',
          'Thank you for using the EARIST Queue System.',
          'EARIST Queue System Notification',
        ].join('\n'),
        html: `
          <h2>Hello ${escapeHtmlLocal(resolved.name)},</h2>
          <p>Your consultation session has been marked as <strong>COMPLETED</strong>.</p>
          <ul>
            <li><strong>Faculty:</strong> ${escapeHtmlLocal(context.facultyName)}</li>
            <li><strong>Concern:</strong> ${escapeHtmlLocal(context.concern)}</li>
            <li><strong>Time Slot:</strong> ${escapeHtmlLocal(context.preferredTime)}</li>
          </ul>
          <p>Thank you for using the EARIST Queue System.</p>
          <p style="font-size:12px;color:#666;">EARIST Queue System Notification</p>
        `,
      },
    });

    if (error) {
      console.warn('Completed email function error:', error.message);
      return false;
    }
    if (!data?.ok) {
      console.warn('Completed email response not ok:', data);
      return false;
    }
    if (!context?.silent) {
      setStatus(`Completion email sent to ${resolved.email}.`, 'success');
    }
    return true;
  } catch (error) {
    console.warn('Completed email unexpected error:', error);
    return false;
  }
}

async function resolveStudentContact(context) {
  const fallbackName = String(context?.studentName || context?.studentNumber || 'Student');
  const directEmail = String(context?.studentEmail || '').trim();
  if (directEmail) {
    return { email: directEmail, name: fallbackName };
  }

  const studentNumber = String(context?.studentNumber || '').trim();
  if (!studentNumber) {
    return { email: '', name: fallbackName };
  }

  const { data, error } = await supabaseClient
    .from(STUDENTS_TABLE)
    .select('email, full_name')
    .eq('student_number', studentNumber)
    .limit(1);

  if (error || !Array.isArray(data) || data.length === 0) {
    return { email: '', name: fallbackName };
  }

  const row = data[0] || {};
  return {
    email: String(row.email || '').trim(),
    name: String(row.full_name || '').trim() || fallbackName,
  };
}

async function processAutomaticStatusEmails(items, studentMap) {
  if (statusEmailJobRunning || !Array.isArray(items) || !items.length) {
    return;
  }

  statusEmailJobRunning = true;
  try {
    const today = getManilaDateKey();
    for (const item of items) {
      const status = String(item.status || '').toLowerCase();
      const effectiveDate = String(item.queue_date || String(item.created_at || '').slice(0, 10)).slice(0, 10);
      if (effectiveDate !== today) {
        continue;
      }
      const student = studentMap[item.student_number] || {};
      const context = {
        studentNumber: item.student_number || '',
        studentEmail: student.email || '',
        studentName: student.full_name || item.student_number || 'Student',
        facultyName: currentFaculty?.full_name || currentFaculty?.name || 'Faculty',
        concern: item.concern || 'N/A',
        preferredTime: item.preferred_time || 'N/A',
        silent: true,
      };

      if (status === 'no_show' && !item[STATUS_EMAIL_NO_SHOW_COLUMN]) {
        const sent = await sendNoShowEmailNotification(context);
        if (sent) {
          await markStatusEmailSent(item.id, STATUS_EMAIL_NO_SHOW_COLUMN);
        }
      }

      if (status === 'completed' && !item[STATUS_EMAIL_COMPLETED_COLUMN]) {
        const sent = await sendCompletedEmailNotification(context);
        if (sent) {
          await markStatusEmailSent(item.id, STATUS_EMAIL_COMPLETED_COLUMN);
        }
      }
    }
  } finally {
    statusEmailJobRunning = false;
  }
}

async function markStatusEmailSent(consultationId, columnName) {
  if (!consultationId || !columnName) {
    return;
  }

  const payload = {};
  payload[columnName] = new Date().toISOString();

  const { error } = await supabaseClient
    .from(CONSULTATIONS_TABLE)
    .update(payload)
    .eq('id', consultationId)
    .eq('faculty_id', currentFaculty.id);

  if (error) {
    if (looksLikeMissingColumnError(error.message)) {
      console.warn(`Status email sent marker skipped: missing column ${columnName}.`);
      return;
    }
    console.warn('Failed to mark status email sent:', error.message);
  }
}

function escapeHtmlLocal(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
