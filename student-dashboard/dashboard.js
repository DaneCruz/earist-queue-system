const STUDENT_SESSION_KEY = 'student_session';
const LOGIN_PAGE_PATH = '../index.html';
const SUPABASE_URL = 'https://yhryfoimpqzmaaymsaat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6AxrmJlwC7pTgRevGgjTtA_F5b2F8Eb';
const FACULTY_TABLE = 'faculty';
const CONSULTATIONS_TABLE = 'consultations';
const QUEUE_EMAIL_FUNCTION = 'send-queue-email';
const ACTIVITY_LOGS_TABLE = 'activity_logs';
const ACTIVE_QUEUE_STATUSES = ['pending', 'interviewing', 'completed', 'no_show'];
const ALL_VISIBLE_QUEUE_STATUSES = ['pending', 'interviewing', 'completed', 'no_show', 'cancelled'];
const AVG_CONSULTATION_MINUTES = 15;
const QUEUE_INSERT_RETRY_LIMIT = 1;
const QUEUE_INSERT_RETRY_DELAY_MS = 300;

const FACULTY_TIME_WINDOWS = {
  'mr fabro': ['08:00', '11:00'],
  'mr felipe': ['08:30', '11:30'],
  'mr ador': ['11:30', '14:30'],
  'mrs zoleta': ['14:30', '17:00'],
};

const CONCERNS = ['Grades', 'Lesson', 'Assignment', 'Project', 'Thesis Guidance'];

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;
let facultyRealtimeChannel = null;
let consultationRealtimeChannel = null;
let facultyReloadTimer = null;
const queueActionInFlight = new Set();

if (!hasStudentSession()) {
  window.location.href = LOGIN_PAGE_PATH;
}

document.addEventListener('DOMContentLoaded', () => {
  const logoutButton = document.getElementById('logout-btn');
  const refreshEtaButton = document.getElementById('refresh-eta-btn');
  if (logoutButton) {
    logoutButton.addEventListener('click', logoutStudent);
  }
  if (refreshEtaButton) {
    refreshEtaButton.addEventListener('click', () => {
      void handleRefreshEtaClick(refreshEtaButton);
    });
  }
  const myQueueList = document.getElementById('my-queue-list');
  if (myQueueList) {
    myQueueList.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const cancelBtn = target.closest('[data-cancel-queue-id]');
      if (!cancelBtn) {
        return;
      }
      const consultationId = String(cancelBtn.getAttribute('data-cancel-queue-id') || '').trim();
      if (!consultationId) {
        return;
      }
      void cancelMyQueue(consultationId, cancelBtn);
    });
  }

  void populateStudentHeader();
  void loadFacultyCards();
  startRealtimeSubscriptions();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void loadFacultyCards();
    }
  });

  setInterval(() => {
    void loadFacultyCards();
  }, 20000);

  window.addEventListener('beforeunload', cleanupRealtimeSubscriptions);
});

async function handleRefreshEtaClick(button) {
  const messageSection = document.getElementById('message-section');
  if (button) {
    button.disabled = true;
    button.textContent = 'Refreshing...';
  }

  if (messageSection) {
    messageSection.textContent = 'Refreshing faculty ETA...';
  }

  try {
    await loadFacultyCards();
    if (messageSection) {
      messageSection.textContent = 'ETA updated.';
      setTimeout(() => {
        if (messageSection.textContent === 'ETA updated.') {
          messageSection.textContent = '';
        }
      }, 1500);
    }
  } catch (error) {
    console.error('ETA refresh failed:', error);
    if (messageSection) {
      messageSection.textContent = 'Failed to refresh ETA.';
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Refresh ETA';
    }
  }
}

function hasStudentSession() {
  const sessionValue = sessionStorage.getItem(STUDENT_SESSION_KEY);
  if (!sessionValue) {
    return false;
  }

  try {
    const parsed = JSON.parse(sessionValue);
    return Boolean(parsed?.studentNumber);
  } catch (error) {
    console.error('Invalid student session data:', error);
    sessionStorage.removeItem(STUDENT_SESSION_KEY);
    return false;
  }
}

async function logoutStudent() {
  sessionStorage.removeItem(STUDENT_SESSION_KEY);
  window.location.href = LOGIN_PAGE_PATH;
}

async function populateStudentHeader() {
  const header = document.getElementById('student-welcome');
  if (!header) {
    return;
  }

  const session = getStudentSession();
  if (!session?.studentNumber) {
    header.textContent = 'Welcome, Student';
    return;
  }

  if (session.studentName) {
    header.textContent = `Welcome, ${session.studentName}`;
    void populateStudentProfile(session);
    return;
  }

  const { data, error } = await supabaseClient
    .from('students')
    .select('full_name, department, year_level')
    .eq('student_number', session.studentNumber)
    .limit(1);

  if (error || !Array.isArray(data) || data.length === 0) {
    header.textContent = `Welcome, ${session.studentNumber}`;
    return;
  }

  const student = data[0];
  const resolvedName = student.full_name || session.studentNumber;
  header.textContent = `Welcome, ${resolvedName}`;
  
  const updatedSession = {
    ...session,
    studentName: resolvedName,
    department: student.department || 'N/A',
    yearLevel: student.year_level || 'N/A',
  };
  sessionStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(updatedSession));
  
  void populateStudentProfile(updatedSession);
}

