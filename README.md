# dashboard

A personal dashboard with a Google Calendar tile. Deployed via GitHub Pages.

## Google OAuth Setup

To enable the Google Calendar tile you need a **Google OAuth 2.0 Client ID**.

### 1. Create credentials in Google Cloud Console

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Click **Create Credentials → OAuth 2.0 Client ID**.
3. Choose **Web application** as the application type.

### 2. Authorized JavaScript Origins

This is the origin (scheme + domain, **no path**) of your deployed app.

| Deployment | Value |
|---|---|
| GitHub Pages (this repo) | `https://nilsbaumgartner1994.github.io` |
| Local development | `http://localhost:5173` |

### 3. Authorized Redirect URIs

For the implicit / token flow used by this app the redirect URI must point to the page that handles the OAuth popup response.

| Deployment | Value |
|---|---|
| GitHub Pages (this repo) | `https://nilsbaumgartner1994.github.io/dashboard` |
| Local development | `http://localhost:5173` |

> **Tip:** The Settings page shows the origin and redirect URI values that match your current browser URL so you can copy them directly.

### 4. Enter the Client ID in the app

1. Open the app → **Settings**.
2. Paste the Client ID (looks like `xxxx.apps.googleusercontent.com`) into the **Google OAuth Client-ID** field.
3. Click **Speichern** (Save).

The Google Calendar tile will now show a login button to authorise access to your calendar.

## Development

```bash
yarn install
yarn workspace frontend dev
```

## Build & Deploy

Push to `main` / `master` – GitHub Actions builds and deploys to GitHub Pages automatically.