# "just us" — private two-person chat app

A tiny WhatsApp-style chat just for the two of you, using a Google Sheet
as the storage/database and a Google Apps Script as the free backend API.
No hosting cost, no server to maintain.

## How it works

1. **Lock screen** — a shared passphrase gates the whole site.
2. **Login screen** — each person picks "User 1" or "User 2" and enters
   their own password.
3. **Chat screen** — messages are sent to a Google Sheet, and the app
   polls the sheet every 4 seconds so both sides see new messages
   without refreshing.

## Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new sheet.
2. Rename **Sheet1** to `Users`. Add this in row 1 and row 2/3:

   | Username | Password |
   |----------|----------|
   | User1    | pass123  |
   | User2    | pass456  |

   (Change these passwords to whatever you both want.)

3. Add a second tab (bottom-left `+`) named exactly `Messages`. Just add
   the header row:

   | ID | Sender | Message | Timestamp |
   |----|--------|---------|-----------|

   Leave the rest blank — the script fills it in automatically.

## Step 2 — Deploy the backend (Apps Script)

1. In the Sheet, go to **Extensions → Apps Script**.
2. Delete the placeholder code and paste in the contents of `Code.gs`
   (included alongside this file).
3. Click **Deploy → New deployment**.
4. Click the gear icon next to "Select type" and choose **Web app**.
5. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
6. Click **Deploy**, and authorize the permissions it asks for (it's
   your own script, so this is safe).
7. Copy the **Web app URL** it gives you — it looks like
   `https://script.google.com/macros/s/XXXXXXX/exec`.

## Step 3 — Connect the frontend

1. Open `app.js`.
2. Paste your Web app URL into `APPS_SCRIPT_URL` near the top.
3. Optionally change `LOCK_PASSPHRASE` to your own shared secret.

## Step 4 — Host it (pick any one)

The frontend is just 3 static files (`index.html`, `style.css`, `app.js`),
so any free static host works:

- **GitHub Pages** — push the folder to a repo, enable Pages in Settings.
- **Netlify / Vercel** — drag-and-drop the folder in their dashboard.

Once hosted, share the link with your friend — same link works for
both of you, they just pick "User 2" at login.

## Notes & honest limitations

- This is a **light security model** — good for two friends chatting
  privately, not for sensitive data. The lock passphrase lives in the
  JS file, so anyone who views the page source could find it.
- The app **polls** every 4 seconds rather than pushing messages
  instantly — Google Sheets can't push updates, so there's a small
  delay. Good enough for casual chat, not real-time like WhatsApp.
- Google Sheets has row limits (a few million cells), which is far
  more than two people will ever chat — no need to worry about this.
- If you ever want to change who "User1" / "User2" display as, just
  edit the button labels in `index.html` — the underlying username
  used for login/storage can stay the same.
