const SUPABASE_URL = 'https://yhryfoimpqzmaaymsaat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6AxrmJlwC7pTgRevGgjTtA_F5b2F8Eb';
const FACULTY_TABLE = 'faculty';
const ADMIN_TABLE = 'admins';
const FACULTY_DASHBOARD_PATH = 'faculty-dashboard/faculty-dashboard.html';
const ADMIN_DASHBOARD_PATH = 'admin-dashboard/admin-dashboard.html';
const LAST_FACULTY_EMAIL_KEY = 'last_faculty_email';
const LAST_ADMIN_EMAIL_KEY = 'last_admin_email';
const FACULTY_STATUS_REFRESH_MS = 20000;

if (!window.supabase) {
  throw new Error('Supabase SDK failed to load.');
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

initializeLanding();

// Only auto-redirect if not coming from kiosk mode
const urlParams = new URLSearchParams(window.location.search);
if (!urlParams.has('kiosk')) {
  void restoreSessionAndRoute();
} else {
  // Clean up the URL by removing the kiosk parameter
  window.history.replaceState({}, document.title, window.location.pathname);
}

void loadFacultyStatusBoard();
setInterval(() => {
  void loadFacultyStatusBoard();
}, FACULTY_STATUS_REFRESH_MS);

function initializeLanding() {
  const facultyButton = document.getElementById('faculty-btn');
  const adminButton = document.getElementById('admin-btn');
  const continueFacultyButton = document.getElementById('continue-faculty-btn');
  const continueAdminButton = document.getElementById('continue-admin-btn');

  if (facultyButton) {
    facultyButton.addEventListener('click', () => {
      void loginFaculty();
    });
  }

  if (adminButton) {
    adminButton.addEventListener('click', () => {
      void loginAdmin();
    });
  }

  if (continueFacultyButton) {
    continueFacultyButton.addEventListener('click', () => {
      void continueFaculty();
    });
  }

  if (continueAdminButton) {
    continueAdminButton.addEventListener('click', () => {
      void continueAdmin();
    });
  }

  const savedFacultyEmail = localStorage.getItem(LAST_FACULTY_EMAIL_KEY) || '';
  const savedAdminEmail = localStorage.getItem(LAST_ADMIN_EMAIL_KEY) || '';
  const facultyInput = document.getElementById('faculty-email');
  const adminInput = document.getElementById('admin-email');

  if (facultyInput && savedFacultyEmail) {
    facultyInput.value = savedFacultyEmail;
    continueFacultyButton.textContent = `Continue Faculty: ${savedFacultyEmail}`;
    continueFacultyButton.classList.remove('hidden');
  }

  if (adminInput && savedAdminEmail) {
    adminInput.value = savedAdminEmail;
    continueAdminButton.textContent = `Continue Admin: ${savedAdminEmail}`;
    continueAdminButton.classList.remove('hidden');
  }
}

async function restoreSessionAndRoute() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data?.session?.user?.email) {
    return;
  }

  const email = data.session.user.email;
  const isAdmin = await isAuthorizedByTable(ADMIN_TABLE, email);
  if (isAdmin) {
    localStorage.setItem(LAST_ADMIN_EMAIL_KEY, email);
    window.location.href = ADMIN_DASHBOARD_PATH;
    return;
  }

  const isFaculty = await isAuthorizedByTable(FACULTY_TABLE, email);
  if (isFaculty) {
    localStorage.setItem(LAST_FACULTY_EMAIL_KEY, email);
    window.location.href = FACULTY_DASHBOARD_PATH;
  }
}

async function continueFaculty() {
  const { data } = await supabaseClient.auth.getSession();
  const email = data?.session?.user?.email || '';
  if (!email) {
    await loginFaculty();
    return;
  }

  const isFaculty = await isAuthorizedByTable(FACULTY_TABLE, email);
  if (isFaculty) {
    window.location.href = FACULTY_DASHBOARD_PATH;
    return;
  }

  setStatus('Current Google session is not in faculty table.', 'error');
}

