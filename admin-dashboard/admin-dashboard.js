const SUPABASE_URL = 'https://yhryfoimpqzmaaymsaat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6AxrmJlwC7pTgRevGgjTtA_F5b2F8Eb';
const LOGIN_PAGE_PATH = '../index.html';
const ADMIN_TABLE = 'admins';
const STUDENTS_TABLE = 'students';
const FACULTY_TABLE = 'faculty';
const CONSULTATIONS_TABLE = 'consultations';
const ACTIVITY_LOGS_TABLE = 'activity_logs';
const HISTORY_FILTERS = ['today', 'week', 'all'];
let selectedHistoryFilter = 'today';
let latestConsultationRows = [];
let latestConsultationRowsRaw = [];
let latestActivityRows = [];
let selectedActivityRole = 'all';
let activitySearchText = '';
let selectedConsultationFaculty = 'all';
let selectedConsultationStatus = 'all';
let selectedConsultationDateFrom = '';
let selectedConsultationDateTo = '';
let latestOverviewSummary = {
  waitingToday: 0,
  interviewingNow: 0,
  completedToday: 0,
  avgWaitLabel: '--',
  noShowRateLabel: '0%',
  topConcernsLabel: 'No data yet.',
};

if (!window.supabase) {
  throw new Error('Supabase SDK failed to load.');
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let authStateSubscription = null;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    void logout();
  });
  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    void loadAllData();
  });
  document.getElementById('student-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void saveStudent();
  });
  document.getElementById('student-reset-btn')?.addEventListener('click', clearStudentForm);
  document.getElementById('faculty-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void saveFaculty();
  });
  document.getElementById('faculty-reset-btn')?.addEventListener('click', clearFacultyForm);
  document.getElementById('consultation-history-filter')?.addEventListener('change', (event) => {
    const next = event.target.value;
    selectedHistoryFilter = HISTORY_FILTERS.includes(next) ? next : 'today';
    void loadConsultationHistory();
  });
  document.getElementById('consultation-faculty-filter')?.addEventListener('change', (event) => {
    selectedConsultationFaculty = String(event.target.value || 'all');
    applyAndRenderConsultationFilters();
  });
  document.getElementById('consultation-status-filter')?.addEventListener('change', (event) => {
    selectedConsultationStatus = String(event.target.value || 'all');
    applyAndRenderConsultationFilters();
  });
  document.getElementById('consultation-date-from')?.addEventListener('change', (event) => {
    selectedConsultationDateFrom = String(event.target.value || '').trim();
    applyAndRenderConsultationFilters();
  });
  document.getElementById('consultation-date-to')?.addEventListener('change', (event) => {
    selectedConsultationDateTo = String(event.target.value || '').trim();
    applyAndRenderConsultationFilters();
  });
  document.getElementById('export-consultations-csv-btn')?.addEventListener('click', exportConsultationsCsv);
  document.getElementById('export-consultations-pdf-btn')?.addEventListener('click', exportConsultationsPdf);
  document.getElementById('activity-role-filter')?.addEventListener('change', (event) => {
    selectedActivityRole = String(event.target.value || 'all');
    renderActivityLogs(latestActivityRows);
  });
  document.getElementById('activity-search')?.addEventListener('input', (event) => {
    activitySearchText = String(event.target.value || '').trim().toLowerCase();
    renderActivityLogs(latestActivityRows);
  });

  void enforceAdminSession();
  const { data } = supabaseClient.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      window.location.href = LOGIN_PAGE_PATH;
    }
  });
  authStateSubscription = data?.subscription || null;
});

async function enforceAdminSession() {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error || !data?.user?.email) {
    window.location.href = LOGIN_PAGE_PATH;
    return;
  }

  const email = data.user.email;
  const isAdmin = await isAdminEmail(email);
  if (!isAdmin) {
    setStatus('This Gmail is not registered in admins table.', 'error');
    await logout();
    return;
  }

  const emailLabel = document.getElementById('admin-email');
  if (emailLabel) {
    emailLabel.textContent = `Signed in as ${email}`;
  }

  await loadAllData();
}

