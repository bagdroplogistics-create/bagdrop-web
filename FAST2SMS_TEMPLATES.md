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

## 12. Confirmed & Ongoing Bookings Report — `confirmed_ongoing_summary`

**Internal only — never sent to a customer.** Sent automatically to the
internal ops WhatsApp numbers (Settings → `confirmed_ongoing_summary_whatsapp`,
default same numbers as every other internal template — see
lib/internal-whatsapp-recipients.ts) twice daily, 9:00 AM and 6:00 PM IST:
one WhatsApp message per booking currently Confirmed or Ongoing (or one
heartbeat message when there are none), so nothing gets missed just
because nobody opened the dashboard. See lib/confirmed-ongoing-summary.ts
for the full implementation.

**Redesign history — now ONE template.** v1 packed the whole report into
a single `{{1}}` variable with real line breaks between fields. That
doesn't work: WhatsApp Business API silently flattens any line break
*inside a single template variable's value* before delivery (confirmed
via `sendWhatsAppTemplateFast2SMS`'s existing `\n` → `" • "` replacement,
originally added for this exact reason), so the "vertical" report was
actually always arriving as one run-on line. v2 split this into a
separate summary-only template plus a per-booking template, mirroring the
working `new_inquiry_notification` template
(lib/new-inquiry-notification.ts), which renders perfectly vertical
because it uses one variable PER FIELD with the line breaks baked into
the template's own static body. v3 merged those two back into ONE
template — **rejected** at 18 variables with "This template has too many
variables for its length." v4 dropped 3 fields to 15 variables (kept the
same terse `Label: {{n}}` style) — **rejected again on the same grounds**
at 13 (Tracking ID/Inquiry ID/Service were already trimmed further by
then). Deleting fields barely moves Meta's actual static-text-to-variable
ratio, since each field removed takes its own ~1-word label with it. v5
kept all 15 variables (all fields the founder wants) and instead added
real static wording — a longer title AS THE BODY'S FIRST LINE, a full
sentence around the booking-index pair, and a closing sentence — mirroring
the already-approved `new_inquiry_notification` template's proven label/
sentence density instead of guessing at a ratio. **v6 (current)** — v5 got
approved, then the founder added a WhatsApp template **Header** component
("Confirmed & Ongoing Bookings Report") on top of that same Body, which
made the title show 2-3x in the delivered message (Header + the Body's own
title line, sometimes plus this app's own message-log preview repeating
it again). Fix: the title now lives ONLY in the Header field — the Body's
static title line is deleted and the Body starts directly at
"Report Date: {{1}}".

**Header component (new in v6):**
```
Confirmed & Ongoing Bookings Report
```

**Body — Variables (15):**

```
Report Date: {{1}}
Report Time: {{2}}
Total Confirmed Bookings: {{3}}
Total Ongoing Bookings: {{4}}
Total Bookings Listed: {{5}}

This message covers booking number {{6}} out of {{7}} total bookings in this report.

Customer Name: {{8}}
Customer Contact Number: {{9}}
Pickup to Delivery Route: {{10}}
Scheduled Pickup: {{11}}
Scheduled Delivery: {{12}}
Number of Bags: {{13}}
Current Booking Status: {{14}}
Payment Status: {{15}}

Please review this booking and take any necessary action.
```

**Editing the already-approved template:** since this changes visible
Header/Body content on a template that's already been approved, Fast2SMS/
Meta will most likely require re-review after you save the edit — expect
the template's Status to drop back to Pending for a bit, same as the
original submission. If Fast2SMS's editor lets you edit Header/Body text
without triggering re-review, even better, but don't assume that's the
case going in.

Sample values for Meta review (one per variable, in order):
```
18 Aug 2026
9:00 AM
1
1
2
1
2
Mr. Sachin Patel
+919825017493
Vadodara -> Mumbai
20 Aug 2026, 10:00 AM
22 Aug 2026
3
Confirmed
Received
```

`{{1}}`-`{{5}}` (Report Date/Time/Confirmed/Ongoing/Total) are identical
across every message sent in one run. `{{6}}`-`{{15}}` change per booking.
Missing values always send as `—`, never a blank string — some template
configs reject an empty variable value outright, and it keeps every field
visibly present. When there are zero Confirmed/Ongoing bookings, exactly
one heartbeat message still goes out with `{{3}}`/`{{4}}`/`{{5}}` = `0`
and `{{6}}`-`{{15}}` = `0`/`0`/`—`×8.

Set `FAST2SMS_CONFIRMED_ONGOING_MESSAGE_ID=<id>` in Vercel once approved —
the cron job (`app/api/cron/send-confirmed-ongoing-summary/route.ts`,
polled every 10 minutes by your external scheduler same as the other
three cron routes) is already built and will start sending real messages
the moment that env var exists; until then it safely no-ops each due
report (logged as `failed` with "No template configured" on the
scheduled_report_runs row, no crash, no customer-facing impact —
customers are never on this recipient list).

**Approval-risk note:** no emoji, real labels, and now real sentences
around the two connector variables ({{6}}/{{7}}) rather than a bare
"Booking X of Y" — this pushes the static-text-to-variable ratio
noticeably above the already-approved `new_inquiry_notification`
template's ratio (10 variables, shorter labels, one footer sentence).
Meta's exact threshold isn't published, so this is evidence-based, not
guaranteed — but simply removing more fields already failed twice in a
row, so adding real static text is the more promising lever left. If this
STILL gets rejected, the fallback is splitting back into two templates
(a 5-variable summary + an 8-11 variable per-booking message), each well
under the variable count of the template that's already live and working.

**Sending behavior:** busy days now send one WhatsApp message per booking
(same as the previous designs) — the tradeoff for the report actually
rendering vertically instead of one run-on line.

Test without waiting for 9AM/6PM: `POST /api/admin/confirmed-ongoing-summary/test`
with header `x-admin-key: <your admin key>` and body
`{"reportType":"morning","dryRun":true}` — returns a human-readable preview
of every message this run would send, in order (no Fast2SMS call, no DB
row) so you can eyeball it before the template is even approved. Drop
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
