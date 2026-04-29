# Google Setup

BeStrong HQ needs two things from your Google account before your first sync will work:

1. **OAuth credentials** so you can sign in and grant BeStrong HQ access to your Drive.
2. **A tidy Drive folder layout** so the parser can map spreadsheets to athletes.

Work through both before starting BeStrong HQ for the first time.

## OAuth credentials

Without this, the first login fails with `invalid_client`.

### Step 1: Create a Google Cloud project

Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project (or reuse an existing one).

### Step 2: Configure the OAuth consent screen

Under **APIs & Services → OAuth consent screen**:

- Choose **External** user type.
- Leave it in **Testing** mode.
- Add your own Google account under **Test users**.

Testing mode is fine for personal use. You do not need to submit for verification.

### Step 3: Enable the APIs you'll use

Under **APIs & Services → Library**, enable:

- **Google Drive API** (required, for spreadsheet syncing)
- **Google Calendar API** (optional, if you want meet calendar sync)

### Step 4: Create OAuth client credentials

Under **APIs & Services → Credentials → Create Credentials → OAuth client ID**:

- Choose **Web application**.
- Add these **Authorized redirect URIs**:
  - `http://127.0.0.1:8080/api/auth/callback`
  - `http://127.0.0.1:8080/api/gdrive/auth/callback`
  - `http://127.0.0.1:8080/api/calendar/auth/callback` *(only if you'll use Calendar sync)*

If you're running on a domain instead of localhost, replace `http://127.0.0.1:8080` with your origin (e.g. `https://bestrong.example.com`). The Calendar callback path is `/api/calendar/auth/callback`.

For the full official walkthrough, see Google's guide: [Setting up OAuth 2.0](https://support.google.com/cloud/answer/6158849).

### Step 5: Copy credentials into `.env`

From the `BeStrongHQ` folder:

```bash
cp .env.example .env
```

Open `.env` and paste in your client ID and secret:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

Restart `bestrong run` so the new values are picked up.

### Heads-up on Testing mode

Google expires refresh tokens after 7 days while your consent screen is in Testing. You'll see a "renew" banner in the app when that happens, just sign in again. Flip `GOOGLE_OAUTH_TESTING_MODE=false` in `.env` only after you publish your consent screen.

## Recommended Drive layout

Set your Google Drive up like this before your first sync:

```
My Drive/
└── Coaching/                ← your top-level coaching folder
    ├── Ed Coan/
    │   └── Ed Coan's Program 35 - (02/01/26 - 02/22/26) - Strength Block
    ├── Jen Thompson/
    │   └── Jen Thompson's Program 12 - (03/15/26 - 04/05/26) - Peaking
    └── ...
```

- **One top-level folder** for coaching work. Call it whatever fits your style: `Coaching`, `Training`, or any name you prefer. Point BeStrong HQ at this folder on first sync.
- **One subfolder per athlete**, named `FirstName LastName`. BeStrong HQ maps each folder to an athlete record automatically.
- **Each athlete's program file** goes in their folder. It's a copy of the BeStrong HQ Google Sheets template, renamed to match the filename convention below.
- **Default filename convention:** `{athlete}'s Program {number} - ({dates}) - {theme}`. Example: `Ed Coan's Program 35 - (02/01/26 - 02/22/26) - Strength Block`. The parser pulls athlete, program number, date range, and theme straight from the filename.
- **Using a different naming pattern?** Configure your own under **Settings → Google Drive → Naming Pattern**.