async function isAdminEmail(email) {
  const { data, error } = await supabaseClient
    .from(ADMIN_TABLE)
    .select('email')
    .eq('email', email)
    .limit(1);

  if (error) {
    setStatus('Cannot read admins table. Create table/policy first.', 'error');
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

async function loadAllData() {
  await Promise.all([loadStudents(), loadFaculty(), loadConsultationHistory(), loadQueueOverview(), loadActivityLogs()]);
}

async function loadStudents() {
  const { data, error } = await supabaseClient
    .from(STUDENTS_TABLE)
    .select('id, student_number, full_name, email, phone_number')
    .order('full_name', { ascending: true, nullsFirst: false })
    .order('student_number', { ascending: true });

  if (error) {
    setStatus('Students load failed: ' + error.message, 'error');
    renderStudents([]);
    return;
  }

  const sorted = (data || []).slice().sort((a, b) => {
    const nameA = (a.full_name || '').trim().toLowerCase();
    const nameB = (b.full_name || '').trim().toLowerCase();

    if (nameA && nameB) {
      const byName = nameA.localeCompare(nameB);
      if (byName !== 0) {
        return byName;
      }
    } else if (nameA && !nameB) {
      return -1;
    } else if (!nameA && nameB) {
      return 1;
    }

    return (a.student_number || '').toLowerCase().localeCompare((b.student_number || '').toLowerCase());
  });

  renderStudents(sorted);
}

async function loadFaculty() {
  const { data, error } = await supabaseClient
    .from(FACULTY_TABLE)
    .select('id, full_name, email, status, department_id')
    .order('full_name', { ascending: true });

  if (error) {
    setStatus('Faculty load failed: ' + error.message, 'error');
    renderFaculty([]);
    return;
  }

  renderFaculty(data || []);
}

async function loadConsultationHistory() {
  const historyRange = getHistoryRange(selectedHistoryFilter);
  const metaEl = document.getElementById('consultations-meta');

  let query = supabaseClient
    .from(CONSULTATIONS_TABLE)
    .select('id, student_number, faculty_name, concern, preferred_time, status, queue_date, created_at')
    .order('created_at', { ascending: false });

  if (historyRange.startDate && historyRange.endDate) {
    query = query.gte('queue_date', historyRange.startDate).lte('queue_date', historyRange.endDate);
  }

  let { data, error } = await query;

  if (error && String(error.message || '').toLowerCase().includes('queue_date')) {
    const fallback = await supabaseClient
      .from(CONSULTATIONS_TABLE)
      .select('id, student_number, faculty_name, concern, preferred_time, status, created_at')
      .order('created_at', { ascending: false });

    data = fallback.data || [];
    error = fallback.error;
    if (!error) {
      data = filterByCreatedAtRange(data, historyRange).map((row) => ({ ...row, queue_date: null }));
    }
  }

  if (error) {
    setStatus('Consultations load failed: ' + error.message, 'error');
    renderConsultations([]);
    if (metaEl) {
      metaEl.textContent = 'Failed to load consultation history.';
    }
    return;
  }

  const rows = data || [];
  latestConsultationRowsRaw = rows;
  populateConsultationFacultyFilter(rows);
  applyAndRenderConsultationFilters();
}

function applyAndRenderConsultationFilters() {
  const rows = applyConsultationFilters(latestConsultationRowsRaw || []);
  latestConsultationRows = rows;
  renderConsultations(rows);

  const metaEl = document.getElementById('consultations-meta');
  if (metaEl) {
    const label = getHistoryLabel(selectedHistoryFilter);
    metaEl.textContent = rows.length > 0 ? `${rows.length} consultation(s) in ${label}` : `No consultations in ${label}.`;
  }
}

function applyConsultationFilters(rows) {
  return (rows || []).filter((row) => {
    const facultyValue = String(row.faculty_name || '').trim();
    const statusValue = String(row.status || '').trim().toLowerCase();
    const rowDate = String(row.queue_date || String(row.created_at || '').slice(0, 10)).slice(0, 10);

    if (selectedConsultationFaculty !== 'all' && facultyValue !== selectedConsultationFaculty) {
      return false;
    }

    if (selectedConsultationStatus !== 'all' && statusValue !== selectedConsultationStatus) {
      return false;
    }

    if (selectedConsultationDateFrom && rowDate && rowDate < selectedConsultationDateFrom) {
      return false;
    }
    if (selectedConsultationDateTo && rowDate && rowDate > selectedConsultationDateTo) {
      return false;
    }

    return true;
  });
}

function populateConsultationFacultyFilter(rows) {
  const selectEl = document.getElementById('consultation-faculty-filter');
  if (!selectEl) {
    return;
  }

  const options = Array.from(new Set((rows || [])
    .map((row) => String(row.faculty_name || '').trim())
    .filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));

  const previousValue = selectedConsultationFaculty;
  const optionHtml = ['<option value="all">All</option>']
    .concat(options.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`))
    .join('');
  selectEl.innerHTML = optionHtml;

  if (previousValue !== 'all' && options.includes(previousValue)) {
    selectEl.value = previousValue;
  } else {
    selectEl.value = 'all';
    selectedConsultationFaculty = 'all';
  }
}

function renderStudents(rows) {
  const body = document.getElementById('students-body');
  if (!body) {
    return;
  }

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="5">No students found.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.student_number || '')}</td>
        <td>${escapeHtml(row.email || '')}</td>
        <td>${escapeHtml(row.phone_number || '')}</td>
        <td>${escapeHtml(row.full_name || '')}</td>
        <td class="actions">
          <button class="btn small primary" data-action="edit-student" data-id="${row.id}">Edit</button>
          <button class="btn small danger" data-action="delete-student" data-id="${row.id}">Delete</button>
        </td>
      </tr>
    `)
    .join('');

  body.querySelectorAll('[data-action="edit-student"]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = rows.find((item) => String(item.id) === button.dataset.id);
      if (row) {
        fillStudentForm(row);
      }
    });
  });

  body.querySelectorAll('[data-action="delete-student"]').forEach((button) => {
    button.addEventListener('click', () => {
      void deleteStudent(button.dataset.id);
    });
  });
}

