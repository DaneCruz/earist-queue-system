# Quick Reference - Common Tasks After Deployment

## 📌 The Golden Rule
**Push to GitHub → Auto-deploy to Vercel + Supabase**

---

## 🎯 Common Scenarios

### Scenario 1: Fix a bug in student dashboard
```powershell
# Edit the file (e.g., improve mobile layout)
code student-dashboard/dashboard.css

# Push to GitHub
git add student-dashboard/
git commit -m "fix: Improve mobile button sizing"
git push origin main

# ✅ Done! Check results in 1 minute at: https://earist-queue-system.vercel.app
```

### Scenario 2: Add new field to database
```powershell
# 1. Edit SQL file
code supabase/sql/activity_logs.sql
# Add your new column

# 2. Push to GitHub
git add supabase/sql/
git commit -m "feat: Add consultation notes field"
git push origin main

# 3. Apply manually to live database (GitHub Actions won't auto-apply SQL)
# Go to Supabase Dashboard → SQL Editor → Run the updated file

# 4. Other devs can replicate with:
supabase db pull
```

### Scenario 3: Fix email sending in Edge Function
```powershell
# Edit the function
code supabase/functions/send-queue-email/index.ts

# Push to GitHub
git add supabase/functions/send-queue-email/
git commit -m "fix: Improve email delivery timeout"
git push origin main

# ✅ Automatically deployed in ~2-3 minutes
# Check logs: Supabase Dashboard → Functions → send-queue-email
```

### Scenario 4: Update login page styling
```powershell
# Edit landing page
code index.html
# or
code styles.css

# Push to GitHub
git add .
git commit -m "design: Refresh landing page colors"
git push origin main

# ✅ Live in 30 seconds! https://earist-queue-system.vercel.app
```

### Scenario 5: Roll back a bad change
```powershell
# See commit history
git log --oneline

# Revert to previous commit
git revert HEAD
# or
git reset --hard HEAD~1

# Push the revert
git push origin main

# ✅ Live version rolls back automatically
```

---

## 🔍 Check Deployment Status

### Is it deployed yet?

**Fastest way:**
```powershell
# Visit GitHub Actions
# Go to: https://github.com/YOUR_USERNAME/earist-queue-system/actions
# Look for green ✅ or red ❌ next to your last commit
```

**Check specific deployments:**
| What | Where to check |
|------|---|
| Frontend deployed | Vercel Dashboard or visit live URL |
| Edge Functions deployed | Supabase Dashboard → Functions → Logs |
| Errors/logs | GitHub Actions → deployment workflow |

---

## 🐛 Debug Issues

### "I pushed but site didn't update"
1. Check GitHub Actions (Actions tab) - is it green ✅?
2. If red ❌ - click to see error
3. Clear browser cache (Ctrl+Shift+Del)
4. Wait 2-3 minutes max

### "Edge Function not working"
1. Go to Supabase Dashboard
2. Click **Functions** 
3. Click the function name
4. Check **Recent Invocations** for errors
5. View the function code to verify changes were saved

### "Database changes not working"
SQL changes must be manually applied:
1. Go to Supabase Dashboard → **SQL Editor**
2. Paste the SQL from your file
3. Run it (click ▶)
4. Verify success

---

## 📱 Test on Phone

1. Find your computer's IP:
   ```powershell
   ipconfig
   # Look for "IPv4 Address" (e.g., 192.168.1.100)
   ```

2. Run local server:
   ```powershell
   python -m http.server 8000
   ```

3. On your phone, visit:
   ```
   http://192.168.1.100:8000
   ```

4. Or test live version:
   ```
   https://earist-queue-system.vercel.app
   ```

---

## 📊 Useful Links

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Supabase Dashboard**: https://app.supabase.com/project/yhryfoimpqzmaaymsaat
- **GitHub Deployments**: https://github.com/YOUR_USERNAME/earist-queue-system/actions
- **Your Live Site**: https://earist-queue-system.vercel.app

---

## 🚀 Advanced (Optional)

### Preview branch changes before going live
```powershell
# Create feature branch
git checkout -b feature/new-queue-filter
# ... make changes ...
git push origin feature/new-queue-filter

# In Vercel: Auto-creates preview URL for this branch
# Share preview before merging to main
# Once approved:
git checkout main
git merge feature/new-queue-filter
git push origin main
# ✅ Goes live!
```

### View deployment history
```powershell
# See all Vercel deployments
vercel list --prod

# See all your commits
git log --oneline
```

---

## ✅ Checklist Before Each Deployment

1. ☑ Test locally
2. ☑ Commit message is clear
3. ☑ No secrets in commits (`git config`check)
4. ☑ All files saved
5. ☑ Run `git push origin main`
6. ☑ Check GitHub Actions for green ✅
7. ☑ Visit live URL to verify

Done! 🎉
