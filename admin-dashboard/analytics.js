const SUPABASE_URL = 'https://yhryfoimpqzmaaymsaat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6AxrmJlwC7pTgRevGgjTtA_F5b2F8Eb';

// Initialize Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Chart instances
let statusChart, peakHoursChart, facultyChart;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadAnalytics();
  
  // Refresh data every 5 minutes
  setInterval(loadAnalytics, 5 * 60 * 1000);
});

// Check if user is admin
async function checkAuth() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data?.session?.user?.email) {
    window.location.href = '../index.html';
    return;
  }

  const email = data.session.user.email;
  const { data: adminData } = await supabaseClient
    .from('admins')
    .select('email')
    .eq('email', email)
    .limit(1);

  if (!adminData || adminData.length === 0) {
    window.location.href = '../index.html';
  }
}

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = '../index.html';
});

// Load all analytics data
async function loadAnalytics() {
  try {
    const consultations = await fetchConsultations();
    
    updateSummaryCards(consultations);
    updateCharts(consultations);
    updateFacultyTable(consultations);
  } catch (error) {
    console.error('Error loading analytics:', error);
  }
}

// Fetch all consultations
async function fetchConsultations() {
  const { data, error } = await supabaseClient
    .from('consultations')
    .select('*, faculty!inner(full_name, name, email)');

  if (error) {
    console.error('Error fetching consultations:', error);
    return [];
  }

  return data || [];
}

// Update summary cards
function updateSummaryCards(consultations) {
  const now = new Date();
  const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const thisMonth = consultations.filter(c => 
    new Date(c.created_at) >= monthAgo
  );

  // Total consultations
  document.getElementById('total-consultations').textContent = thisMonth.length;

  // Average wait time
  const avgWait = calculateAverageWaitTime(consultations);
  document.getElementById('avg-wait-time').textContent = `${Math.round(avgWait)} min`;

  // No-show rate
  const noShowRate = calculateNoShowRate(thisMonth);
  document.getElementById('no-show-rate').textContent = `${noShowRate.toFixed(1)}%`;

  // Faculty count
  const activeFaculty = new Set(consultations.map(c => c.faculty_id)).size;
  document.getElementById('faculty-count').textContent = activeFaculty;
}

// Calculate average wait time (pending to interviewing)
function calculateAverageWaitTime(consultations) {
  const waitTimes = consultations
    .filter(c => c.status === 'completed' && c.created_at && c.interview_started_at)
    .map(c => {
      const created = new Date(c.created_at);
      const started = new Date(c.interview_started_at);
      return (started - created) / (1000 * 60); // Convert to minutes
    })
    .filter(t => t > 0 && t < 1440); // Filter out outliers (> 24 hours)

  return waitTimes.length > 0 
    ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length 
    : 0;
}

// Calculate no-show rate
function calculateNoShowRate(consultations) {
  if (consultations.length === 0) return 0;
  
  const noShows = consultations.filter(c => c.status === 'no_show').length;
  return (noShows / consultations.length) * 100;
}

// Update charts
function updateCharts(consultations) {
  updateStatusChart(consultations);
  updatePeakHoursChart(consultations);
  updateFacultyChart(consultations);
}

// Status chart (Pie)
function updateStatusChart(consultations) {
  const statusCounts = {
    completed: consultations.filter(c => c.status === 'completed').length,
    pending: consultations.filter(c => c.status === 'pending').length,
    interviewing: consultations.filter(c => c.status === 'interviewing').length,
    cancelled: consultations.filter(c => c.status === 'cancelled').length,
    no_show: consultations.filter(c => c.status === 'no_show').length,
  };

  const ctx = document.getElementById('statusChart').getContext('2d');
  
  if (statusChart) {
    statusChart.destroy();
  }

  statusChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Completed', 'Pending', 'Interviewing', 'Cancelled', 'No-Show'],
      datasets: [{
        data: [
          statusCounts.completed,
          statusCounts.pending,
          statusCounts.interviewing,
          statusCounts.cancelled,
          statusCounts.no_show,
        ],
        backgroundColor: ['#2ecc71', '#3498db', '#f39c12', '#95a5a6', '#e74c3c'],
        borderColor: '#fff',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
        },
      },
    },
  });
}