function renderFaculty(rows) {
  const body = document.getElementById('faculty-body');
  if (!body) {
    return;
  }

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="4">No faculty found.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.full_name || '')}</td>
        <td>${escapeHtml(row.email || '')}</td>
        <td>${escapeHtml(row.status || '')}</td>
        <td class="actions">
          <button class="btn small primary" data-action="edit-faculty" data-id="${row.id}">Edit</button>
          <button class="btn small danger" data-action="delete-faculty" data-id="${row.id}">Delete</button>
        </td>
      </tr>
    `)
    .join('');

  body.querySelectorAll('[data-action="edit-faculty"]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = rows.find((item) => String(item.id) === button.dataset.id);
      if (row) {
        fillFacultyForm(row);
      }
    });
  });

  body.querySelectorAll('[data-action="delete-faculty"]').forEach((button) => {
    button.addEventListener('click', () => {
      void deleteFaculty(button.dataset.id);
    });
  });
}

function renderConsultations(rows) {
  const body = document.getElementById('consultations-body');
  if (!body) {
    return;
  }

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6">No consultations found.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map((row) => {
      const queueDate = row.queue_date || String(row.created_at || '').slice(0, 10) || '';
      const statusValue = String(row.status || '').trim().toLowerCase();
      const statusClass = getConsultationStatusClass(statusValue);
      const statusLabel = statusValue || 'unknown';
      return `
      <tr>
        <td>${escapeHtml(queueDate)}</td>
        <td>${escapeHtml(row.student_number || '')}</td>
        <td>${escapeHtml(row.faculty_name || '')}</td>
        <td>${escapeHtml(row.concern || '')}</td>
        <td>${escapeHtml(row.preferred_time || '')}</td>
        <td><span class="status-pill ${statusClass}">${escapeHtml(statusLabel)}</span></td>
      </tr>
    `;
    })
    .join('');
}

function fillStudentForm(row) {
  document.getElementById('student-id').value = row.id || '';
  document.getElementById('student-number').value = row.student_number || '';
  document.getElementById('student-email').value = row.email || '';
  document.getElementById('student-phone').value = row.phone_number || '';
  document.getElementById('student-name').value = row.full_name || '';
}

function clearStudentForm() {
  document.getElementById('student-id').value = '';
  document.getElementById('student-number').value = '';
  document.getElementById('student-email').value = '';
  document.getElementById('student-phone').value = '';
  document.getElementById('student-name').value = '';
}

function fillFacultyForm(row) {
  document.getElementById('faculty-id').value = row.id || '';
  document.getElementById('faculty-name').value = row.full_name || '';
  document.getElementById('faculty-email-input').value = row.email || '';
  document.getElementById('faculty-department-id').value = row.department_id || '';
}

function clearFacultyForm() {
  document.getElementById('faculty-id').value = '';
  document.getElementById('faculty-name').value = '';
  document.getElementById('faculty-email-input').value = '';
  document.getElementById('faculty-department-id').value = '';
}

async function saveStudent() {
  const id = document.getElementById('student-id').value.trim();
  const studentNumber = document.getElementById('student-number').value.trim();
  const studentEmail = document.getElementById('student-email').value.trim();
  const studentPhone = document.getElementById('student-phone').value.trim();
  const fullName = document.getElementById('student-name').value.trim();

  if (!studentNumber || !studentEmail || !studentPhone) {
    setStatus('Student number, email, and phone number are required.', 'error');
    return;
  }

  if (id) {
    const { error } = await supabaseClient
      .from(STUDENTS_TABLE)
      .update({ student_number: studentNumber, email: studentEmail, phone_number: studentPhone, full_name: fullName || null })
      .eq('id', id);

    if (error) {
      setStatus('Student update failed: ' + error.message, 'error');
      return;
    }
    void safeCreateActivityLog({
      actorRole: 'admin',
      action: 'student_updated',
      targetType: 'student',
      targetId: id,
      details: { studentNumber, studentEmail },
    });
    setStatus('Student updated.', 'success');
  } else {
    const payload = { student_number: studentNumber, email: studentEmail, phone_number: studentPhone, full_name: fullName || null };
    const { error } = await supabaseClient.from(STUDENTS_TABLE).insert(payload);
    if (error) {
      setStatus('Student insert failed: ' + error.message, 'error');
      return;
    }
    void safeCreateActivityLog({
      actorRole: 'admin',
      action: 'student_added',
      targetType: 'student',
      targetId: studentNumber,
      details: { studentNumber, studentEmail },
    });
    setStatus('Student added.', 'success');
  }

  clearStudentForm();
  await loadStudents();
}

async function deleteStudent(id) {
  if (!id || !confirm('Delete this student?')) {
    return;
  }

  const { error } = await supabaseClient.from(STUDENTS_TABLE).delete().eq('id', id);
  if (error) {
    setStatus('Student delete failed: ' + error.message, 'error');
    return;
  }

  void safeCreateActivityLog({
    actorRole: 'admin',
    action: 'student_deleted',
    targetType: 'student',
    targetId: id,
  });
  setStatus('Student deleted.', 'success');
  await loadStudents();
}

async function saveFaculty() {
  const id = document.getElementById('faculty-id').value.trim();
  const fullName = document.getElementById('faculty-name').value.trim();
  const email = document.getElementById('faculty-email-input').value.trim();
  const departmentId = document.getElementById('faculty-department-id').value.trim();

  if (!fullName || !email) {
    setStatus('Faculty name and Gmail are required.', 'error');
    return;
  }

  if (departmentId && !isUuid(departmentId)) {
    setStatus('Selected department has an invalid UUID value.', 'error');
    return;
  }

  if (id) {
    const { error } = await supabaseClient
      .from(FACULTY_TABLE)
      .update({ full_name: fullName, name: fullName, email, department_id: departmentId || null })
      .eq('id', id);

    if (error) {
      setStatus('Faculty update failed: ' + error.message, 'error');
      return;
    }
    void safeCreateActivityLog({
      actorRole: 'admin',
      action: 'faculty_updated',
      targetType: 'faculty',
      targetId: id,
      details: { fullName, email, departmentId: departmentId || null },
    });
    setStatus('Faculty updated.', 'success');
  } else {
    const payload = {
      id: crypto.randomUUID(),
      faculty_code: `FAC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      full_name: fullName,
      name: fullName,
      email,
      is_available: true,
      status: 'available',
      department_id: departmentId || null,
      created_at: new Date().toISOString(),
      password: 'password',
    };

    const { error } = await supabaseClient.from(FACULTY_TABLE).insert(payload);
    if (error) {
      setStatus('Faculty insert failed: ' + error.message, 'error');
      return;
    }
    void safeCreateActivityLog({
      actorRole: 'admin',
      action: 'faculty_added',
      targetType: 'faculty',
      targetId: payload.id,
      details: { fullName, email, facultyCode: payload.faculty_code },
    });
    setStatus('Faculty added.', 'success');
  }

  clearFacultyForm();
  await loadFaculty();
}