async function populateStudentProfile(session) {
  const profileName = document.getElementById('profile-name');
  const profileId = document.getElementById('profile-id');
  const profileDepartment = document.getElementById('profile-department');
  const profileAvatar = document.getElementById('profile-avatar');
  const statCompleted = document.getElementById('stat-completed');
  const statAvgWait = document.getElementById('stat-avg-wait');

  if (!profileName) return;

  // Set basic info
  const studentName = session?.studentName || 'Student';
  const studentNumber = session?.studentNumber || '--';
  const department = session?.department || 'N/A';

  profileName.textContent = studentName;
  profileId.textContent = `ID: ${studentNumber}`;
  profileDepartment.textContent = `Department: ${department}`;
  
  // Set avatar with first letter
  const firstLetter = studentName.charAt(0).toUpperCase();
  profileAvatar.textContent = firstLetter;

  // Fetch completion stats
  try {
    const { data: completedData } = await supabaseClient
      .from(CONSULTATIONS_TABLE)
      .select('id')
      .eq('student_number', studentNumber)
      .eq('status', 'completed');

    const completedCount = completedData?.length || 0;
    if (statCompleted) {
      statCompleted.textContent = completedCount;
    }

    // Calculate average wait time
    if (completedData && completedData.length > 0) {
      const { data: waitTimeData } = await supabaseClient
        .from(CONSULTATIONS_TABLE)
        .select('created_at, updated_at')
        .eq('student_number', studentNumber)
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(5);

      if (waitTimeData && waitTimeData.length > 0) {
        let totalWaitMs = 0;
        waitTimeData.forEach(record => {
          const createdTime = new Date(record.created_at).getTime();
          const updatedTime = new Date(record.updated_at).getTime();
          totalWaitMs += (updatedTime - createdTime);
        });
        const avgWaitMinutes = Math.round(totalWaitMs / waitTimeData.length / 60000);
        if (statAvgWait) {
          statAvgWait.textContent = avgWaitMinutes > 0 ? `${avgWaitMinutes}m` : '<5m';
        }
      }
    }
  } catch (error) {
    console.error('Error fetching profile stats:', error);
  }
}

async function loadFacultyCards() {
  const grid = document.getElementById('faculty-grid');
  if (!grid) {
    return;
  }

  if (!supabaseClient) {
    grid.innerHTML = '<p>Supabase SDK not loaded.</p>';
    return;
  }

  const faculties = await fetchFacultyRecords();
  if (!faculties.length) {
    grid.innerHTML = '<p>No faculty records found.</p>';
    return;
  }

  const occupiedSlotsByFaculty = await fetchOccupiedSlotsByFaculty();
  const queueStatsByFaculty = await fetchQueueStatsByFaculty();

  grid.innerHTML = '';
  faculties.forEach((faculty) => {
    const card = buildFacultyCard(faculty);
    grid.appendChild(card);
    applyOccupiedSlotsToCard(card, occupiedSlotsByFaculty.get(faculty.id) || new Set());
    applyQueueStatsToCard(card, queueStatsByFaculty.get(faculty.id) || null);
    applyFacultyStatusToCard(card, (faculty.status || 'offline').toLowerCase());
  });

  const positionByFaculty = await loadMyQueuePositions(faculties);
  applyStudentPositionsToCards(positionByFaculty);
}

async function fetchQueueStatsByFaculty() {
  const statsByFaculty = new Map();
  const today = getManilaNowInfo().currentDate;

  let query = await supabaseClient
    .from(CONSULTATIONS_TABLE)
    .select('faculty_id, status, queue_date, created_at')
    .in('status', ['pending', 'interviewing'])
    .eq('queue_date', today);

  if (query.error && String(query.error.message || '').toLowerCase().includes('queue_date')) {
    query = await supabaseClient
      .from(CONSULTATIONS_TABLE)
      .select('faculty_id, status, created_at')
      .in('status', ['pending', 'interviewing']);
  }

  if (query.error) {
    console.warn('Could not load queue stats:', query.error.message);
    return statsByFaculty;
  }

  const rows = (query.data || []).filter((row) => {
    const effectiveDate = String(row.queue_date || String(row.created_at || '').slice(0, 10)).slice(0, 10);
    return effectiveDate === today;
  });

  rows.forEach((row) => {
    const facultyId = String(row.faculty_id || '').trim();
    if (!facultyId) {
      return;
    }
    if (!statsByFaculty.has(facultyId)) {
      statsByFaculty.set(facultyId, { pending: 0, interviewing: 0 });
    }
    const item = statsByFaculty.get(facultyId);
    if (String(row.status || '').toLowerCase() === 'pending') {
      item.pending += 1;
    } else {
      item.interviewing += 1;
    }
  });

  return statsByFaculty;
}