async function continueAdmin() {
  const { data } = await supabaseClient.auth.getSession();
  const email = data?.session?.user?.email || '';
  if (!email) {
    await loginAdmin();
    return;
  }

  const isAdmin = await isAuthorizedByTable(ADMIN_TABLE, email);
  if (isAdmin) {
    window.location.href = ADMIN_DASHBOARD_PATH;
    return;
  }

  setStatus('Current Google session is not in admins table.', 'error');
}

async function loginFaculty() {
  const email = (document.getElementById('faculty-email')?.value || '').trim();
  if (!isGmail(email)) {
    setStatus('Enter a valid faculty Gmail first.', 'error');
    return;
  }

  setStatus('Redirecting to Google for faculty login...', 'success');
  localStorage.setItem(LAST_FACULTY_EMAIL_KEY, email);
  await signInWithGoogle(email, FACULTY_DASHBOARD_PATH);
}

async function loginAdmin() {
  const email = (document.getElementById('admin-email')?.value || '').trim();
  if (!isGmail(email)) {
    setStatus('Enter a valid admin Gmail first.', 'error');
    return;
  }

  setStatus('Redirecting to Google for admin login...', 'success');
  localStorage.setItem(LAST_ADMIN_EMAIL_KEY, email);
  await signInWithGoogle(email, ADMIN_DASHBOARD_PATH);
}

async function signInWithGoogle(email, targetPath) {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      loginHint: email,
      redirectTo: `${window.location.origin}/${targetPath}`,
      queryParams: {
        prompt: 'select_account',
      },
    },
  });

  if (error) {
    setStatus(error.message, 'error');
  }
}

async function isAuthorizedByTable(table, email) {
  const { data, error } = await supabaseClient
    .from(table)
    .select('email')
    .eq('email', email)
    .limit(1);

  if (error) {
    console.error(`Lookup failed for ${table}:`, error.message);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

async function loadFacultyStatusBoard() {
  const list = document.getElementById('faculty-status-list');
  const meta = document.getElementById('faculty-status-meta');
  if (!list || !meta) {
    return;
  }

  const { data, error } = await supabaseClient
    .from(FACULTY_TABLE)
    .select('id, full_name, name, email, status, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Faculty status board load failed:', error.message);
    meta.textContent = 'Unable to load faculty status.';
    list.innerHTML = '';
    return;
  }

  const deduped = new Map();
  (data || []).forEach((row) => {
    const displayName = getFacultyDisplayName(row);
    const key = getFacultyIdentityKey(row, displayName);
    if (!deduped.has(key)) {
      deduped.set(key, {
        displayName,
        status: normalizeFacultyStatus(row.status),
      });
    }
  });

  const rows = Array.from(deduped.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  if (!rows.length) {
    meta.textContent = 'No faculty status records found.';
    list.innerHTML = '';
    return;
  }

  const available = rows.filter((item) => item.status === 'available').length;
  meta.textContent = `${available} available out of ${rows.length} faculty today.`;

  list.innerHTML = rows
    .map(
      (item) => `
      <div class="faculty-status-item">
        <span class="faculty-status-name">${escapeHtml(item.displayName)}</span>
        <span class="status-pill ${item.status}">${item.status}</span>
      </div>
    `
    )
    .join('');
}

function getFacultyDisplayName(row) {
  const primary = String(row.name || '').trim();
  const secondary = String(row.full_name || '').trim();

  if (primary && !looksLikeSerializedData(primary)) {
    return primary;
  }
  if (secondary && !looksLikeSerializedData(secondary)) {
    return secondary;
  }

  const email = String(row.email || '').trim().toLowerCase();
  if (email.includes('@')) {
    return email.split('@')[0];
  }

  return 'Faculty';
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

function normalizeFacultyStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return ['available', 'busy', 'offline'].includes(status) ? status : 'offline';
}

function looksLikeSerializedData(value) {
  const text = String(value || '').trim();
  return text.startsWith('{') || text.startsWith('[');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setStatus(message, type) {
  const status = document.getElementById('status-message');
  if (!status) {
    return;
  }

  status.textContent = message || '';
  status.classList.remove('error', 'success');
  if (type) {
    status.classList.add(type);
  }
}

function isGmail(email) {
  return /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(email);
}
