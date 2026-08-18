# Bagdrop — WhatsApp Templates for Fast2SMS Submission

Submit each of these under Fast2SMS → WhatsApp Business → WhatsApp Manager →
Create Template. All are **Category: Utility** (transactional booking
updates), **Language: English** — matching your two already-approved
templates (`payment_completed`, `inquiry_acknowledgment`).

Formatting note: WhatsApp templates approve fastest and most reliably as
plain text — no bold, no emoji, no bullet characters. Your two approved
templates are both plain text with zero formatting, so every template below
follows that same style. Variables are numbered `{{1}}`, `{{2}}`, etc. and
**must stay in this exact order** — the code sends them positionally, not by
name.

Submit all of these together now since approval takes 24–48h regardless of
when you submit. I'll wire the code to each once you tell me the approved
Message IDs.

---

## 1. Quote Sent — `quote_sent`

**Variables:** {{1}} customer name · {{2}} quote number · {{3}} route (from → to) · {{4}} bag count · {{5}} total amount

```
Dear {{1}},

Your Bagdrop quote is ready.

Quote No: {{2}}
Route: {{3}}
Bags: {{4}}
Total Amount: {{5}}

Please review and confirm. For any questions, call us at +91 63571 15711.

Thank you for choosing Bagdrop.
```

---

## 2a. Quote Accepted — `quote_accepted`

**Variables:** {{1}} customer name · {{2}} quote number

```
Dear {{1}},

Thank you for accepting your Bagdrop quotation (Quote No: {{2}}).

Your booking is now being processed. We will share payment details shortly.

Thank you for choosing Bagdrop.
```

---

## 2b. Quote Rejected — `quote_rejected`

**Variables:** {{1}} customer name · {{2}} quote number

```
Dear {{1}},

We've noted that you've declined quotation {{2}}.

If your plans change or you need any assistance, we're happy to help.

Thank you for considering Bagdrop.
```

---

## 3. Payment Request — `payment_request`

**Header type:** Image
**Variables:** {{1}} customer name · {{2}} booking ID · {{3}} amount payable

In Fast2SMS's Create Template form, set **Header → Image** and upload
`bagdrop_upi_qr.png` (saved alongside this file) as the sample header image.
It's a real, scannable UPI QR code encoding your UPI ID
(`BAGDROP1717@IOB`, payee name "Bagdrop Logistics Solutions") — I generated
and verified it decodes correctly. Since your UPI ID is fixed rather than
per-booking, the same image works for every send; no per-message image
generation needed.

Body text (goes below the image):

```
Dear {{1}},

Your Bagdrop booking is almost confirmed. Please complete payment to proceed.

Booking ID: {{2}}
Amount Payable: {{3}}

Scan the QR code above, or pay to UPI ID: BAGDROP1717@IOB

Thank you.
```

If Fast2SMS's Image-header template type isn't available on your plan or
adds friction, the text-only version (UPI ID spelled out, no image) works
identically as a fallback — just drop the header and keep "UPI ID:
BAGDROP1717@IOB" as its own line in the body, as in the original draft.

---

## 4. Payment Received — `payment_received`

**Variables:** {{1}} customer name · {{2}} booking ID · {{3}} amount received · {{4}} payment date

```
Dear {{1}},

We have received your payment successfully.

Booking ID: {{2}}
Amount Received: {{3}}
Payment Date: {{4}}

Your booking is confirmed and our operations team will begin preparing your shipment.

Thank you for choosing Bagdrop.
```

Note: this overlaps with your already-approved `payment_completed` template
(`Dear user, Your last payment completed successfully amount: {{1}} Thank
you.`). That one only takes an amount and says "Dear user" — no name or
booking ID. You can either keep using it as-is (nothing to wait on, it's
already approved) or submit this richer version for more detail and switch
over once approved. Your call — both work with the code either way.

---

## 5. Booking Confirmed — `booking_confirmed`

**Variables:** {{1}} customer name · {{2}} booking ID · {{3}} service type · {{4}} pickup date · {{5}} route

```
Dear {{1}},

Your Bagdrop booking has been confirmed.

Booking ID: {{2}}
Service: {{3}}
Pickup Date: {{4}}
Route: {{5}}

Our team will contact you before pickup.

Thank you for choosing Bagdrop.
```

---

## 6. Bags Picked Up — `bags_picked_up`

