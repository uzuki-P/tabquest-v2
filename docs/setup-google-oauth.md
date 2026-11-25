# Google OAuth Setup Guide for Tabquest v2 (Better Auth)

This guide is written so either a human or a browser agent (e.g., Claude in Chrome) can follow it step by step with zero guesswork.

## Inputs You Need Before Starting

Replace these placeholders before following the steps:

- `<CUSTOM_DOMAIN>` — your production domain for Tabquest v2 (e.g. `tabquest.example.com`, no trailing slash).
- `<ADMIN_EMAIL>` — your single Google account email that gets admin access (also used as the OAuth app support/developer email).
- Local dev port: `3000` (`http://localhost:3000`). If you change the Vite dev port later, add that origin/callback URL too.

---

## Step 1 — Create (or Select) a Google Cloud Project

1. Open [https://console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate) (sign in with `<ADMIN_EMAIL>`).
2. Set **Project name** to `Tabquest` (or select an existing personal project you already use for OAuth).
3. Click **Create** and wait until the project selector in the top bar switches to `Tabquest`.

---

## Step 2 — Configure the Google Auth Platform (OAuth Consent Screen)

> Google renamed "OAuth consent screen" to **Google Auth Platform** in the Console UI. Either path works.

1. Open [https://console.cloud.google.com/auth/overview](https://console.cloud.google.com/auth/overview).
2. If prompted with **Get started**, click **Get started** and fill in:
   - **App information**
     - **App name:** `Tabquest`
     - **User support email:** `<ADMIN_EMAIL>`
   - **Audience**
     - Select **External** (so any friend with a personal `@gmail.com` or Google account can sign in).
   - **Contact information**
     - **Email addresses:** `<ADMIN_EMAIL>`
   - **Finish**
     - Check the Google API Services User Data Policy agreement and click **Create**.

3. Configure **Branding** (optional but cleaner on the Google sign-in screen):
   - Open [https://console.cloud.google.com/auth/branding](https://console.cloud.google.com/auth/branding).
   - Under **Authorized domains**, add the root domain of `<CUSTOM_DOMAIN>` (for example, if `<CUSTOM_DOMAIN>` is `tabquest.example.com`, add `example.com`).
   - Click **Save**.

4. Verify **Data Access (Scopes)**:
   - Open [https://console.cloud.google.com/auth/scopes](https://console.cloud.google.com/auth/scopes).
   - Better Auth only requests non-sensitive scopes (`openid`, `userinfo.email`, `userinfo.profile`). No sensitive or restricted scopes are needed — **Google app verification is NOT required** for these basic sign-in scopes.

5. **Important — Publish the App (Audience):**
   - Open [https://console.cloud.google.com/auth/audience](https://console.cloud.google.com/auth/audience).
   - By default, a new app is in **Testing** mode, which blocks anyone not explicitly added to the Test Users list with `Error 403: access_blocked`.
   - Choose one:
     - **Recommended (any friend can sign in):** Click **Publish app** → **Confirm**. Because Tabquest only uses basic `openid`/`email`/`profile` scopes, publishing takes effect immediately with no Google review required.
     - **Strict invite-only:** Keep **Testing** mode and manually add each friend's Google email under **Test users** (up to 100 users).

---

## Step 3 — Create the OAuth 2.0 Web Client

1. Open [https://console.cloud.google.com/auth/clients](https://console.cloud.google.com/auth/clients) (or **APIs & Services → Credentials → + Create Credentials → OAuth client ID**).
2. Click **Create client**.
3. Fill in:
   - **Application type:** `Web application`
   - **Name:** `Tabquest Web`
   - **Authorized JavaScript origins** (add both):
     - `http://localhost:3000`
     - `https://<CUSTOM_DOMAIN>`
   - **Authorized redirect URIs** (add both — Better Auth uses `/api/auth/callback/google`):
     - `http://localhost:3000/api/auth/callback/google`
     - `https://<CUSTOM_DOMAIN>/api/auth/callback/google`
4. Click **Create**.
5. A modal displays your credentials:
   - **Client ID** (looks like `1234567890-abcdefg.apps.googleusercontent.com`)
   - **Client Secret** (looks like `GOCSPX-...`)
6. Copy both values immediately (or click **Download JSON** and delete the downloaded file after storing the secrets).

---

## Step 4 — Store the Secrets for Local Dev and Production

### Local Dev (`.dev.vars` — gitignored)

Create `.dev.vars` in the repo root (`./.dev.vars`):

```dotenv
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=<generate with: openssl rand -base64 32>
GOOGLE_CLIENT_ID=<paste Client ID>
GOOGLE_CLIENT_SECRET=<paste Client Secret>
ADMIN_EMAIL=<ADMIN_EMAIL>
```

### Cloudflare Workers Production (`wrangler secret put`)

Run from the repository root:

```bash
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put ADMIN_EMAIL
```

And set `BETTER_AUTH_URL` to `https://<CUSTOM_DOMAIN>` in `wrangler.jsonc` (`vars`) or as a Worker variable.

---

## Step 5 — Verification Checklist

- [ ] Visiting `http://localhost:3000` and clicking **Sign in with Google** redirects to Google and returns to `http://localhost:3000/api/auth/callback/google` without `redirect_uri_mismatch`.
- [ ] Signing in with `<ADMIN_EMAIL>` grants `role: "admin"` and unlocks `/admin/*`.
- [ ] Signing in with a different Google account grants `role: "user"` and gets `403` on `/admin/*` and `/api/admin/*`.
- [ ] Production custom domain `https://<CUSTOM_DOMAIN>/api/auth/callback/google` is listed in **Authorized redirect URIs** before go-live.