// Peak hours chart
function updatePeakHoursChart(consultations) {
  const last7Days = consultations.filter(c => {
    const cDate = new Date(c.created_at);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return cDate >= weekAgo;
  });

  const hourCounts = new Array(24).fill(0);
  last7Days.forEach(c => {
    const hour = new Date(c.created_at).getHours();
    hourCounts[hour]++;
  });

  const ctx = document.getElementById('peakHoursChart').getContext('2d');
  
  if (peakHoursChart) {
    peakHoursChart.destroy();
  }

  peakHoursChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Array.from({length: 24}, (_, i) => `${i}:00`),
      datasets: [{
        label: 'Consultations',
        data: hourCounts,
        backgroundColor: '#667eea',
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 },
        },
      },
    },
  });
}

// Faculty performance chart
function updateFacultyChart(consultations) {
  const facultyStats = {};
  
  consultations.forEach(c => {
    if (!c.faculty) return;
    
    const facultyName = c.faculty.full_name || c.faculty.name || c.faculty.email;
    if (!facultyStats[facultyName]) {
      facultyStats[facultyName] = {
        total: 0,
        completed: 0,
        noShow: 0,
      };
    }
    
    facultyStats[facultyName].total++;
    if (c.status === 'completed') facultyStats[facultyName].completed++;
    if (c.status === 'no_show') facultyStats[facultyName].noShow++;
  });

  const facultyNames = Object.keys(facultyStats).slice(0, 10); // Top 10
  const completionRates = facultyNames.map(name => 
    (facultyStats[name].completed / facultyStats[name].total * 100)
  );

  const ctx = document.getElementById('facultyChart').getContext('2d');
  
  if (facultyChart) {
    facultyChart.destroy();
  }

  facultyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: facultyNames,
      datasets: [{
        label: 'Completion Rate (%)',
        data: completionRates,
        backgroundColor: '#667eea',
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      indexAxis: 'x',
      plugins: {
        legend: { display: true },
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { suffix: '%' },
        },
      },
    },
  });
}

// Update faculty table
function updateFacultyTable(consultations) {
  const facultyStats = {};

  consultations.forEach(c => {
    if (!c.faculty) return;
    
    const facultyName = c.faculty.full_name || c.faculty.name || c.faculty.email;
    if (!facultyStats[facultyName]) {
      facultyStats[facultyName] = {
        total: 0,
        completed: 0,
        noShow: 0,
        waitTimes: [],
      };
    }

    facultyStats[facultyName].total++;
    if (c.status === 'completed') facultyStats[facultyName].completed++;
    if (c.status === 'no_show') facultyStats[facultyName].noShow++;

    if (c.created_at && c.interview_started_at) {
      const wait = (new Date(c.interview_started_at) - new Date(c.created_at)) / (1000 * 60);
      if (wait > 0 && wait < 1440) {
        facultyStats[facultyName].waitTimes.push(wait);
      }
    }
  });

  const tbody = document.getElementById('faculty-stats-tbody');
  tbody.innerHTML = '';

  Object.entries(facultyStats)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([name, stats]) => {
      const completionRate = ((stats.completed / stats.total) * 100).toFixed(1);
      const noShowRate = ((stats.noShow / stats.total) * 100).toFixed(1);
      const avgWait = stats.waitTimes.length > 0
        ? (stats.waitTimes.reduce((a, b) => a + b, 0) / stats.waitTimes.length).toFixed(1)
        : '—';

      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${escapeHtml(name)}</strong></td>
        <td>${stats.total}</td>
        <td>${avgWait === '—' ? '—' : avgWait + ' min'}</td>
        <td class="metric-good">${completionRate}%</td>
        <td class="${noShowRate > 10 ? 'metric-danger' : 'metric-good'}">${noShowRate}%</td>
      `;
      tbody.appendChild(row);
    });

  if (Object.keys(facultyStats).length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading">No data available</td></tr>';
  }
}

// Escape HTML
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
