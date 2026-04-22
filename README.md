# CW-411 Range Checker
### Berklee College of Music — Contemporary Writing & Production

A web tool that analyzes student MusicXML scores and flags every note outside CW-411 safe ranges.

---

## Deploy to Vercel (10 minutes, free forever)

### Step 1 — Create a GitHub account
Go to [github.com](https://github.com) and sign up if you don't have an account.

### Step 2 — Create a new repository
1. Click the **+** icon (top right) → **New repository**
2. Name it `cw411-range-checker`
3. Keep it **Public**
4. Click **Create repository**

### Step 3 — Upload these files
On your new repo page, click **uploading an existing file** (in the quick setup box).

Upload the following files, maintaining this exact structure:
```
index.html
package.json
vite.config.js
src/main.jsx
src/App.jsx
```

> **Important:** For the `src/` folder, drag both files together — GitHub will create the folder automatically.

Click **Commit changes**.

### Step 4 — Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and click **Sign Up**
2. Choose **Continue with GitHub** — authorize Vercel
3. Click **Add New → Project**
4. Find `cw411-range-checker` and click **Import**
5. Leave all settings as default — Vercel auto-detects Vite
6. Click **Deploy**

⏱ Wait ~60 seconds. Done.

Your live URL will be something like:
`https://cw411-range-checker.vercel.app`

Post this link on your Canvas/Blackboard course page.

---

## Every future update is automatic
Edit any file on GitHub → Vercel re-deploys in ~30 seconds.

## Running locally (optional)
```bash
npm install
npm run dev
```
