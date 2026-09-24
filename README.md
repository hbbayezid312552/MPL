# 🏏 Cricket Tournament Management Website

A complete, real, working cricket tournament platform: public site with live scores, teams, players,
and points table, plus a Super Admin panel and a Match Operator scoring console. It runs entirely as
static HTML/CSS/JavaScript (perfect for free GitHub Pages hosting) and uses **Supabase's free tier**
for the database, authentication, file storage, and real-time updates.

No build step. No framework. Nothing to compile. Open `index.html` and it works, once connected to Supabase.

---

## What's included

- Public site: homepage, teams, team profile, players, player profile, points table, live match page
- Super Admin panel: teams, players, managers, matches, operators — full CRUD
- Match Operator console: ball-by-ball live scoring, restricted to assigned matches
- Real-time live scores and commentary (Supabase Realtime — no page refresh)
- Facebook sharing on the live match page
- Row Level Security so only the right people can write the right data
- SQL schema, seed data, and storage bucket setup, ready to run

---

## Project structure

```
cricket-tournament/
├── index.html                 # Homepage
├── teams.html / team.html     # Teams listing & profile
├── players.html / player.html # Players listing & profile
├── points-table.html          # Standings
├── live.html                  # Live match page (public, real-time, Facebook share)
├── admin/
│   ├── login.html              # Staff login
│   ├── dashboard.html          # Stats + quick actions
│   ├── teams.html               # Super Admin: manage teams & managers
│   ├── players.html             # Super Admin: manage players
│   ├── matches.html             # Manage matches, assign operators, points table
│   └── scoring.html             # Ball-by-ball live scoring console
├── src/
│   ├── css/style.css
│   └── js/                     # one file per page + shared utils/config
├── supabase/
│   ├── schema.sql               # run this first
│   ├── seed.sql                 # optional sample data
├── .github/workflows/deploy.yml # GitHub Pages auto-deploy
└── package.json
```

---

## Setup guide (no coding required)

