const SUPABASE_URL = 'https://yhryfoimpqzmaaymsaat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6AxrmJlwC7pTgRevGgjTtA_F5b2F8Eb';
const STUDENT_DASHBOARD_PATH = 'student-dashboard/student-dashboard.html';
const STUDENT_SESSION_KEY = 'student_session';
const KIOSK_IDLE_TIMEOUT_MS = 90 * 1000;
let idleTimer = null;
let loginBusy = false;

if (!window.supabase) {
  throw new Error('Supabase SDK failed to load.');
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

initializeKiosk();

function initializeKiosk() {
  sessionStorage.removeItem(STUDENT_SESSION_KEY);
  document.getElementById('barcode-mode-btn')?.addEventListener('click', showBarcodeMode);
  document.getElementById('manual-mode-btn')?.addEventListener('click', showManualMode);
  document.getElementById('student-login-btn')?.addEventListener('click', () => {
    void manualLogin();
  });
  document.getElementById('barcode-login-btn')?.addEventListener('click', () => {
    void barcodeLogin();
  });
  document.getElementById('barcode-scan-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void barcodeLogin();
    }
  });
  ['click', 'touchstart', 'keydown', 'mousemove'].forEach((eventName) => {
    document.addEventListener(eventName, resetIdleTimer, { passive: true });
  });
  resetIdleTimer();
}

function showBarcodeMode() {
  document.getElementById('barcode-section')?.classList.remove('hidden');
  document.getElementById('manual-section')?.classList.add('hidden');
  const scanInput = document.getElementById('barcode-scan-input');
  if (scanInput) {
    scanInput.value = '';
    scanInput.focus();
  }
  setStatus('', '');
}

function showManualMode() {
  document.getElementById('manual-section')?.classList.remove('hidden');
  document.getElementById('barcode-section')?.classList.add('hidden');
  setStatus('', '');
}

async function barcodeLogin() {
  if (loginBusy) {
    return;
  }
  const rawValue = (document.getElementById('barcode-scan-input')?.value || '').trim();
  const studentNumber = normalizeScannedStudentNumber(rawValue);
  if (!studentNumber) {
    setStatus('No barcode data detected. Please scan again.', 'error');
    return;
  }

  await loginByStudentNumber(studentNumber);
}

async function manualLogin() {
  if (loginBusy) {
    return;
  }
  const studentNumber = (document.getElementById('student-number')?.value || '').trim();
  if (!studentNumber) {
    setStatus('Please enter a valid student number.', 'error');
    return;
  }

  await loginByStudentNumber(studentNumber);
}

async function loginByStudentNumber(studentNumberInput) {
  loginBusy = true;
  setButtonsDisabled(true);
  const studentNumber = normalizeScannedStudentNumber(studentNumberInput);
  const { data, error } = await supabaseClient
    .from('students')
    .select('student_number, full_name, email')
    .eq('student_number', studentNumber)
    .limit(1);

  if (error) {
    setStatus('Login failed: ' + error.message, 'error');
    loginBusy = false;
    setButtonsDisabled(false);
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    setStatus('Student not found.', 'error');
    loginBusy = false;
    setButtonsDisabled(false);
    return;
  }

  sessionStorage.setItem(
    STUDENT_SESSION_KEY,
    JSON.stringify({
      studentNumber,
      studentName: data[0]?.full_name || '',
      studentEmail: data[0]?.email || '',
      loginAt: Date.now(),
    })
  );

  setStatus('Login successful. Redirecting...', 'success');
  window.location.href = STUDENT_DASHBOARD_PATH;
}

function normalizeScannedStudentNumber(rawValue) {
  const cleaned = String(rawValue || '').replaceAll(/\s+/g, '').toUpperCase();
  if (!cleaned) {
    return '';
  }

  const canonicalMatch = cleaned.match(/\d{3}-\d{5}[A-Z]/);
  if (canonicalMatch) {
    return canonicalMatch[0];
  }

  return cleaned;
}

function setStatus(message, type) {
  const el = document.getElementById('status-message');
  if (!el) {
    return;
  }
  el.textContent = message;
  el.classList.remove('error', 'success');
  if (type) {
    el.classList.add(type);
  }
}

function setButtonsDisabled(disabled) {
  document.getElementById('student-login-btn')?.toggleAttribute('disabled', disabled);
  document.getElementById('barcode-login-btn')?.toggleAttribute('disabled', disabled);
}

function resetIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(() => {
    clearKioskForm('Session reset for privacy. Please enter your student number again.');
  }, KIOSK_IDLE_TIMEOUT_MS);
}

function clearKioskForm(statusText = '') {
  loginBusy = false;
  setButtonsDisabled(false);
  const studentInput = document.getElementById('student-number');
  const barcodeInput = document.getElementById('barcode-scan-input');
  if (studentInput) {
    studentInput.value = '';
  }
  if (barcodeInput) {
    barcodeInput.value = '';
  }
  showManualMode();
  setStatus(statusText, statusText ? 'success' : '');
}
