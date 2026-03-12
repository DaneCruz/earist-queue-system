# EARIST Queue System

A modern, mobile-responsive consultation queue management system built with HTML, CSS, JavaScript, and Supabase.

## 🚀 Quick Start

### Prerequisites
- Git
- Node.js 18+ (for Supabase CLI)
- GitHub account
- Vercel account (optional, for hosting)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/earist-queue-system.git
   cd earist-queue-system
   ```

2. **Start local development server**
   ```bash
   # Using Python (if installed)
   python -m http.server 8000
   
   # Or using Node.js
   npx http-server
   ```
   
   Visit `http://localhost:8000`

3. **Test on your phone**
   - Find your computer's IP: Run `ipconfig` in PowerShell
   - On phone, visit: `http://YOUR_IP:8000`

## 📱 System Components

### Frontend Pages
- **index.html** - Landing page (Faculty/Admin login)
- **kiosk.html** - Student check-in kiosk
- **student-dashboard/** - Student view (queue status)
- **faculty-dashboard/** - Faculty view (manage queue)
- **admin-dashboard/** - Admin view (system metrics)

### Backend (Supabase)
- **Database** - Consultations, faculty, admins
- **Edge Functions** - Queue emails, interview links
- **Real-time** - Live queue updates

## 🔧 Making Changes

### Edit Frontend
Just edit HTML/CSS/JS files and push to GitHub:
```bash
git add .
git commit -m "Fix: Improved mobile layout for phones"
git push origin main
```
✅ **Automatically deployed to Vercel in 30 seconds**

### Edit Database
Edit SQL files in `supabase/sql/` and push:
```bash
git add supabase/sql/
git commit -m "feat: Add consultation history tracking"
git push origin main
```
Manual deployment:
```bash
supabase db push --project-ref yhryfoimpqzmaaymsaat
```

### Edit Backend Functions
Edit JS/TypeScript in `supabase/functions/` and push:
```bash
git add supabase/functions/
git commit -m "fix: Improve email delivery reliability"
git push origin main
```
✅ **Automatically deployed via GitHub Actions**

## 🚢 Deployment

### First Time Setup

1. **Fork/Push to GitHub**
   ```bash
   git push origin main
   ```

2. **Deploy Frontend to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project" → Import your GitHub repo
   - Click "Deploy"
   - Get your live URL (e.g., `earist-queue.vercel.app`)

3. **Set up GitHub Actions Secrets**
   ```bash
   # Go to GitHub repo Settings → Secrets and Variables → Actions
   # Add these:
   VERCEL_TOKEN             # From Vercel settings
   VERCEL_ORG_ID            # From Vercel
   VERCEL_PROJECT_ID        # From Vercel after first deploy
   SUPABASE_ACCESS_TOKEN    # From Supabase account settings
   ```

4. **Deploy Supabase Functions**
   ```bash
   npm install -g supabase
   supabase functions deploy send-queue-email --project-ref yhryfoimpqzmaaymsaat
   supabase functions deploy start-interview --project-ref yhryfoimpqzmaaymsaat
   ```

### After First Deploy

**Everything is automatic!** Just:
1. Edit files locally
2. Commit and push to GitHub
3. ✅ Vercel redeploys frontend automatically
4. ✅ Edge Functions redeploy automatically (if you edited `supabase/functions/`)

## 📊 Live URLs

- **Production Frontend**: `https://earist-queue.vercel.app`
- **Supabase Dashboard**: `https://app.supabase.com/project/yhryfoimpqzmaaymsaat`
- **Faculty Login**: `https://earist-queue.vercel.app`
- **Student Kiosk**: `https://earist-queue.vercel.app/kiosk.html`

## 🛠️ Common Tasks

### Add a new page
1. Create `new-page.html` in root
2. Add CSS file: `new-page.css`
3. Add JS file: `new-page.js`
4. Push to GitHub
5. ✅ Auto-deployed

### Update database schema
1. Edit SQL in `supabase/sql/`
2. Run in Supabase Dashboard SQL Editor
3. Push changes to git
4. After push, others can replicate with `supabase db push`

### Update Edge Function logic
1. Edit file in `supabase/functions/FUNCTION_NAME/index.ts`
2. Push to GitHub
3. ✅ Auto-deployed

## 🔒 Environment Variables

These are already configured in code:
```javascript
const SUPABASE_URL = 'https://yhryfoimpqzmaaymsaat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6AxrmJlwC7pTgRevGgjTtA_F5b2F8Eb';
```

No secrets exposed - these are public keys only!

## 📚 File Structure

```
├── index.html                          # Landing page
├── kiosk.html                          # Student kiosk
├── kiosk.css / kiosk.js
├── student-dashboard/
│   ├── student-dashboard.html
│   ├── dashboard.css
│   └── dashboard.js
├── faculty-dashboard/
│   ├── faculty-dashboard.html
│   ├── faculty-dashboard.css
│   └── faculty-dashboard.js
├── admin-dashboard/
│   ├── admin-dashboard.html
│   ├── admin-dashboard.css
│   └── admin-dashboard.js
├── shared/
│   ├── virtual-keyboard.css
│   └── virtual-keyboard.js
├── supabase/
│   ├── config.toml
│   ├── functions/
│   │   ├── send-queue-email/
│   │   └── start-interview/
│   └── sql/
│       ├── activity_logs.sql
│       ├── daily_consultation_cleanup.sql
│       ├── faculty_availability_window.sql
│       ├── meet_link_lock_on_terminal_status.sql
│       ├── no_show_auto_close.sql
│       ├── slot_lock_used_for_day.sql
│       └── status_email_tracking.sql
└── .github/
    └── workflows/
        ├── deploy-vercel.yml          # Auto-deploy frontend
        └── deploy-supabase.yml        # Auto-deploy functions
```

## 🐛 Troubleshooting

### "Page not found after deployment"
- Check file paths use forward slashes `/`
- Verify all CSS/JS files are committed

### "Supabase connection fails"
- Verify `SUPABASE_URL` and `SUPABASE_KEY` in code
- Check Supabase project is active

### "Email not sending"
- Verify Edge Function secrets in Supabase
- Check `GMAIL_WEBHOOK_URL` is set in Supabase Secrets

## 📞 Support

- Supabase Dashboard: `https://app.supabase.com`
- Vercel Dashboard: `https://vercel.com/dashboard`
- GitHub Actions Logs: `https://github.com/YOUR_USERNAME/earist-queue-system/actions`

## 📝 License

Your project - All rights reserved