### Step 1 — Create a Supabase account
Go to [supabase.com](https://supabase.com) and sign up (free).

### Step 2 — Create a free Supabase project
Click **New Project**, choose a name and password (save the DB password somewhere safe), pick a region
close to your users, and click **Create new project**. Wait a minute or two for it to spin up.

### Step 3 — Run the SQL schema
In your project, open **SQL Editor** → **New query**. Open `supabase/schema.sql` from this project,
copy the entire contents, paste it in, and click **Run**. This creates every table, relationship,
constraint, and Row Level Security policy.

*(Optional)* Repeat with `supabase/seed.sql` if you'd like some sample teams/players to explore the site
before adding your real data.

### Step 4 — Create storage buckets
The schema already creates four storage buckets (`team-logos`, `player-photos`, `tournament-images`,
`match-media`) with public read access. Confirm them under **Storage** in the sidebar — you should see
all four listed. If any are missing, create them manually there (mark each **Public**).

### Step 5 — Storage policies
Already created by `schema.sql` (public read, staff-only upload). Nothing else to do here.

### Step 6 — Create your Super Admin account
1. Go to **Authentication → Users → Add User** (create user manually).
2. Enter your admin email and a strong password. Click **Create user**.
3. Go to **Table Editor → profiles**. You'll see a row was auto-created for that user with
   `role = operator`. Click into that row and change `role` to **`super_admin`**, then save.

That's your Super Admin login. Repeat step 6 (leaving the role as `operator`) any time you want to
create a **Match Operator** account for a scorer.

### Step 7 — Copy your Project URL and anon key
Go to **Project Settings → API**. Copy the **Project URL** and the **anon / public** key
(never the `service_role` key). Open `src/js/config.js` in this project and paste them in:

```js
window.SITE_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  SITE_NAME: "Your Tournament Name",
  SITE_URL: "https://your-username.github.io/cricket-tournament/"
};
```

### Step 8 — Run the website locally (optional, to test before publishing)
You need any simple static file server — opening the HTML file directly (`file://`) will not work
because of browser security rules. Easiest options:
- With Node installed: `npx serve .` in the project folder, then open the printed `localhost` URL.
- VS Code: install the "Live Server" extension, right-click `index.html` → **Open with Live Server**.

### Step 9 — Create a GitHub repository
On [github.com](https://github.com), click **New repository**, name it (e.g. `cricket-tournament`),
keep it **Public**, and create it.

### Step 10 — Upload the project
Easiest way (no command line): on your new repo page, click **uploading an existing file**, drag this
entire project folder's contents in, and commit.

Or with Git:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/cricket-tournament.git
git push -u origin main
```

### Step 11 — Enable GitHub Pages
Go to your repo's **Settings → Pages**. Under **Build and deployment → Source**, choose
**GitHub Actions**. The included `.github/workflows/deploy.yml` will run automatically and publish
your site (check the **Actions** tab for progress — takes about a minute).

*(Alternative: choose "Deploy from a branch", pick `main` and `/ (root)`, and skip the Actions workflow.)*

### Step 12 — Deploy the website
Already done by Step 11 — every push to `main` redeploys automatically. Your site will be live at:
`https://YOUR-USERNAME.github.io/cricket-tournament/`

Update `SITE_URL` in `src/js/config.js` to match this exact address (needed for correct Facebook
share links and social previews), commit, and push again.

### Step 13 — Test Admin Login
Visit `.../admin/login.html` and log in with the Super Admin account from Step 6.

### Step 14 — Add Teams and Players
In the admin panel, go to **Teams** → **Add Team** (upload a logo, add the team manager's details).
Then go to **Players** → **Add Player** for each squad member (15–20 per team).

### Step 15 — Create a Match
Go to **Matches** → **Create Match**, pick both teams, set date/venue/overs, and (optionally) assign a
Match Operator account to score it.

### Step 16 — Start Live Scoring
From **Matches**, click **Start** on your match, then **Score** to open the live scoring console. Set
the opening striker, non-striker and bowler, then start entering deliveries. The public **live.html**
page updates instantly for every viewer — no refresh needed.

### Step 17 — Test Facebook Sharing
Open the live match page (`live.html?id=...`) and click **Share Live Score on Facebook**. Facebook's
sharer reads the page's Open Graph tags for the preview — for it to look right, the page must be
reachable at its final public GitHub Pages URL (Facebook can't preview a `localhost` link).

---

## Roles & permissions

| Role | Can do |
|---|---|
| **Super Admin** | Everything: teams, players, managers, matches, assign operators, full scoring, delete anything |
| **Match Operator** | Score matches assigned to them; cannot delete teams/players/tournaments or manage other accounts |
| **Public (no login)** | View teams, players, matches, live scores, points table, results |

Enforced both in the UI and — more importantly — at the database level via Postgres Row Level Security,
so these rules hold even if someone bypasses the frontend.

## Facebook Live video (optional)

This project ships **link sharing** (posting the live match URL with score/team info to Facebook),
which needs no credentials. True **Facebook Live video streaming** is a separate, heavier integration
requiring a Facebook App, a Page Access Token, and the Live Video API — and those secrets must never
live in frontend code. If you want that later, add a small serverless function (e.g. a Supabase Edge
Function) that holds the access token server-side and proxies requests to Facebook's Graph API; the
website would call your function, never Facebook directly with a secret.

## Notes on scoring accuracy

The live scoring console credits runs, extras, strike rotation, overs and wickets automatically as each
ball is entered. There's no automatic "undo" for a wrongly-entered ball (to avoid silently corrupting
aggregated stats) — corrections for a mis-entered ball should be made directly in the Supabase
**Table Editor** (`innings`, `batting_scores`, `bowling_scores`, `ball_events`), which only Super Admins
can access.

## Security notes

- Only the Supabase **anon/public key** is ever placed in frontend code — this is safe by design, since
  every table is protected by Row Level Security policies that define exactly what an anonymous visitor,
  a logged-in operator, or a super admin may read or write.
- The **service_role** key must never be used in this project. It is not required anywhere.
- No passwords or secrets are hardcoded anywhere in the source.

## Troubleshooting

- **Blank data / "Supabase is not configured"**: you haven't edited `src/js/config.js` yet.
- **403 / permission errors while editing data**: confirm your account's `role` in the `profiles` table
  is `super_admin`, and that you're logged in via `admin/login.html`.
- **Live updates not appearing**: confirm Realtime is enabled for the relevant tables (already done by
  `schema.sql`) — check **Database → Replication** in Supabase if in doubt.
- **Images not showing after upload**: confirm the relevant storage bucket is marked **Public**.
