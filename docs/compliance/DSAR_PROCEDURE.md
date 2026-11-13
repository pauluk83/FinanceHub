# Data Subject Access and Rights Procedure — DRAFT

**Status:** Draft. Create the privacy mailbox and test this procedure before publishing.

## Intake

1. Accept requests through the published privacy contact and any written channel.
2. Log the date received, requester, right requested and evidence of identity. Do not
   record more identity evidence than needed.
3. Acknowledge within five working days. Respond within one month; extend by up to two
   further months only for complex or numerous requests, and explain the extension.

## Verification

- Match the requester to the signed-in account email or another proportionate method.
- Do not disclose budget data on the basis of an email address alone if there is doubt.
- If an authorised agent acts for the requester, obtain written authority.

## Access and portability

1. The user can export JSON and CSV from the app. Confirm the export covers the requested
   workspace and the date range.
2. If the user cannot use the app, export from the owner-controlled admin process only
   with verified authority; never send a service-role key or raw database dump.
3. Provide the data in a structured, commonly used format. Redact other people's data and
   internal security material.

## Correction

The user can edit most records in the app. For account identifiers, use the Supabase
dashboard only after verification. Record what changed and why.

## Erasure

1. Ask the user to use **Settings → Account security → Delete cloud account permanently**
   after exporting anything they need.
2. Confirm the SQL migration is applied and the deletion test in `OWNER_ACTIONS.md` has
   passed.
3. Explain that local copies and exported backups are outside cloud deletion and must be
   removed by the user.
4. If the user cannot sign in, use the documented admin deletion process with verified
   authority; do not delete by email guesswork.
5. Record completion, date and the lawful reason for any retained material.

## Restriction and objection

Suspend sync or stop optional processing while the request is assessed. The app has no
marketing or analytics processing to object to; explain this clearly.

## Refusal

If a request is manifestly unfounded or excessive, record the reasoning and tell the user
about the ICO complaint route. Do not refuse merely because the request is inconvenient.

## Record keeping

Keep a DSAR register with: reference, date, right, verification, action, response date,
outcome and any retention decision. Review quarterly.