**Variables:** {{1}} customer name · {{2}} booking ID · {{3}} collection time · {{4}} bag count

```
Dear {{1}},

Your bags have been collected successfully.

Booking ID: {{2}}
Collection Time: {{3}}
Number of Bags: {{4}}

We'll update you again once your shipment is in transit.

Thank you for trusting Bagdrop.
```

---

## 7. Bags In Transit — `bags_in_transit`

**Variables:** {{1}} customer name · {{2}} booking ID

```
Dear {{1}},

Your baggage is now in transit to its destination.

Booking ID: {{2}}

We'll notify you again once your bags are out for delivery.

Thank you.
```

---

## 8. Out for Delivery — `out_for_delivery`

**Variables:** {{1}} customer name · {{2}} booking ID

```
Dear {{1}},

Good news! Your baggage is out for delivery and will reach you shortly.

Booking ID: {{2}}

Please keep your phone reachable.

Thank you.
```

---

## 9. Driver Details Shared — `driver_details_shared`

**Variables:** {{1}} customer name · {{2}} driver name · {{3}} driver mobile

Already given earlier and already wired into the code — including here so
you can submit it together with the rest in one Fast2SMS session.

```
Dear {{1}},

Your Bagdrop delivery is on the way! Here are your driver's details:

Driver Name: {{2}}
Driver Contact: {{3}}

For any assistance, call us at +91 63571 15711.

Thank you for choosing Bagdrop.
```

---

## 10. Bags Delivered — `bags_delivered`

**Variables:** {{1}} customer name · {{2}} booking ID · {{3}} delivery date · {{4}} delivered-to address

```
Dear {{1}},

Your baggage has been delivered successfully.

Booking ID: {{2}}
Delivery Date: {{3}}
Delivered To: {{4}}

Thank you for choosing Bagdrop. We hope you had a smooth experience — your feedback means a lot to us.

Team Bagdrop
```

---

## 11. Ops Pickup Reminder — `ops_pickup_reminder`

**APPROVED — Message ID 27293.** Set as `FAST2SMS_OPS_REMINDER_MESSAGE_ID`.

**Internal only — this one is never sent to a customer.** Sent automatically
to the fixed Operations WhatsApp number in Settings → Notifications
(default +91 63571 15711), in THREE tiers per confirmed booking — 2 days
before, 1 day before, and again a few hours before pickup (or before the
flight, for airport-delivery bookings). See lib/ops-reminders.ts and
supabase/migrations/20260813_pickup_reminder_2_days_before.sql.

**Variables (12, in this exact order):** {{1}} customer name · {{2}} booking
ID · {{3}} service type · {{4}} pickup date & time · {{5}} pickup address ·
{{6}} delivery address · {{7}} route · {{8}} number of bags · {{9}} customer
mobile number · {{10}} current booking status · {{11}} driver name + mobile
(or "Not assigned yet") · {{12}} special instructions (or "None")

```
Bagdrop Ops — Pickup Reminder

Customer: {{1}}
Booking ID: {{2}}
Service: {{3}}
Pickup: {{4}}
Pickup Address: {{5}}
Delivery Address: {{6}}
Route: {{7}}
Bags: {{8}}
Customer Mobile: {{9}}
Status: {{10}}
Driver: {{11}}
Special Instructions: {{12}}
```

Confirmed approved as-is with all 12 variables — no trim needed.

Set `FAST2SMS_OPS_REMINDER_MESSAGE_ID=27293` in Vercel to activate — the
cron job (`app/api/cron/send-ops-reminders/route.ts`) is already built and
will start sending real messages the moment that env var exists; until
then it safely no-ops each due reminder (logged as `failed` with
"Fast2SMS not configured" on the reminder row, no crash, no customer-
facing impact).

---

## 12. Confirmed & Ongoing Inquiry Summary — `confirmed_ongoing_summary`

**Internal only — never sent to a customer.** Sent automatically to the
internal ops WhatsApp numbers (Settings → `confirmed_ongoing_summary_whatsapp`,
default same two numbers as every other internal template — see
lib/internal-whatsapp-recipients.ts) twice daily, 9:00 AM and 6:00 PM IST,
listing every booking currently Confirmed or Ongoing so nothing gets missed
just because nobody opened the dashboard. See
lib/confirmed-ongoing-summary.ts for the full implementation.

