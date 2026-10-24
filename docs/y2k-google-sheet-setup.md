# #Y2K wedding inquiries → Google Sheet

Every inquiry submitted on bagdrop.co/y2k is saved in the dashboard as before AND added as a new row in a Google Sheet.
Test submissions are not added. If the sheet is down, the booking still works.

## One-time setup (about 5 minutes)

1. Create a Google Sheet (for example "Bagdrop Y2K Inquiries") in the Google account you want to own it.
2. In the sheet: **Extensions → Apps Script**. Delete any code, paste the script below, and change `SECRET` to a long random word.
3. Click **Deploy → New deployment → Select type: Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click Deploy, approve the permissions, and copy the **Web app URL**.
4. In Vercel (project settings → Environment Variables, Production) add:
   - `Y2K_SHEET_WEBHOOK_URL` = the Web app URL
   - `Y2K_SHEET_WEBHOOK_SECRET` = the same word you put in `SECRET`
   Then redeploy. To test on your PC, add the same two lines to `.env.local` and restart `npm run dev`.

## Script to paste

```javascript
const SECRET = 'CHANGE_ME_TO_A_LONG_RANDOM_WORD';
const HEADERS = ['Submitted at', 'Tracking ID', 'Type', 'Linked booking', 'Name', 'Phone', 'Email',
  'Pickup city', 'Pickup address', 'Delivery city', 'Delivery address', 'Arrival date', 'Pickup slot',
  'Bags', 'Extra guests', 'Requests'];
const KEYS = ['submitted_at', 'tracking_id', 'type', 'linked_booking', 'name', 'phone', 'email',
  'pickup_city', 'pickup_address', 'delivery_city', 'delivery_address', 'arrival_date', 'pickup_slot',
  'bags', 'extra_guests', 'requests'];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== SECRET) return out({ ok: false, error: 'forbidden' });
    const sheet = SpreadsheetApp.getActiveSheet();
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
    }
    // phone/ids stay as text so Sheets does not turn +91... into a number
    const row = KEYS.map(k => {
      const v = data.row[k];
      return (k === 'phone' || k === 'tracking_id' || k === 'linked_booking') ? "'" + (v || '') : (v === undefined ? '' : v);
    });
    sheet.appendRow(row);
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}
function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
```

If you change the script later, use **Deploy → Manage deployments → Edit → New version** so the same URL keeps working.

## Check it works

Submit a real (non-test) inquiry on /y2k. A new row should appear within a few seconds.
In the server log you will see `[sheets-webhook] row added for BDA-…`. A failure shows as `[sheets-webhook] failed` and never blocks the booking.
