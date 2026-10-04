# Your Personal Psych — Website

Landing page + login/signup (Supabase). After auth, users are redirected to the
Streamlit agent at `https://psyche-agent.streamlit.app/?uid=<userid>&name=<name>`.

## Setup (10 minutes)

### 1. Create a free Supabase project
1. Go to https://supabase.com → **New project** (free tier is enough).
2. Wait for it to finish, then open **Project Settings → API**.
3. Copy the **Project URL** and the **Publishable key** (starts with `sb_publishable_...`).
   Never use a Secret key in this website.
4. Open `config.js` in this folder and paste them between the quotes. Keep the quotes.

### 2. Create the patient registry (one-time SQL)
1. In Supabase: open the **SQL Editor** → **New query**.
2. Paste the entire contents of `supabase-setup.sql` from this folder → **Run**.
3. This creates the `profiles` table: every signup automatically gets a row whose
   `userid` (UUID primary key) is generated at account creation. That same userid
   is sent to the agent on every login — the agent keys all sessions, records and
   history off it, so one patient = one continuous record.

### 3. Configure Supabase auth
1. In Supabase: **Authentication → Providers** → make sure **Email** is enabled.
2. For the fastest testing, turn **"Confirm email" OFF**
   (Authentication → Providers → Email → Confirm email). You can turn it on later —
   the site handles both cases (with confirmation on, the user verifies via email,
   returns to the site, and is redirected automatically).

### 4. Deploy (free) — pick one
- **Netlify Drop:** go to https://app.netlify.com/drop → drag this whole folder in. Done — you get a URL instantly.
- **GitHub Pages:** push the folder to a repo → Settings → Pages → Deploy from branch.
- **Cloudflare Pages:** dashboard → Create → Pages → upload the folder.

No build step — it's plain HTML/CSS/JS. All files must stay together in one folder
(`supabase-js.min.js` especially — the page needs it next to `auth.html`).

### 5. Test
1. Open the deployed site → **Sign up free** → create an account.
2. You should land on `https://psyche-agent.streamlit.app/?uid=...&name=...`
3. The agent's sidebar should show your name (not a raw ID).
4. Log out, log back in → same `uid`, same history.

## How the handoff works
- `auth.js` listens to Supabase auth state. On `SIGNED_IN` (or an existing session),
  it redirects with a full page navigation (`window.location.href`) to the agent.
- `uid` = the patient's `userid` from the `profiles` table (primary key generated
  at signup; falls back to the auth user id if the row isn't readable yet).
  The agent keys all sessions/check-ins/reports off it.
- `name` = URL-encoded display name → shown in the agent's sidebar.

## Files
- `index.html` — landing/portfolio page (hero, how it works, agents, features, disclaimer)
- `auth.html` — login/signup (tabs)
- `auth.js` — Supabase auth + redirect logic
- `config.js` — **paste your Supabase Project URL + Publishable key here**
- `supabase-js.min.js` — Supabase library, bundled locally (no CDN needed)
- `supabase-setup.sql` — one-time database setup (profiles table + signup trigger)
- `styles.css` — dark navy/teal/violet theme
