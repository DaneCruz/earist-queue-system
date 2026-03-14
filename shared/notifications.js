// Quick Notification System
class NotificationManager {
  constructor() {
    this.container = document.getElementById('notifications-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'notifications-container';
      this.container.className = 'notifications-container';
      document.body.appendChild(this.container);
    }
  }

  show(title, message, type = 'info', duration = 5000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const icons = {
      success: '✓',
      info: 'ℹ',
      warning: '⚠',
      error: '✕',
    };

    notification.innerHTML = `
      <span class="notification-icon">${icons[type] || '•'}</span>
      <div class="notification-content">
        <div class="notification-title">${this.escapeHtml(title)}</div>
        <div class="notification-message">${this.escapeHtml(message)}</div>
      </div>
      <button class="notification-close">×</button>
    `;

    notification.querySelector('.notification-close').addEventListener('click', () => {
      this.remove(notification);
    });

    this.container.appendChild(notification);

    if (duration > 0) {
      setTimeout(() => this.remove(notification), duration);
    }

    return notification;
  }

  remove(notification) {
    notification.classList.add('closing');
    setTimeout(() => notification.remove(), 300);
  }

  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }
}

// Export for use
const notificationManager = new NotificationManager();
