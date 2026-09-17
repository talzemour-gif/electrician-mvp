# Electrician Business App — Product Plan

## Product goal

Build a practical Hebrew-first system that reduces the electrician's office work, organizes customer communication, and produces geographically sensible workdays. The current goal is a reliable internal tool for this business and its staff.

## Current foundation

The MVP already includes:

- Staff authentication and database access control
- Customer records with multiple verified addresses
- Service types, prices, durations, and notes
- Appointment creation, editing, and cancellation
- Agenda, day, and week calendar views
- A daily map, route line, and numbered stop list
- Responsive laptop and mobile layouts

## Recommended phases

### Phase 1 — Go live

**Status:** Complete (2026-09-17). The application is deployed to Vercel, connected to Supabase, protected by staff membership and role-based deletion rules, usable on mobile and laptop, and covered by documented release, rollback, smoke-test, and basic error-monitoring procedures.

**Goal:** Make the current system securely available to approved staff from their phones and laptops.

1. Choose and configure the production hosting service.
2. Connect the production deployment to the existing Supabase project using protected environment variables.
3. Configure the production domain, HTTPS, and Supabase authentication URLs.
4. Verify that only approved staff members can sign in and access business data.
5. Run production smoke tests for customers, addresses, pricing, appointments, calendar views, and maps on both mobile and laptop.
6. Add basic error monitoring and document how to deploy and roll back a release.

**Success measure:** Approved staff can reliably use the system from a normal browser without running it on a developer's computer.

### Phase 1.5 — Multi-tenant foundation

**Status:** Foundation deployed (2026-09-17). The production migration and isolation tests passed, and the sports-therapy test workspace exists. Creating its administrator account and completing a two-account browser test remain.

**Goal:** Let the electrician business and a sports-therapy business test the same application with completely separate data.

1. Add organizations and organization membership to the database.
2. Assign all existing records and users to the electrician organization.
3. Enforce organization ownership on customers, addresses, services, appointments, availability, and history through foreign keys and Row Level Security.
4. Show the active organization in the interface and use profession-neutral product wording.
5. Add database regression tests that attempt cross-organization reads and writes.
6. Create the sports-therapy organization and its administrator only after the production migration and isolation tests pass.

**Success measure:** Each test business can create its own services, customers, addresses, and appointments, and neither can read or modify the other business's records.

### Phase 2 — Add missing operational basics

**Goal:** Cover the minimum workflow needed to operate the business in the system.

1. Add an on-site completion flow. When work begins, the appointment can be marked in progress; when it finishes, it can be marked completed. Start/completion times and any number of timestamped research or meeting-summary notes are recorded. **Implemented 2026-09-17.**
2. Add payment status tracking, such as unpaid, partially paid, and paid. This tracks payment state only; collecting money inside the application is out of scope.
3. Add a contact source to customers or leads, such as referral, Google, returning customer, or another source.
4. Create a clear customer history combining appointments, status changes, addresses, notes, and relevant communication events.
5. Create a clear appointment history, including creation, rescheduling, cancellation, completion, and payment-status changes.
6. Define and test a data export and backup procedure, including how data can be restored.
7. Allow staff to add notes while an appointment is in progress and after it is completed. Keep these notes attached to the appointment and visible in the customer's history.
8. Allow staff to record research or professional work completed for a customer between appointments. Store the author and timestamp and show the entry in the customer's history without requiring an appointment.

**Success measure:** Staff can understand the current state and history of every customer and appointment without relying on separate notes.

### Phase 3 — Run a one-week pilot

**Goal:** Validate the production system with real work before adding larger features.

1. Select the staff members who will participate and explain the core workflow.
2. Use the production system for one full working week while keeping the existing process available as a backup.
3. Record missing information, duplicated work, confusing screens, errors, and cases the system cannot represent.
4. Review feedback at the end of each day and fix only issues that block or materially disrupt the pilot.
5. At the end of the week, decide which workflow changes are required before WhatsApp integration.

**Success measure:** Staff can manage a real working week, and the remaining problems are documented and prioritized.

### Phase 4 — WhatsApp-assisted communication

**Goal:** Reduce calls and repetitive typing while keeping staff in control of customer commitments.

