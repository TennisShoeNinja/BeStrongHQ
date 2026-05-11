# Google Setup

BeStrong HQ uses Google OAuth to connect to your Google account for:

- Google Drive program imports
- Google Drive folder organization tools
- Google Calendar meet and reminder sync

For the normal self-hosted setup, create one Google Cloud project, one OAuth
client, and enable both Drive and Calendar APIs.

## What BeStrong HQ Requests

The local app requests Google Drive, Google Calendar, and email identity scopes.
Drive access is not read-only: BeStrong HQ can read program spreadsheets, list
folders, inspect sharing metadata, and, when you use the organizer, create
folders or move files in your Drive.

Use a Google account you control and only choose folders you want BeStrong HQ to
work with.

## Step 1: Create a Google Cloud Project

1. Go to <https://console.cloud.google.com>.
2. Create a project.
3. A name like `BeStrong HQ Local` is fine.

## Step 2: Configure the OAuth Consent Screen

Go to **APIs & Services -> OAuth consent screen**.

Use:

- User type: **External**
- Publishing status: **Testing**
- Test users: add your own Google account

You do not need to publish or verify the app for personal local use. While the
app is in Testing mode, Google expires refresh tokens after 7 days. BeStrong HQ
shows a renewal banner when you need to reconnect.

If Google asks for scopes during consent-screen setup, include:

```text
https://www.googleapis.com/auth/drive
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/userinfo.email
```

## Step 3: Enable Google APIs

Go to **APIs & Services -> Library** and enable:

- **Google Drive API**
- **Google Calendar API**

Drive and Calendar use the same OAuth connection in BeStrong HQ, so enable both
even if you plan to test Drive first.

## Step 4: Create OAuth Client Credentials

Go to **APIs & Services -> Credentials -> Create Credentials -> OAuth client ID**.

Choose:

```text
Application type: Web application
```

Add these **Authorized redirect URIs**:

```text
http://127.0.0.1:8080/api/gdrive/auth/callback
http://127.0.0.1:8080/api/calendar/auth/callback
```

BeStrong opens in your browser on port `3000`, but its local API runs on port
`8080`. The Google redirect URIs use `8080`, and that is correct.

Use `127.0.0.1`, not `localhost`, unless you register both. Google requires the
redirect URI to match exactly.

Copy the OAuth client:

- Client ID
- Client Secret

## Step 5: Put Credentials in `.env`

The full `.env` setup with platform-specific commands is covered in
[Install guide → Part 4](install.md#part-4-add-google-credentials). The values
you need from this guide are:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_TESTING_MODE=true
```

After saving `.env`, restart the container so it picks up the new credentials.

## Step 6: Connect Google in BeStrong HQ

1. Open <http://127.0.0.1:3000>.
2. Go to **Google Drive sync**.
3. Click **Connect Google Drive**.
4. Sign in with the same Google account you added as a test user.
5. Accept the requested Drive and Calendar permissions.
6. Choose the folders you want BeStrong HQ to watch.

The Calendar page should show as connected after Drive auth because the Drive
connection also grants the Calendar scope.

## Recommended Drive Layout

Set up your Drive like this before the first real sync:

```text
My Drive/
└── Coaching/
    ├── Ed Coan/
    │   └── Ed Coan's Program 35 - (02/01/26 - 02/22/26) - Strength Block
    ├── Jen Thompson/
    │   └── Jen Thompson's Program 12 - (03/15/26 - 04/05/26) - Peaking Block
    └── ...
```

Use:

- One top-level coaching folder
- One subfolder per athlete
- Program spreadsheets inside the athlete folder

Default filename pattern:

```text
{athlete}'s Program {number} - ({start date} - {end date}) - {theme}
```

Example:

```text
Ed Coan's Program 35 - (02/01/26 - 02/22/26) - Strength Block
```

Using another naming style? Configure it in BeStrong HQ under
**Google Drive sync -> Naming pattern**.

## Common Google Errors

### `invalid_client`

The `.env` credentials are missing or wrong, or Docker was not restarted after
editing `.env`.

### `redirect_uri_mismatch`

The URL Google received does not exactly match your authorized redirect URI.
Check `127.0.0.1` vs `localhost`, the port `8080`, and the callback path.

### App not verified

Expected for a local Testing-mode app. Continue only if you created the Google
Cloud project yourself and are signing in with your own test-user account.

### Reconnect after 7 days

Expected in Testing mode. Reconnect Google Drive when BeStrong HQ asks. Only set
`GOOGLE_OAUTH_TESTING_MODE=false` after you publish your OAuth consent screen.
