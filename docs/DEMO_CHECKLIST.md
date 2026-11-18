# Demo / user-acceptance checklist

Manual walk-through for a live demo or acceptance test. Tick each item against the deployed site and note the date and who tested.
Automated coverage of the same flows is in `server/tests/journey.test.js` and `workflow.test.js` (see `docs/TESTING.md`).
Payment is **simulated**; no SMS is sent. Say so during the demo.

## Applicant
- [ ] Browse courses without logging in
- [ ] Register (duplicate email is refused), log in, log out, log in again
- [ ] Create a draft application; edit it; reload and confirm it persists
- [ ] Upload each required document (wrong file type / oversize is refused)
- [ ] Pay the fee (simulated), submit; submission is refused while required items are missing
- [ ] Notifications appear; mark one read, mark all read
- [ ] After officer action: status history, decision and remarks are visible; download own documents
- [ ] Re-upload a rejected document and see it return to review
- [ ] Forgot-password flow (email delivery depends on the configured provider)
- [ ] Phone-width view of the above (and iPhone/Safari login persistence)

## Officer
- [ ] Review queue lists submitted applications; open one
- [ ] Verify one document, reject another with a remark; applicant is notified (first review also moves status to under review)
- [ ] Move status: under review → documents verified → accepted / waitlisted / rejected (remarks required for waitlist/reject)
- [ ] Invalid transition and accept with unverified documents are refused; accept beyond the seat limit is refused
- [ ] CSV export

## Coordinator
- [ ] Sees only their own department's applications and dashboard numbers
- [ ] Cannot open another department's application

## Admin
- [ ] Dashboard overview and 14-day chart
- [ ] Create, edit, close a course; delete is refused when applications exist
- [ ] Create staff user (coordinators require a department); deactivate / reactivate; reset password
- [ ] Post a pinned announcement; applicants are notified
- [ ] Audit trail shows the actions above