1. Define the customer conversations the system should support: initial inquiry, missing details, estimate, confirmation, reminder, on-the-way notice, rescheduling, and follow-up.
2. Add structured lead or inquiry records so WhatsApp conversations connect to a customer and business status.
3. Create staff-reviewed message templates using customer and appointment information.
4. Add WhatsApp sending through an approved business integration.
5. Record outgoing messages, delivery state where available, consent, and communication history.
6. Let each organization configure its own optional Google Form link for customer intake. The organization chooses whether completion is required before every appointment or only before the customer's first appointment.
7. Track form requests and completion per customer and appointment. When a required response is missing, show a clear warning on upcoming calendar appointments so staff can act before the meeting.
8. Keep form configuration, request status, and response references private to the relevant organization through the same tenant-isolation rules used by other business data.
9. After an appointment is completed, optionally send a follow-up message such as “How are you feeling after the last treatment?” The organization can enable or disable this workflow, edit its template, and choose whether each message is sent automatically or requires staff approval.
10. Add AI assistance later for extracting details and drafting replies, with staff approval before messages, prices, or appointments are committed.

**Success measure:** Staff can handle common customer communication from the system with less manual copying and typing.

### Phase 5 — Smart scheduling

**Goal:** Suggest geographically sensible appointment times while respecting how the electrician actually works.

1. Define working hours, breaks, service areas, travel limits, appointment buffers, and service durations.
2. Distinguish fixed appointments from requests that can move within a time or date range.
3. Calculate travel time between existing appointments and a proposed customer address.
4. Suggest two or three suitable slots instead of automatically changing the calendar.
5. Show the effect of each suggestion, including travel time, idle time, daily workload, and lateness risk.
6. Require staff approval before booking or moving an appointment.

**Success measure:** Suggested schedules reduce daily travel time without creating impractical days or late arrivals.

### Phase 6 — Reports

**Goal:** Produce consistent professional reports from reviewed business data.

1. Define the required report types and information for each electrical service.
2. Create versioned report templates with customer, property, appointment, findings, and professional details.
3. Allow staff to review and correct report information before generation.
4. Generate a consistent PDF report.
5. Store the generated report with the related customer and appointment.
6. Support controlled delivery of the approved report to the customer.

The broader on-site field workflow, including mobile checklists, measurements, signatures, and image capture, is out of scope for now.

**Success measure:** Staff can generate, find, and deliver an approved report without recreating customer and appointment information.

### Phase 7 — Marketing

**Goal:** Generate qualified demand using evidence collected by the operating system.

1. Measure which contact sources produce appointments, completed work, and profitable customers.
2. Define the priority services and geographic areas based on capacity and profitability.
3. Build focused service pages and local search content.
4. Add reliable conversion tracking before paying for advertising.
5. Test small campaigns and measure cost per qualified inquiry and completed job.
6. Use AI to help draft and analyze marketing content, while keeping campaign budgets and claims under staff control.

**Success measure:** Marketing produces qualified, profitable inquiries at a measurable and acceptable cost.

## Out of scope for now

- Turning the system into a product for additional electricians
- Multi-tenant organizations, subscription billing, and external customer onboarding
- Collecting deposits or payments inside the application
- A complete mobile field workflow for conducting inspections on site

Payment **status tracking** remains in scope because staff need to know whether an appointment has been paid. Payment **processing and collection** are out of scope.

## Immediate next steps

1. Prepare the existing MVP for production deployment.
2. Deploy it and verify authentication, database access, and core workflows on mobile and laptop.
3. Complete and verify the two-business multi-tenant foundation.
4. Implement appointment completion, payment status, contact source, history, export, and backup.
5. Run the one-week production pilot.
6. Prioritize pilot findings before starting WhatsApp-assisted communication.

## Decisions to make with the electrician

- What exactly must happen when an on-site job is marked complete?
- Who may change completion and payment statuses?
- Which payment statuses and payment notes are needed?
- Which contact-source options should be predefined?
- What information must appear in customer and appointment history?
- Which data should be exportable, how often should backups run, and who may restore them?
- Which WhatsApp messages should be automatic drafts and which must always be written manually?
- Does each organization require its intake form before the first appointment only, before every appointment, or not at all?
- How will form completion be verified: a staff checkbox, a Google Forms response integration, or both?
- How long after a completed appointment should an optional follow-up message be sent, and should staff approve it first?
- Who may read and edit appointment notes and between-appointment research entries?
- Which appointments are flexible, and by how many hours or days?
- What is an acceptable maximum travel time between jobs?
- Which geographic areas should be served or rejected?
- What reports and professional records must be retained, and for how long?

## Product principles

- Keep a human approval step for commitments made to customers.
- Prefer scheduling suggestions before automatic rescheduling.
- Keep professional inspection conclusions under the licensed electrician's control.
- Store structured data once and reuse it for communication, scheduling, reports, and analytics.
- Measure lead quality and profitability before spending on advertising.
- Design mobile screens for work away from the office and laptop screens for administration.
