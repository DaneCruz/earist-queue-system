# Deployment & CI/CD Setup Guide

## 📋 Prerequisites

Before starting, have these accounts ready:
- GitHub account
- Vercel account (free)
- Supabase account (already have: yhryfoimpqzmaaymsaat)

---

## 🚀 Step 1: Initial Setup (One Time Only)

### 1.1 Push to GitHub

```powershell
cd d:\Thesis\Code\Login-system

# Initialize git if not done
git init
git config user.name "Your Name"
git config user.email "your.email@gmail.com"

# Add all files
git add .
git commit -m "Initial commit: EARIST Queue System with mobile responsiveness"

# Add remote and push
git remote add origin https://github.com/YOUR_USERNAME/earist-queue-system.git
git branch -M main
git push -u origin main
```

### 1.2 Deploy to Vercel

1. Go to https://vercel.com and sign in with GitHub
2. Click **"New Project"**
3. Select your `earist-queue-system` repository
4. Click **"Import"**
5. **Configuration:**
   - Framework: Leave as "Other"
   - Root Directory: `.`
   - Build Command: Leave empty
   - Output Directory: `.`
6. Click **"Deploy"**
7. Wait ~30 seconds for deployment

✅ **You now have a live URL!** (e.g., `earist-queue-system.vercel.app`)

### 1.3 Get Your Vercel Secrets

1. In Vercel Dashboard, go to **Settings** → **Environment Variables**
2. Or go to https://vercel.com/account/tokens and create a new token
3. **Copy these three values:**
   - `VERCEL_TOKEN` - Your personal API token
   - `VERCEL_ORG_ID` - Your org/team ID
   - `VERCEL_PROJECT_ID` - Find in project settings

### 1.4 Add GitHub Actions Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"** and add:

| Name | Value |
|------|-------|
| `VERCEL_TOKEN` | Your token from step 1.3 |
| `VERCEL_ORG_ID` | Your org ID from step 1.3 |
| `VERCEL_PROJECT_ID` | Your project ID from step 1.3 |
| `SUPABASE_ACCESS_TOKEN` | [See section below] |

### 1.5 Get Supabase Access Token

1. Go to https://app.supabase.com
2. Click your **profile icon** (top right) → **Account Settings**
3. Go to **Access Tokens**
4. Click **"Generate new token"**
5. Name it: `github-actions-deploy`
6. Copy the token
7. Add to GitHub Secrets as `SUPABASE_ACCESS_TOKEN`

---

## 🔄 Step 2: Now You Can Edit & Deploy Automatically!

### Workflow:

**Every time you push to GitHub:**
1. ✅ Frontend automatically deploys to Vercel (~30 seconds)
2. ✅ Supabase Edge Functions auto-update (if you edited `supabase/functions/`)

### Example: Make a Change

```powershell
# Example: Fix a bug in student dashboard
$EDITOR student-dashboard/dashboard.css  # Edit something

# Commit and push
git add student-dashboard/dashboard.css
git commit -m "fix: Adjust mobile padding for better spacing"
git push origin main

# ✅ Automatically deployed in 30 seconds!
# Visit: https://earist-queue-system.vercel.app
```

---

## 🛠️ Manual Commands (If Needed)

### Deploy without GitHub Actions

```powershell
# Frontend
vercel --prod --token $env:VERCEL_TOKEN

# Supabase Functions
supabase functions deploy send-queue-email --project-ref yhryfoimpqzmaaymsaat
supabase functions deploy start-interview --project-ref yhryfoimpqzmaaymsaat
```

### Check Deployment Status

- **Vercel**: https://vercel.com/dashboard → Select project
- **GitHub Actions**: GitHub repo → **Actions** tab → View logs
- **Supabase**: https://app.supabase.com/project/yhryfoimpqzmaaymsaat/functions

---

## 🌳 Branching Strategy (Optional But Recommended)

### Use develop branch for testing:

```powershell
# Create develop branch
git checkout -b develop
git push origin develop

# Edit and test on develop
git add .
git commit -m "WIP: new feature"
git push origin develop

# When ready, merge to main
git checkout main
git merge develop
git push origin main
# ✅ Auto-deploys to production
```

### Update GitHub Actions to handle both:

The workflows already configured deploy on *both* `main` and `develop` branches:
- **main** → Production URL
- **develop** → Can create separate Vercel project for staging

---

## 📊 Monitoring & Debugging

### Check if deployment succeeded:

1. **GitHub Actions**: Go to repo **Actions** tab
   - Green ✅ = Success
   - Red ❌ = Failed (see logs)

2. **Vercel Logs**:
   ```powershell
   vercel logs --project earist-queue-system
   ```

3. **Supabase Function Logs**:
   - Go to Supabase Dashboard → Functions
   - Click the function → View execution logs

---

## 🚨 Troubleshooting Deployment

### Frontend won't update after push
- Wait 1-2 minutes for Vercel to rebuild
- Check GitHub Actions: https://github.com/YOUR_USERNAME/earist-queue-system/actions
- Clear browser cache (Ctrl+Shift+Del)

### Edge Functions not updating
- Check file path: Must be in `supabase/functions/FUNCTION_NAME/`
- Verify you pushed changes to `main` branch
- Check Supabase function logs for errors

### Secrets not working
- Verify exact names match the workflow file
- In GitHub: **Settings** → **Secrets** → verify they're added
- Re-run GitHub Actions workflow manually

---

## 🎉 You're Done!

Your setup is ready. Now:
1. Edit files locally
2. `git push` to GitHub
3. ✅ Automatic deployment!

No more manual deployment steps needed.