async function fetchFacultyRecords() {
  const { data, error } = await supabaseClient
    .from(FACULTY_TABLE)
    .select('id, full_name, name, email, status, available_start, available_end, created_at')
    .order('created_at', { ascending: false });

  let rows = data;
  if (error && looksLikeMissingColumnError(error.message)) {
    const fallback = await supabaseClient
      .from(FACULTY_TABLE)
      .select('id, full_name, name, email, status, created_at')
      .order('created_at', { ascending: false });
    if (fallback.error) {
      console.error('Faculty fetch failed:', fallback.error.message);
      return [];
    }
    rows = (fallback.data || []).map((item) => ({
      ...item,
      available_start: null,
      available_end: null,
    }));
  } else if (error) {
    console.error('Faculty fetch failed:', error.message);
    return [];
  }

  const deduped = new Map();
  (rows || []).forEach((row) => {
    const displayName = getFacultyDisplayName(row);
    const key = getFacultyIdentityKey(row, displayName);
    if (!deduped.has(key)) {
      deduped.set(key, {
        id: row.id,
        displayName,
        status: row.status || 'offline',
        availableStart: row.available_start || null,
        availableEnd: row.available_end || null,
      });
    }
  });

  return Array.from(deduped.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

async function fetchOccupiedSlotsByFaculty() {
  const occupiedByFaculty = new Map();
  const today = getManilaNowInfo().currentDate;

  const { data, error } = await supabaseClient
    .from(CONSULTATIONS_TABLE)
    .select('faculty_id, preferred_time, status, queue_date, created_at')
    .in('status', ACTIVE_QUEUE_STATUSES);

  if (error) {
    console.warn('Could not load occupied slots:', error.message);
    return occupiedByFaculty;
  }

  (data || []).forEach((row) => {
    const facultyId = String(row.faculty_id || '').trim();
    const preferredTime = String(row.preferred_time || '').trim();
    const queueDate = String(row.queue_date || '').slice(0, 10);
    const createdDate = String(row.created_at || '').slice(0, 10);
    const effectiveDate = queueDate || createdDate;

    if (!facultyId || !preferredTime) {
      return;
    }
    if (effectiveDate && effectiveDate !== today) {
      return;
    }

    if (!occupiedByFaculty.has(facultyId)) {
      occupiedByFaculty.set(facultyId, new Set());
    }
    occupiedByFaculty.get(facultyId).add(preferredTime);
  });

  return occupiedByFaculty;
}

function buildFacultyCard(faculty) {
  const card = document.createElement('article');
  card.className = 'faculty-item';
  card.setAttribute('data-faculty-id', faculty.id);
  card.setAttribute('data-faculty-name', faculty.displayName);

  const concernId = `concern-${faculty.id}`;
  const timeId = `time-slot-${faculty.id}`;

  const concernOptions = ['<option value="">Choose a concern</option>']
    .concat(CONCERNS.map((value) => `<option value="${value}">${value}</option>`))
    .join('');

  card.innerHTML = `
    <div class="faculty-card-head">
      <h3>${faculty.displayName}</h3>
      <div class="status-container">
        <span class="status not-available">OFFLINE</span>
      </div>
    </div>
    <p>Available: <span class="available-time">${getDisplayTimeWindow(faculty)}</span></p>
    <p class="faculty-eta-line">Queue load: 0 waiting, 0 interviewing | ETA: 0 min</p>
    <p class="my-position-line" hidden></p>
    <label for="${concernId}">Select Concern:</label>
    <select id="${concernId}">${concernOptions}</select>
    <label for="${timeId}">Select Time Slot:</label>
    <select id="${timeId}"></select>
    <button class="queue-btn" type="button" disabled>Faculty OFFLINE</button>
  `;

  populateTimeSlots(card.querySelector(`#${timeId}`), faculty);
  card.querySelector('.queue-btn')?.addEventListener('click', () => {
    void fileQueue(card, concernId, timeId);
  });

  return card;
}

function applyQueueStatsToCard(card, stats) {
  const etaLine = card.querySelector('.faculty-eta-line');
  if (!etaLine) {
    return;
  }

  const pending = Number(stats?.pending || 0);
  const interviewing = Number(stats?.interviewing || 0);
  const estimatedMinutes = (pending + interviewing) * AVG_CONSULTATION_MINUTES;
  etaLine.textContent = `Queue load: ${pending} waiting, ${interviewing} interviewing | ETA: ${estimatedMinutes} min`;
}

async function loadMyQueuePositions(faculties = []) {
  const queueContainer = document.getElementById('my-queue-list');
  const positionByFaculty = new Map();
  const studentNumber = getStudentNumberFromSession();
  const today = getManilaNowInfo().currentDate;

  if (!queueContainer || !studentNumber || studentNumber === 'unknown') {
    updateLiveQueueBanner([]);
    return positionByFaculty;
  }

  let query = await supabaseClient
    .from(CONSULTATIONS_TABLE)
    .select('id, student_number, faculty_id, faculty_name, preferred_time, concern, status, meet_link, queue_date, created_at')
    .in('status', ALL_VISIBLE_QUEUE_STATUSES)
    .eq('queue_date', today)
    .order('created_at', { ascending: true });

  if (query.error && String(query.error.message || '').toLowerCase().includes('queue_date')) {
    query = await supabaseClient
      .from(CONSULTATIONS_TABLE)
      .select('id, student_number, faculty_id, faculty_name, preferred_time, concern, status, meet_link, created_at')
      .in('status', ALL_VISIBLE_QUEUE_STATUSES)
      .order('created_at', { ascending: true });
  }

  if (query.error) {
    console.warn('Could not load queue positions:', query.error.message);
    queueContainer.innerHTML = '<p class="muted-text">Could not load queue position right now.</p>';
    updateLiveQueueBanner([]);
    return positionByFaculty;
  }

  let rows = query.data || [];
  rows = rows.filter((row) => {
    const effectiveDate = String(row.queue_date || String(row.created_at || '').slice(0, 10)).slice(0, 10);
    return effectiveDate === today;
  });

  const counters = new Map();
  const studentRows = [];

  rows.forEach((row) => {
    const facultyId = String(row.faculty_id || '').trim();
    if (!facultyId) {
      return;
    }
    const status = String(row.status || 'pending').toLowerCase();
    const isActiveQueue = status === 'pending' || status === 'interviewing';
    if (isActiveQueue) {
      const nextPosition = (counters.get(facultyId) || 0) + 1;
      counters.set(facultyId, nextPosition);
    }

    if (String(row.student_number || '').trim() === studentNumber) {
      const activePosition = counters.get(facultyId) || 0;
      const waitingAhead = status === 'pending' ? Math.max(0, activePosition - 1) : 0;
      const estimatedWaitMinutes = status === 'pending' ? waitingAhead * AVG_CONSULTATION_MINUTES : 0;
      const isNext = status === 'pending' && waitingAhead === 0;
      const facultyName = resolveFacultyName(row, faculties);
      if (isActiveQueue) {
        positionByFaculty.set(facultyId, {
          position: activePosition,
          status,
          preferredTime: String(row.preferred_time || '').trim(),
          facultyName,
          waitingAhead,
          estimatedWaitMinutes,
          isNext,
        });
      }
      studentRows.push({
        id: String(row.id || ''),
        facultyName,
        position: activePosition,
        status,
        preferredTime: String(row.preferred_time || '').trim(),
        concern: String(row.concern || '').trim(),
        meetLink: String(row.meet_link || '').trim(),
        waitingAhead,
        estimatedWaitMinutes,
        isNext,
        canCancel: status === 'pending',
        createdAt: String(row.created_at || ''),
      });
    }
  });

  if (!studentRows.length) {
    queueContainer.innerHTML = '<p class="muted-text">You have no active queue today.</p>';
    updateLiveQueueBanner([]);
    return positionByFaculty;
  }

  const sortedRows = studentRows
    .slice()
    .sort((a, b) => {
      const score = (row) => {
        if (row.status === 'interviewing') return 0;
        if (row.status === 'pending') return 1;
        if (row.status === 'completed') return 2;
        if (row.status === 'no_show') return 3;
        return 4;
      };
      const scoreDiff = score(a) - score(b);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });

  queueContainer.innerHTML = sortedRows
    .map((item) => {
      const statusMeta = getStudentQueueStatusMeta(item.status);
      const statusLabel = item.status === 'interviewing'
        ? 'Now Interviewing'
        : (item.status === 'pending' ? `Position #${item.position}` : statusMeta.label);
      const waitLabel = item.status === 'interviewing'
        ? 'Estimated wait: In progress'
        : (item.status === 'pending' ? `Estimated wait: ${item.estimatedWaitMinutes} min` : '');
      const nextBadge = item.isNext ? '<span class="next-badge">You are next</span>' : '';
      const concernLine = item.concern ? `<p class="my-queue-meta">Concern: ${escapeHtml(item.concern)}</p>` : '';
      const meetLine = item.meetLink
        ? (
          item.status === 'interviewing'
            ? `<p class="my-queue-meta">Meet Link: <a href="${escapeHtml(item.meetLink)}" target="_blank" rel="noopener noreferrer">Open Interview Room</a></p>`
            : '<p class="my-queue-meta">Meet Link: <span class="my-queue-meet-closed">Interview closed</span></p>'
        )
        : '';
      const cancelAction = item.canCancel
        ? `<div class="my-queue-actions"><button type="button" class="my-queue-cancel-btn" data-cancel-queue-id="${escapeHtml(item.id)}">Cancel Queue</button></div>`
        : '';
      return `<article class="my-queue-item">
        <div class="my-queue-head">
          <strong>${escapeHtml(item.facultyName)}</strong>
          <span class="my-queue-status-badge ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
        </div>
        ${nextBadge}
        <p class="my-queue-meta">${escapeHtml(item.preferredTime || 'No time selected')}</p>
        ${concernLine}
        <p class="my-queue-meta">${escapeHtml(statusLabel)}</p>
        ${waitLabel ? `<p class="my-queue-meta">${escapeHtml(waitLabel)}</p>` : ''}
        ${meetLine}
        ${cancelAction}
      </article>`;
    })
    .join('');

  updateLiveQueueBanner(sortedRows.filter((row) => row.status === 'pending' || row.status === 'interviewing'));

  return positionByFaculty;
}

function applyStudentPositionsToCards(positionByFaculty) {
  const cards = document.querySelectorAll('.faculty-item');
  cards.forEach((card) => {
    const facultyId = String(card.getAttribute('data-faculty-id') || '').trim();
    const line = card.querySelector('.my-position-line');
    if (!line) {
      return;
    }

    const data = positionByFaculty.get(facultyId);
    if (!data) {
      line.hidden = true;
      line.textContent = '';
      return;
    }

    const text = data.status === 'interviewing'
      ? 'Your queue: Now Interviewing'
      : `Your queue: Position #${data.position}`;
    const extra = data.status === 'interviewing'
      ? 'Estimated wait: In progress'
      : `Estimated wait: ${data.estimatedWaitMinutes} min`;
    line.textContent = `${text} | ${extra}`;
    line.hidden = false;
  });
}

async function fileQueue(card, concernId, timeSlotId) {
  const messageSection = document.getElementById('message-section');
  const concern = document.getElementById(concernId)?.value;
  const timeSlotSelect = document.getElementById(timeSlotId);
  const timeSlot = timeSlotSelect?.value;
  const studentNumber = getStudentNumberFromSession();
  const facultyId = card.getAttribute('data-faculty-id');
  const facultyName = card.getAttribute('data-faculty-name') || 'Faculty';
  const queueButton = card.querySelector('.queue-btn');

  if (!concern || !timeSlot) {
    alert('Please select both a concern and a time slot.');
    return;
  }

  const selectedOption = timeSlotSelect?.selectedOptions?.[0];
  if (selectedOption?.disabled) {
    alert('This time slot is already taken. Please choose another slot.');
    return;
  }

  const nowInfo = getManilaNowInfo();
  if (isPastSlot(timeSlot, nowInfo.currentMinutes)) {
    alert('This time slot has already passed. Please choose another slot.');
    await loadFacultyCards();
    return;
  }

  if (!facultyId) {
    alert('Faculty mapping is missing.');
    return;
  }

  if (!messageSection) {
    return;
  }

  const actionKey = `${facultyId}:${timeSlot}`;
  if (queueActionInFlight.has(actionKey)) {
    return;
  }
  queueActionInFlight.add(actionKey);
  const restoreQueueButton = setQueueButtonLoading(queueButton, 'Filing...');

  const payload = {
    student_number: studentNumber,
    faculty_id: facultyId,
    faculty_name: facultyName,
    concern,
    preferred_time: timeSlot,
    status: 'pending',
  };

  const { error } = await withRetry(async () => (
    supabaseClient.from(CONSULTATIONS_TABLE).insert(payload)
  ), QUEUE_INSERT_RETRY_LIMIT, QUEUE_INSERT_RETRY_DELAY_MS);
  if (error) {
    console.error('Consultation insert error:', error.message);
    const isConflict =
      error.code === '23505' ||
      /duplicate key|unique constraint/i.test(error.message || '');
    if (isConflict) {
      messageSection.textContent = 'That time slot was just taken by another student. Please pick another slot.';
    } else {
      messageSection.textContent = 'Failed to file queue. Check consultations table or insert policy.';
    }
    restoreQueueButton();
    queueActionInFlight.delete(actionKey);
    await loadFacultyCards();
    return;
  }

  void safeCreateActivityLog({
    actorRole: 'student',
    action: 'queue_filed',
    targetType: 'consultation',
    targetId: `${facultyId}:${timeSlot}`,
    details: {
      studentNumber,
      facultyId,
      facultyName,
      concern,
      preferredTime: timeSlot,
    },
  });

  // Non-blocking email notification for student after successful queue filing.
  void sendQueueEmailNotification(studentNumber, {
    facultyName,
    concern,
    preferredTime: timeSlot,
    messageSection,
  });

  messageSection.textContent = `Queue filed with ${facultyName} (${timeSlot}). Please wait for interview call.`;
  setTimeout(() => {
    messageSection.textContent = '';
  }, 5000);

  restoreQueueButton();
  queueActionInFlight.delete(actionKey);
  await loadFacultyCards();
}

async function safeCreateActivityLog({ actorRole, action, targetType = null, targetId = null, details = null }) {
  if (!supabaseClient) {
    return;
  }

  let actorEmail = null;
  try {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    actorEmail = user?.email || null;
  } catch (error) {
    actorEmail = null;
  }

  const payload = {
    actor_email: actorEmail,
    actor_role: actorRole || 'student',
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

async function sendQueueEmailNotification(studentNumber, queueInfo) {
  if (!supabaseClient || !studentNumber) {
    return;
  }

  try {
    const session = getStudentSession();
    const sessionEmail = (session?.studentEmail || '').trim();
    const sessionName = (session?.studentName || '').trim();

    let recipientEmail = sessionEmail;
    let recipientName = sessionName || studentNumber;

    // Fallback to DB lookup only if session has no email.
    const { data: students, error: studentError } = await supabaseClient
      .from('students')
      .select('email, full_name')
      .eq('student_number', studentNumber)
      .limit(1);

    if (studentError || !Array.isArray(students) || students.length === 0) {
      if (!recipientEmail) {
        console.warn('Queue email skipped: student info not found.', studentError?.message);
        return;
      }
    }

    const student = Array.isArray(students) && students.length > 0 ? students[0] : null;
    if (!recipientEmail) {
      recipientEmail = (student?.email || '').trim();
    }
    if (!recipientName) {
      recipientName = (student?.full_name || '').trim() || studentNumber;
    }

    if (!recipientEmail) {
      console.warn('Queue email skipped: student email is empty.');
      return;
    }

    const { data: emailData, error: emailError } = await supabaseClient.functions.invoke(QUEUE_EMAIL_FUNCTION, {
      body: {
        to: recipientEmail,
        studentName: recipientName,
        studentNumber,
        facultyName: queueInfo.facultyName,
        concern: queueInfo.concern,
        preferredTime: queueInfo.preferredTime,
      },
    });

    if (emailError) {
      console.warn('Queue email function error:', emailError.message);
      return;
    }

    if (emailData?.ok) {
      console.info('Queue email sent to:', recipientEmail);
      if (queueInfo.messageSection) {
        queueInfo.messageSection.textContent = `Queue filed successfully. Email sent to ${recipientEmail}.`;
      }
    } else {
      console.warn('Queue email returned unexpected response:', emailData);
    }
  } catch (error) {
    console.warn('Queue email unexpected error:', error);
  }
}

function applyFacultyStatusToCard(card, status) {
  const normalizedStatus = ['available', 'busy', 'offline'].includes(status) ? status : 'offline';
  const statusEl = card.querySelector('.status');

  if (statusEl) {
    statusEl.classList.remove('available', 'ongoing', 'not-available');
    if (normalizedStatus === 'available') {
      statusEl.classList.add('available');
      statusEl.textContent = 'AVAILABLE';
    } else if (normalizedStatus === 'busy') {
      statusEl.classList.add('ongoing');
      statusEl.textContent = 'BUSY';
    } else {
      statusEl.classList.add('not-available');
      statusEl.textContent = 'OFFLINE';
    }
  }

  const queueButton = card.querySelector('.queue-btn');
  const concernSelect = card.querySelector('select[id^="concern-"]');
  const timeSlotSelect = card.querySelector('select[id^="time-slot-"]');
  const canQueue = normalizedStatus === 'available';

  if (queueButton) {
    queueButton.disabled = !canQueue;
    queueButton.textContent = canQueue ? 'File Queue' : `Faculty ${normalizedStatus.toUpperCase()}`;
  }
  if (concernSelect) {
    concernSelect.disabled = !canQueue;
  }
  if (timeSlotSelect) {
    timeSlotSelect.disabled = !canQueue;
  }
}

function populateTimeSlots(selectEl, faculty) {
  if (!selectEl) {
    return;
  }

  const [startTime, endTime] = getTimeWindow(faculty);
  const timeSlots = generateTimeSlots(startTime, endTime);
  selectEl.innerHTML = '<option value="">Select a Time</option>';

  timeSlots.forEach((slot) => {
    const option = document.createElement('option');
    option.value = slot;
    option.textContent = slot;
    selectEl.appendChild(option);
  });
}

function applyOccupiedSlotsToCard(card, occupiedSlots) {
  const select = card.querySelector('select[id^="time-slot-"]');
  if (!select) {
    return;
  }

  const occupiedSet = occupiedSlots instanceof Set ? occupiedSlots : new Set();
  const currentValue = select.value;
  const nowInfo = getManilaNowInfo();

  Array.from(select.options).forEach((option) => {
    if (!option.value) {
      return;
    }
    const isTaken = occupiedSet.has(option.value);
    const isPast = isPastSlot(option.value, nowInfo.currentMinutes);
    option.disabled = isTaken || isPast;

    if (isTaken) {
      option.textContent = `${option.value} (Taken)`;
    } else if (isPast) {
      option.textContent = `${option.value} (Closed)`;
    } else {
      option.textContent = option.value;
    }
  });

  if (
    currentValue &&
    (occupiedSet.has(currentValue) || isPastSlot(currentValue, nowInfo.currentMinutes))
  ) {
    select.value = '';
  }
}

function getDisplayTimeWindow(faculty) {
  const [start, end] = getTimeWindow(faculty);
  const sampleDate = new Date('2023-01-01T00:00:00');
  const toClock = (time) => {
    const [h, m] = time.split(':').map((v) => Number(v));
    const date = new Date(sampleDate);
    date.setHours(h, m, 0, 0);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };
  return `${toClock(start)} - ${toClock(end)}`;
}

function getTimeWindow(faculty) {
  const startFromDb = normalizeTimeValue(faculty?.availableStart);
  const endFromDb = normalizeTimeValue(faculty?.availableEnd);
  if (startFromDb && endFromDb && toMinutes(endFromDb) > toMinutes(startFromDb)) {
    return [startFromDb, endFromDb];
  }

  const key = normalizeFacultyName(faculty?.displayName || '');
  const mapped = FACULTY_TIME_WINDOWS[key];
  if (mapped) {
    return mapped;
  }
  return ['08:00', '17:00'];
}

function generateTimeSlots(startTime, endTime) {
  const timeSlots = [];
  const start = new Date(`2023-01-01T${startTime}:00`);
  const end = new Date(`2023-01-01T${endTime}:00`);

  while (start < end) {
    const nextSlot = new Date(start);
    nextSlot.setMinutes(start.getMinutes() + 15);
    timeSlots.push(`${formatTime(start)} - ${formatTime(nextSlot)}`);
    start.setMinutes(start.getMinutes() + 20);
  }

  return timeSlots;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getFacultyDisplayName(row) {
  return (row.full_name || row.name || 'Faculty').trim();
}

function getFacultyIdentityKey(row, displayName) {
  const email = String(row.email || '').trim().toLowerCase();
  if (email) {
    return `email:${email}`;
  }
  return `name:${normalizeFacultyName(displayName)}`;
}

function normalizeFacultyName(value) {
  return String(value || '').replaceAll('.', '').trim().toLowerCase();
}

function getStudentNumberFromSession() {
  return getStudentSession()?.studentNumber || 'unknown';
}

function resolveFacultyName(row, faculties) {
  const fromRow = String(row.faculty_name || '').trim();
  if (fromRow) {
    return fromRow;
  }

  const facultyId = String(row.faculty_id || '').trim();
  if (!facultyId) {
    return 'Faculty';
  }

  const found = faculties.find((faculty) => String(faculty.id || '').trim() === facultyId);
  return found?.displayName || 'Faculty';
}

function getStudentSession() {
  const raw = sessionStorage.getItem(STUDENT_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function startRealtimeSubscriptions() {
  if (!supabaseClient) {
    return;
  }

  cleanupRealtimeSubscriptions();

  facultyRealtimeChannel = supabaseClient
    .channel('student-faculty-status')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: FACULTY_TABLE },
      () => {
        scheduleFacultyReload();
      }
    )
    .subscribe();

  consultationRealtimeChannel = supabaseClient
    .channel('student-consultations-all')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: CONSULTATIONS_TABLE,
      },
      (payload) => {
        // Check if it's student's turn
        checkAndNotifyStudentTurn(payload);
        scheduleFacultyReload();
      }
    )
    .subscribe();
}

async function checkAndNotifyStudentTurn(payload) {
  if (!supabaseClient) return;

  try {
    const session = await supabaseClient.auth.getSession();
    const studentEmail = session.data?.session?.user?.email;
    if (!studentEmail) return;

    const { data: student } = await supabaseClient
      .from('students')
      .select('id')
      .eq('email', studentEmail)
      .single();

    if (!student) return;

    // Get the updated consultation
    const { data: consultation } = await supabaseClient
      .from(CONSULTATIONS_TABLE)
      .select('*, faculty!inner(full_name, name)')
      .eq('student_id', student.id)
      .eq('status', 'interviewing')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (consultation) {
      const facultyName = consultation.faculty?.full_name || consultation.faculty?.name || 'Faculty';
      notificationManager.show(
        '🎯 Your Turn!',
        `Go to ${facultyName} now for your consultation!`,
        'success',
        8000
      );
    }
  } catch (error) {
    console.log('Notification check completed');
  }
}

function scheduleFacultyReload() {
  if (facultyReloadTimer) {
    clearTimeout(facultyReloadTimer);
  }
  facultyReloadTimer = setTimeout(() => {
    void loadFacultyCards();
  }, 300);
}

function cleanupRealtimeSubscriptions() {
  if (facultyReloadTimer) {
    clearTimeout(facultyReloadTimer);
    facultyReloadTimer = null;
  }

  if (facultyRealtimeChannel) {
    void supabaseClient.removeChannel(facultyRealtimeChannel);
    facultyRealtimeChannel = null;
  }

  if (consultationRealtimeChannel) {
    void supabaseClient.removeChannel(consultationRealtimeChannel);
    consultationRealtimeChannel = null;
  }
}

function setQueueButtonLoading(button, loadingText) {
  if (!button) {
    return () => {};
  }
  const snapshot = { text: button.textContent, disabled: button.disabled };
  button.disabled = true;
  button.textContent = loadingText;
  return () => {
    button.disabled = snapshot.disabled;
    button.textContent = snapshot.text;
  };
}

async function withRetry(task, retries = 1, delayMs = 300) {
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

function looksLikeMissingColumnError(message) {
  const text = String(message || '').toLowerCase();
  return text.includes('column') && text.includes('does not exist');
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

function isPastSlot(slotLabel, currentMinutes) {
  const slotStart = parseSlotStartMinutes(slotLabel);
  if (slotStart === null) {
    return false;
  }
  return slotStart < currentMinutes;
}

function parseSlotStartMinutes(slotLabel) {
  const raw = String(slotLabel || '').trim();
  if (!raw) {
    return null;
  }

  const startPart = raw.split('-')[0]?.trim();
  if (!startPart) {
    return null;
  }

  const matched = startPart.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!matched) {
    return null;
  }

  let hour = Number(matched[1]);
  const minute = Number(matched[2]);
  const meridiem = matched[3].toUpperCase();

  if (meridiem === 'PM' && hour !== 12) {
    hour += 12;
  } else if (meridiem === 'AM' && hour === 12) {
    hour = 0;
  }

  return (hour * 60) + minute;
}

function getManilaNowInfo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const values = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  });

  return {
    currentDate: `${values.year}-${values.month}-${values.day}`,
    currentMinutes: (Number(values.hour || 0) * 60) + Number(values.minute || 0),
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function updateLiveQueueBanner(studentRows) {
  const banner = document.getElementById('queue-live-banner');
  if (!banner) {
    return;
  }

  const rows = Array.isArray(studentRows) ? studentRows : [];
  if (!rows.length) {
    banner.hidden = true;
    banner.textContent = '';
    return;
  }

  const interviewingRow = rows.find((row) => row.status === 'interviewing');
  if (interviewingRow) {
    banner.hidden = false;
    banner.textContent = `Now interviewing: ${interviewingRow.facultyName}. Join/prepare now.`;
    return;
  }

  const nextRow = rows
    .filter((row) => row.status === 'pending')
    .sort((a, b) => a.waitingAhead - b.waitingAhead)[0];

  if (!nextRow) {
    banner.hidden = true;
    banner.textContent = '';
    return;
  }

  banner.hidden = false;
  if (nextRow.waitingAhead === 0) {
    banner.textContent = `You are next for ${nextRow.facultyName}. Please stay ready.`;
  } else {
    banner.textContent = `Nearest queue: ${nextRow.facultyName} in about ${nextRow.estimatedWaitMinutes} min.`;
  }
}

function getStudentQueueStatusMeta(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'interviewing') {
    return { label: 'Interviewing', className: 'is-interviewing' };
  }
  if (normalized === 'completed') {
    return { label: 'Completed', className: 'is-completed' };
  }
  if (normalized === 'no_show') {
    return { label: 'No Show', className: 'is-no-show' };
  }
  if (normalized === 'cancelled') {
    return { label: 'Cancelled', className: 'is-cancelled' };
  }
  return { label: 'Pending', className: 'is-pending' };
}

async function cancelMyQueue(consultationId, buttonEl) {
  const studentNumber = getStudentNumberFromSession();
  if (!consultationId || !studentNumber || studentNumber === 'unknown') {
    return;
  }

  const shouldCancel = window.confirm('Cancel this queue request?');
  if (!shouldCancel) {
    return;
  }

  const key = `cancel:${consultationId}`;
  if (queueActionInFlight.has(key)) {
    return;
  }
  queueActionInFlight.add(key);

  const restoreButton = setQueueButtonLoading(buttonEl, 'Cancelling...');
  const messageSection = document.getElementById('message-section');

  try {
    const { data, error } = await supabaseClient
      .from(CONSULTATIONS_TABLE)
      .update({ status: 'cancelled' })
      .eq('id', consultationId)
      .eq('student_number', studentNumber)
      .in('status', ['pending'])
      .select('id, faculty_name, preferred_time')
      .limit(1);

    if (error) {
      console.error('Cancel queue error:', error.message);
      if (messageSection) {
        messageSection.textContent = 'Failed to cancel queue.';
      }
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      if (messageSection) {
        messageSection.textContent = 'Queue cannot be cancelled anymore (already started/finished).';
      }
      return;
    }

    const updated = data[0];
    if (messageSection) {
      messageSection.textContent = `Queue cancelled: ${updated.faculty_name || 'Faculty'} (${updated.preferred_time || ''}).`;
      setTimeout(() => {
        if (messageSection.textContent?.startsWith('Queue cancelled:')) {
          messageSection.textContent = '';
        }
      }, 3000);
    }

    void safeCreateActivityLog({
      actorRole: 'student',
      action: 'queue_cancelled',
      targetType: 'consultation',
      targetId: consultationId,
      details: {
        studentNumber,
        facultyName: updated.faculty_name || null,
        preferredTime: updated.preferred_time || null,
      },
    });

    await loadFacultyCards();
  } finally {
    restoreButton();
    queueActionInFlight.delete(key);
  }
}