**Why only 1 variable, unlike the other templates:** a WhatsApp template
can't have a variable number of placeholders, but this report's inquiry
count changes every send. The whole report chunk (summary + inquiry list,
or "no inquiries" message, or "Part 2/3" continuation) is pre-rendered in
code and passed as ONE variable. An earlier 2-variable version (short
header + body, almost no fixed wrapper text) was **rejected by Fast2SMS/
Meta** with "This template has too many variables for its length" — their
approval check requires enough fixed template text relative to variable
count. Fixed by dropping to 1 variable and adding real fixed sentences
around it (below).

**Variables (1):** {{1}} — the full report chunk for that message: date +
report time + "(Part X/Y)" when split, summary counts (first part only),
and one block per inquiry — or "No confirmed or ongoing inquiries at this
time." when the list is empty.

```
BAGDROP DAILY OPERATIONS UPDATE

This is your automated Confirmed and Ongoing bookings report from the Bagdrop Admin System, generated at the scheduled report time shown below.

{{1}}

Please review all Confirmed and Ongoing bookings listed above and take any necessary action. This message was sent automatically by the Bagdrop system.
```

Example {{1}} (short case):
```
Date: 18 Aug 2026 | Report: 9:00 AM

SUMMARY
✅ Confirmed: 1
🟢 Ongoing: 1
📦 Total: 2
━━━━━━━━━━━━━━
1. Mr. Sachin Patel
🆔 Inquiry: BDL-2026-0090
📦 Tracking: BDA-2026-0090
📍 Route: Vadodara → Mumbai
📅 Pickup: 20 Aug 2026, 10:00 AM
🧳 Bags: 3
📱 Mobile: +919825017493
💰 Payment: Received
📝 Quote: Accepted
🔵 Status: Confirmed
━━━━━━━━━━━━━━
```

**Approval-risk note:** your two already-approved templates are both plain
text with zero emoji/formatting, and this repo's own experience (see the
formatting note at the top of this file) is that plain text approves
fastest and most reliably. This template's {{1}} content is emoji-heavy
per the original spec, though the new fixed intro/outro sentences are
plain text. If Meta rejects or stalls on the emoji version, the safe
fallback is resubmitting with the emoji stripped from the *sample* {{1}}
text you submit for approval — the code doesn't care either way, since
{{1}}'s actual content is just a string built in
lib/confirmed-ongoing-summary.ts (see `buildEntry()`/`buildReportChunks()`)
and can be switched to a plain-text render with a one-line change if needed.

Set `FAST2SMS_CONFIRMED_ONGOING_SUMMARY_MESSAGE_ID=<id>` in Vercel once
approved — the cron job
(`app/api/cron/send-confirmed-ongoing-summary/route.ts`, polled every 10
minutes by your external scheduler same as the other three cron routes)
is already built and will start sending real messages the moment that env
var exists; until then it safely no-ops each due report (logged as
`failed` with "No template configured" on the scheduled_report_runs row,
no crash, no customer-facing impact — customers are never on this
template's recipient list anyway).

Test without waiting for 9AM/6PM: `POST /api/admin/confirmed-ongoing-summary/test`
with header `x-admin-key: <your admin key>` and body
`{"reportType":"morning","dryRun":true}` — returns the exact rendered
message text (no Fast2SMS call, no DB row) so you can eyeball it. Drop
`dryRun` (or set `false`) to actually send once the template is approved.

---

## After submission

Once Fast2SMS/Meta approves each one (24–48h typically), send me the list of
approved template names with their Message IDs (the short number in the
dashboard, same field we used for driver details) and I'll:

1. Add each as a `FAST2SMS_<NAME>_MESSAGE_ID` env var in Vercel.
2. Wire the send trigger into the matching status-change code path (quote
   accept/reject, payment routes, each booking status update).
3. Add the matching HTML email version for each (email doesn't need Meta
   approval, so those can go live immediately rather than waiting).
4. Add per-channel send logging to `status_history` for every one, same
   pattern as Driver Details — visible via Supabase for now; happy to also
   build a proper Activity Log tab in the admin UI so this is visible without
   opening Supabase, if useful.

A few fields in your spec aren't captured as clean data yet and will need a
small addition when I wire triggers in: **Collection Time** (bags picked up)
and exact **payment date** timestamp — both derivable from existing
`status_history` timestamps, just needs a couple lines of code once we get
there.