async function deleteFaculty(id) {
  if (!id || !confirm('Delete this faculty row?')) {
    return;
  }

  const { error } = await supabaseClient.from(FACULTY_TABLE).delete().eq('id', id);
  if (error) {
    setStatus('Faculty delete failed: ' + error.message, 'error');
    return;
  }

  void safeCreateActivityLog({
    actorRole: 'admin',
    action: 'faculty_deleted',
    targetType: 'faculty',
    targetId: id,
  });
  setStatus('Faculty deleted.', 'success');
  await loadFaculty();
}

async function logout() {
  if (authStateSubscription) {
    authStateSubscription.unsubscribe();
    authStateSubscription = null;
  }
  await supabaseClient.auth.signOut();
  window.location.href = LOGIN_PAGE_PATH;
}

function setStatus(message, type) {
  const el = document.getElementById('status-message');
  if (!el) {
    return;
  }

  el.textContent = message || '';
  el.classList.remove('error', 'success');
  if (type) {
    el.classList.add(type);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getHistoryRange(filter) {
  const now = new Date();
  const toDateKey = (date) => date.toISOString().slice(0, 10);

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

function filterByCreatedAtRange(rows, range) {
  if (!range.startDate || !range.endDate) {
    return rows;
  }
  return rows.filter((row) => {
    const createdDate = String(row.created_at || '').slice(0, 10);
    return createdDate && createdDate >= range.startDate && createdDate <= range.endDate;
  });
}

function getConsultationStatusClass(status) {
  if (status === 'pending') {
    return 'pending';
  }
  if (status === 'interviewing') {
    return 'interviewing';
  }
  if (status === 'completed') {
    return 'completed';
  }
  if (status === 'no_show') {
    return 'no_show';
  }
  if (status === 'cancelled') {
    return 'cancelled';
  }
  return 'unknown';
}

async function loadQueueOverview() {
  const today = getTodayDateKey();
  let query = await supabaseClient
    .from(CONSULTATIONS_TABLE)
    .select('faculty_id, faculty_name, status, concern, interview_started_at, queue_date, created_at')
    .eq('queue_date', today);

  if (query.error && String(query.error.message || '').toLowerCase().includes('interview_started_at')) {
    query = await supabaseClient
      .from(CONSULTATIONS_TABLE)
      .select('faculty_id, faculty_name, status, concern, queue_date, created_at')
      .eq('queue_date', today);
    if (!query.error && Array.isArray(query.data)) {
      query.data = query.data.map((row) => ({ ...row, interview_started_at: null }));
    }
  }

  if (query.error && String(query.error.message || '').toLowerCase().includes('queue_date')) {
    query = await supabaseClient
      .from(CONSULTATIONS_TABLE)
      .select('faculty_id, faculty_name, status, concern, interview_started_at, created_at');

    if (query.error && String(query.error.message || '').toLowerCase().includes('interview_started_at')) {
      query = await supabaseClient
        .from(CONSULTATIONS_TABLE)
        .select('faculty_id, faculty_name, status, concern, created_at');
      if (!query.error && Array.isArray(query.data)) {
        query.data = query.data.map((row) => ({ ...row, interview_started_at: null }));
      }
    }
  }

  if (query.error) {
    return;
  }

  let rows = query.data || [];
  if (!('queue_date' in (rows[0] || {}))) {
    rows = rows.filter((row) => String(row.created_at || '').slice(0, 10) === today);
  }

  const waitingToday = rows.filter((row) => row.status === 'pending').length;
  const interviewingNow = rows.filter((row) => row.status === 'interviewing').length;
  const completedToday = rows.filter((row) => row.status === 'completed').length;
  const avgWaitLabel = getAverageWaitLabel(rows);
  const noShowRateLabel = getNoShowRateLabel(rows);
  const topConcernsLabel = getTopConcernsLabel(rows);

  latestOverviewSummary = {
    waitingToday,
    interviewingNow,
    completedToday,
    avgWaitLabel,
    noShowRateLabel,
    topConcernsLabel,
  };

  const facultyMap = new Map();
  rows.forEach((row) => {
    const key = String(row.faculty_id || '').trim() || String(row.faculty_name || '').trim();
    if (!key) {
      return;
    }

    if (!facultyMap.has(key)) {
      facultyMap.set(key, {
        facultyName: String(row.faculty_name || 'Faculty').trim() || 'Faculty',
        waiting: 0,
        interviewing: 0,
      });
    }

    const item = facultyMap.get(key);
    if (row.status === 'pending') {
      item.waiting += 1;
    } else if (row.status === 'interviewing') {
      item.interviewing += 1;
    }
  });

  const facultyRows = Array.from(facultyMap.values())
    .map((item) => ({
      ...item,
      totalActive: item.waiting + item.interviewing,
    }))
    .sort((a, b) => {
      const byActive = b.totalActive - a.totalActive;
      if (byActive !== 0) {
        return byActive;
      }
      return a.facultyName.localeCompare(b.facultyName);
    });
}

function getAverageWaitLabel(rows) {
  const waitMinutes = [];
  rows.forEach((row) => {
    const createdAt = Date.parse(String(row.created_at || ''));
    const startedAt = Date.parse(String(row.interview_started_at || ''));
    if (Number.isNaN(createdAt) || Number.isNaN(startedAt)) {
      return;
    }

    const diffMinutes = Math.round((startedAt - createdAt) / 60000);
    if (diffMinutes >= 0 && diffMinutes <= 24 * 60) {
      waitMinutes.push(diffMinutes);
    }
  });

  if (!waitMinutes.length) {
    return '--';
  }

  const total = waitMinutes.reduce((sum, value) => sum + value, 0);
  const average = Math.round(total / waitMinutes.length);
  return `${average} min`;
}

function getNoShowRateLabel(rows) {
  if (!rows.length) {
    return '0%';
  }

  const noShowCount = rows.filter((row) => String(row.status || '').toLowerCase() === 'no_show').length;
  const rate = Math.round((noShowCount / rows.length) * 100);
  return `${rate}%`;
}

function getTopConcernsLabel(rows) {
  const concernMap = new Map();

  rows.forEach((row) => {
    const concern = String(row.concern || '').trim();
    if (!concern) {
      return;
    }
    concernMap.set(concern, (concernMap.get(concern) || 0) + 1);
  });

  if (!concernMap.size) {
    return 'No data yet.';
  }

  return Array.from(concernMap.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([concern, count]) => `${concern} (${count})`)
    .join(', ');
}

async function loadActivityLogs() {
  const metaEl = document.getElementById('activity-meta');
  const body = document.getElementById('activity-body');
  if (!body) {
    return;
  }

  const { data, error } = await supabaseClient
    .from(ACTIVITY_LOGS_TABLE)
    .select('id, created_at, actor_email, actor_role, action, target_type, target_id, details')
    .order('created_at', { ascending: false })
    .limit(400);

  if (error) {
    latestActivityRows = [];
    body.innerHTML = '<tr><td colspan="6">Activity logs unavailable. Run activity_logs SQL setup first.</td></tr>';
    if (metaEl) {
      metaEl.textContent = 'Activity logs unavailable.';
    }
    return;
  }

  latestActivityRows = data || [];
  renderActivityLogs(latestActivityRows);
}

function renderActivityLogs(rows) {
  const body = document.getElementById('activity-body');
  const metaEl = document.getElementById('activity-meta');
  if (!body) {
    return;
  }

  const filteredRows = (rows || []).filter((row) => {
    const role = String(row.actor_role || '').toLowerCase();
    if (selectedActivityRole !== 'all' && role !== selectedActivityRole) {
      return false;
    }

    if (!activitySearchText) {
      return true;
    }

    const haystack = [
      row.actor_email || '',
      row.actor_role || '',
      row.action || '',
      row.target_type || '',
      row.target_id || '',
      JSON.stringify(row.details || {}),
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(activitySearchText);
  });

  if (!filteredRows.length) {
    body.innerHTML = '<tr><td colspan="6">No activity logs found.</td></tr>';
    if (metaEl) {
      metaEl.textContent = 'No activity logs for current filter.';
    }
    return;
  }

  body.innerHTML = filteredRows
    .map((row) => {
      const time = formatDateTime(row.created_at);
      const target = formatTargetHtml(row.target_type, row.target_id);
      const details = formatDetailsHtml(row.details);
      return `
        <tr>
          <td>${escapeHtml(time)}</td>
          <td>${escapeHtml(row.actor_email || 'N/A')}</td>
          <td>${escapeHtml(row.actor_role || '')}</td>
          <td>${escapeHtml(row.action || '')}</td>
          <td>${target}</td>
          <td>${details}</td>
        </tr>
      `;
    })
    .join('');

  if (metaEl) {
    metaEl.textContent = `${filteredRows.length} activity log(s) shown.`;
  }
}

async function safeCreateActivityLog({ actorRole, action, targetType = null, targetId = null, details = null }) {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();

  const payload = {
    actor_email: user?.email || null,
    actor_role: actorRole || 'admin',
    action: action || 'unknown_action',
    target_type: targetType,
    target_id: targetId ? String(targetId) : null,
    details: details || {},
  };

  const { error } = await supabaseClient.from(ACTIVITY_LOGS_TABLE).insert(payload);
  if (error) {
    console.warn('Activity log insert skipped:', error.message);
    return;
  }

  void loadActivityLogs();
}

function formatDateTime(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) {
    return String(value || '');
  }
  return date.toLocaleString();
}

function formatDetails(details) {
  if (!details) {
    return '-';
  }
  try {
    return JSON.stringify(details);
  } catch (error) {
    return String(details);
  }
}

function formatTargetHtml(targetType, targetId) {
  const type = String(targetType || '').trim();
  const id = String(targetId || '').trim();
  if (!type && !id) {
    return '-';
  }

  const compactType = type || 'target';
  const compactId = id || '-';
  const shortId = compactId.length > 22 ? `${compactId.slice(0, 8)}...${compactId.slice(-8)}` : compactId;

  return `
    <div class="activity-target">
      <div class="activity-target-type">${escapeHtml(compactType)}</div>
      <code class="activity-target-id" title="${escapeHtml(compactId)}">${escapeHtml(shortId)}</code>
    </div>
  `;
}

function formatDetailsHtml(details) {
  if (!details) {
    return '-';
  }

  let payload = details;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (error) {
      return `<span title="${escapeHtml(payload)}">${escapeHtml(truncateText(payload, 120))}</span>`;
    }
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    const raw = String(payload);
    return `<span title="${escapeHtml(raw)}">${escapeHtml(truncateText(raw, 120))}</span>`;
  }

  const priorityOrder = [
    'studentNumber',
    'facultyName',
    'nextStatus',
    'preferredTime',
    'concern',
    'hasMeetLink',
    'facultyId',
  ];

  const allKeys = Object.keys(payload);
  const orderedKeys = priorityOrder
    .filter((key) => allKeys.includes(key))
    .concat(allKeys.filter((key) => !priorityOrder.includes(key)))
    .slice(0, 6);

  if (!orderedKeys.length) {
    return '-';
  }

  return `
    <div class="activity-details">
      ${orderedKeys
        .map((key) => {
          const value = payload[key];
          const textValue = value === null || value === undefined ? '-' : String(value);
          const displayValue = truncateText(textValue, 56);
          return `
            <div class="activity-detail-row">
              <span class="activity-detail-key">${escapeHtml(key)}:</span>
              <span class="activity-detail-value" title="${escapeHtml(textValue)}">${escapeHtml(displayValue)}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function truncateText(value, limit) {
  const text = String(value || '');
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function exportConsultationsCsv() {
  const rows = latestConsultationRows || [];
  if (!rows.length) {
    setStatus('No consultation data to export for current filter.', 'error');
    return;
  }

  const header = [
    'queue_date',
    'student_number',
    'faculty_name',
    'concern',
    'preferred_time',
    'status',
    'created_at',
  ];

  const csvRows = [];
  csvRows.push(['EARIST Queue System - Consultation Export']);
  csvRows.push([`Range`, getHistoryLabel(selectedHistoryFilter)]);
  csvRows.push([`Faculty Filter`, selectedConsultationFaculty]);
  csvRows.push([`Status Filter`, selectedConsultationStatus]);
  csvRows.push([`Date From`, selectedConsultationDateFrom || '']);
  csvRows.push([`Date To`, selectedConsultationDateTo || '']);
  csvRows.push([`Exported At`, new Date().toISOString()]);
  csvRows.push([]);
  csvRows.push(['Today Summary']);
  csvRows.push(['Waiting Today', latestOverviewSummary.waitingToday]);
  csvRows.push(['Interviewing Now', latestOverviewSummary.interviewingNow]);
  csvRows.push(['Completed Today', latestOverviewSummary.completedToday]);
  csvRows.push(['Avg Wait (Today)', latestOverviewSummary.avgWaitLabel]);
  csvRows.push(['No-show Rate (Today)', latestOverviewSummary.noShowRateLabel]);
  csvRows.push(['Top Concerns (Today)', latestOverviewSummary.topConcernsLabel]);
  csvRows.push([]);
  csvRows.push(header);

  rows.forEach((row) => {
    const queueDate = row.queue_date || String(row.created_at || '').slice(0, 10) || '';
    csvRows.push([
      queueDate,
      row.student_number || '',
      row.faculty_name || '',
      row.concern || '',
      row.preferred_time || '',
      row.status || '',
      row.created_at || '',
    ]);
  });

  const csvText = csvRows
    .map((line) => line.map(toCsvCell).join(','))
    .join('\n');

  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const timestamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
  anchor.href = url;
  anchor.download = `consultations_${selectedHistoryFilter}_${timestamp}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  setStatus('Consultation CSV exported.', 'success');
}

function toCsvCell(value) {
  const safe = String(value ?? '');
  const escaped = safe.replaceAll('"', '""');
  return `"${escaped}"`;
}

function exportConsultationsPdf() {
  const rows = latestConsultationRows || [];
  if (!rows.length) {
    setStatus('No consultation data to export for current filter.', 'error');
    return;
  }

  const rangeLabel = getHistoryLabel(selectedHistoryFilter);
  const facultyLabel = selectedConsultationFaculty;
  const statusLabel = selectedConsultationStatus;
  const fromLabel = selectedConsultationDateFrom || '';
  const toLabel = selectedConsultationDateTo || '';
  const exportedAt = new Date().toLocaleString();
  const summary = latestOverviewSummary;

  const rowsHtml = rows
    .map((row, index) => {
      const queueDate = row.queue_date || String(row.created_at || '').slice(0, 10) || '';
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(queueDate)}</td>
          <td>${escapeHtml(row.student_number || '')}</td>
          <td>${escapeHtml(row.faculty_name || '')}</td>
          <td>${escapeHtml(row.concern || '')}</td>
          <td>${escapeHtml(row.preferred_time || '')}</td>
          <td>${escapeHtml(row.status || '')}</td>
        </tr>
      `;
    })
    .join('');

  const reportHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>EARIST Consultation Report</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1b2738; margin: 24px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    .meta { margin-bottom: 16px; color: #4a5f7a; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
    .card { border: 1px solid #d8e1ec; border-radius: 8px; padding: 10px; }
    .label { font-size: 12px; color: #5b6f88; margin-bottom: 4px; }
    .value { font-size: 18px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #d8e1ec; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #f1f6fc; }
    .footer { margin-top: 14px; font-size: 11px; color: #5b6f88; }
    @media print {
      body { margin: 12mm; }
      .summary-grid { page-break-inside: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
    }
  </style>
</head>
<body>
  <h1>EARIST Queue System - Consultation Report</h1>
  <div class="meta">
    <div><strong>Range:</strong> ${escapeHtml(rangeLabel)}</div>
    <div><strong>Faculty Filter:</strong> ${escapeHtml(facultyLabel)}</div>
    <div><strong>Status Filter:</strong> ${escapeHtml(statusLabel)}</div>
    <div><strong>Date From:</strong> ${escapeHtml(fromLabel)}</div>
    <div><strong>Date To:</strong> ${escapeHtml(toLabel)}</div>
    <div><strong>Exported At:</strong> ${escapeHtml(exportedAt)}</div>
  </div>

  <div class="summary-grid">
    <div class="card"><div class="label">Waiting Today</div><div class="value">${escapeHtml(String(summary.waitingToday))}</div></div>
    <div class="card"><div class="label">Interviewing Now</div><div class="value">${escapeHtml(String(summary.interviewingNow))}</div></div>
    <div class="card"><div class="label">Completed Today</div><div class="value">${escapeHtml(String(summary.completedToday))}</div></div>
    <div class="card"><div class="label">Avg Wait (Today)</div><div class="value">${escapeHtml(String(summary.avgWaitLabel))}</div></div>
    <div class="card"><div class="label">No-show Rate (Today)</div><div class="value">${escapeHtml(String(summary.noShowRateLabel))}</div></div>
    <div class="card"><div class="label">Top Concerns (Today)</div><div class="value">${escapeHtml(String(summary.topConcernsLabel))}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Queue Date</th>
        <th>Student #</th>
        <th>Faculty</th>
        <th>Concern</th>
        <th>Preferred Time</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <p class="footer">Generated by EARIST Queue System Admin Dashboard</p>
</body>
</html>
  `;

  const popup = window.open('', '_blank', 'width=1200,height=900');
  if (!popup) {
    setStatus('Popup blocked. Please allow popups, then try Export PDF again.', 'error');
    return;
  }

  popup.document.open();
  popup.document.write(reportHtml);
  popup.document.close();

  popup.focus();
  setTimeout(() => {
    popup.print();
  }, 300);

  setStatus('PDF report opened. Use Print dialog -> Save as PDF.', 'success');
}
