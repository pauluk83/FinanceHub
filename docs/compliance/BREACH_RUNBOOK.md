# Personal Data Breach Runbook — DRAFT

**Status:** Draft. Test the contact route and record the test in the evidence checklist.

## 1. Detect and record

Record the time, reporter, system, what was observed and the initial scope. Do not delete
logs or evidence. Treat a lost device, a leaked session, a misconfigured Supabase policy,
a leaked service-role key or a public backup as a potential personal data breach.

## 2. Contain

- Revoke sessions and rotate exposed keys immediately.
- Disable the affected integration or deployment if needed.
- Preserve evidence; take a copy of relevant logs before rotation if lawful and safe.
- Do not speculate publicly before the facts are known.

## 3. Assess

Assess the likelihood and severity of risk to affected people, considering:

- the type of data (financial records, account identifiers, encrypted provider logins);
- whether the data was encrypted and whether the key was also exposed;
- the number of people affected;
- whether the data could be used for fraud or account takeover;
- whether the breach is contained.

Record the decision and reasons. A breach that is unlikely to result in a risk to rights
and freedoms may not need ICO notification, but it must still be logged.

## 4. Notify

- **ICO:** without undue delay and within 72 hours of becoming aware, if the breach is
  notifiable. Use the ICO breach reporting service and keep the reference.
- **Affected people:** without undue delay if the breach is likely to result in a high
  risk. Explain what happened, what data, what has been done and what they should do.
- **Processors:** notify Supabase or the hosting provider through their support/security
  channel and record the ticket.

If the 72-hour deadline cannot be met, notify with the information available and explain
the delay.

## 5. Recover and learn

1. Fix the root cause and verify with a test.
2. Rotate credentials and review access logs.
3. Update the DPIA, retention schedule and processor register if needed.
4. Hold a post-incident review within five working days.
5. Record actions, owners and dates; do not close the incident until the actions are done.

## Contact route

- Security/privacy lead: **Zane Stanton**.
- Privacy mailbox: **to be created**.
- Supabase support/security: through the project dashboard.
- ICO: https://ico.org.uk/ for reporting guidance.
