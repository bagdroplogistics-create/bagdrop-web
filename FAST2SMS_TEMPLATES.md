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

**Internal only — this one is never sent to a customer.** Sent automatically
to the fixed Operations WhatsApp number in Settings → Notifications
(default +91 63571 15711), 1 day before and again a few hours before every
Confirmed booking's pickup. See lib/ops-reminders.ts.

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

Note: 12 variables is more than any other template here. If Fast2SMS/Meta
pushes back on variable count during review, the safest trim is dropping
Route (line 7) — it's already implied by the two addresses — which brings it
to 11, or combining Pickup Address + Delivery Address onto one line
separated by " → " to free up a slot. Let me know if it gets rejected and
I'll adjust `buildReminderVariables()` in lib/ops-reminders.ts to match
whatever variable set actually gets approved.

Once approved, send me the Message ID and I'll set it as
`FAST2SMS_OPS_REMINDER_MESSAGE_ID` in Vercel — the cron job
(`app/api/cron/send-ops-reminders/route.ts`) is already built and will start
sending real messages the moment that env var exists; until then it safely
no-ops each due reminder (logged as `failed` with "Fast2SMS not configured"
on the reminder row, no crash, no customer-facing impact).

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
