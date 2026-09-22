# Electrician MVP — Engineering Guide

Last updated: 2026-09-22

## Purpose and current scope

This is a Hebrew, right-to-left business-management web application for mobile service businesses in Israel. Each organization has a private workspace with its own dashboard, customers, addresses, services, and appointments. The initial tenants are an electrical-inspection business and a sports-therapy test business.

The application currently supports:

- Email/password authentication for approved staff.
- Customer creation, search, editing, notes, and multiple addresses.
- Optional customer contact-source tracking using a controlled list for future attribution reports.
- Customer-list sorting by recent activity, nearest upcoming appointment, or most recently completed appointment.
- Address creation, editing, and deletion when an appointment does not reference it.
- Service types with default price, duration, notes, and active status.
- Appointment creation, editing, cancellation with an optional reason, and history.
- Appointment payment status (`unpaid`, `partially_paid`, or `paid`) with quick updates from appointment cards.
- Past and completed appointments remain editable. The edit form can move an appointment back to an earlier workflow status; returning to `scheduled` clears start/completion timestamps, and returning to `in_progress` clears the completion timestamp. Notes and attachments remain. While editing, the calendar and other appointments are hidden to keep the user focused on the selected record.
- Agenda, daily, and weekly calendar views.
- Customer selection ordered by recent activity and filtered by name or phone.
- Dashboard counts sourced from Supabase.

## Technology

- Next.js 16 App Router
- React 19
- TypeScript
- Supabase Auth and PostgreSQL
- `@supabase/supabase-js` browser client
- Plain global CSS; no component or styling framework

All product pages are client components and access Supabase directly under row-level security (RLS). There is currently no server-side application API.

## Responsive layouts

The application maintains one shared component tree with two CSS-driven layouts:

- Laptop/tablet widths above 700 px use the persistent sidebar, multi-column forms, native data tables, and the full-width weekly calendar.
- Mobile widths at or below 700 px use compact four-item navigation, single-column forms, stacked appointment cards, and customer/service table rows rendered as labeled cards. The weekly calendar remains horizontally scrollable so all seven days retain useful width.

Do not create mobile-only routes or duplicate data logic. Add `data-label` to every new table cell so it retains context when the table becomes cards on mobile. Test layout changes at both approximately 1280×800 and 390×844. Interactive behavior and validation must use the same handlers in both layouts.

## Daily route map

The calendar Day view sends that day's non-cancelled appointment addresses to `POST /api/day-route`, including in-progress and completed appointments. The dashboard uses the same route component and stop list. It shows today whenever today contains any non-cancelled appointment; otherwise it shows the next future date containing one. Starting or completing an appointment does not remove it from either route display. The server route geocodes addresses sequentially with OpenStreetMap Nominatim, preserving its one-request-per-second public-service limit, and requests a driving route from the public OSRM service. It returns ordered points, unresolved address indexes, and route geometry. Addresses are not written to application logs. An in-memory geocode cache and Next.js fetch revalidation reduce repeat calls.

Address create/edit forms require coordinates before saving. `AddressVerification` calls `POST /api/address-lookup` after the user enters an address and city. A successful lookup shows a movable marker. A failed lookup displays an inline error and a map so the user can click the correct location manually. Changing the written address or city clears the previous verification. Both lookup and daily routing use the server-only provider adapter in `src/lib/maps.ts`.

`DayRouteMap` renders OpenStreetMap tiles through Leaflet, numbers stops in appointment-time order, fits the viewport to resolved points, and draws the OSRM road geometry. Beside the desktop map it renders a compact list with the matching stop number, customer name, city, and appointment time; on mobile the same list moves below the map. The full appointment cards remain below this route summary. An unresolved address is named below the map and is excluded from the route. A route line requires at least two resolved addresses.

The public OSM tile, Nominatim, and OSRM endpoints are suitable only for low-volume MVP use and provide no service-level guarantee. Before production or meaningful traffic, configure a contracted map/geocoding provider or self-hosted services. Written customer addresses are transmitted to these external mapping services when staff open a Day view; this data flow must remain part of the product privacy review. Preserve visible OpenStreetMap attribution and do not add tile prefetching or offline downloads.

## Repository map

```text
src/
  app/
    layout.tsx             RTL shell and navigation
    page.tsx               Dashboard
    calendar/page.tsx      Appointment workflows and calendar views
    api/day-route/route.ts Server-side daily geocoding and road routing
    api/address-lookup/route.ts Server-side address verification
    api/client-error/route.ts Privacy-safe client failure logging
    error.tsx              Recoverable route-level error screen
    global-error.tsx       Root-layout failure screen
    customers/page.tsx     Customer and address workflows
    pricing/page.tsx       Service-type workflows
    globals.css            Shared application styles
  components/
    auth-gate.tsx          Authentication and staff-membership gate
    form-feedback.tsx      Shared field and save-error presentation
    day-route-map.tsx      Leaflet map, numbered stops, and route line
    address-verification.tsx Address lookup and manual map pinning
  lib/
    supabase.ts            Singleton Supabase browser client and shared types
    maps.ts                Server-only geocoding and routing adapter
supabase/
  migrations/              Ordered schema changes
  schema.sql               Consolidated schema for a new project
  tests/                   SQL security and transaction regression checks
  README.md                Operational database setup instructions
```

Production deployment and rollback procedures are maintained in `DEPLOYMENT.md`.
The live application is hosted at `https://electrician-mvp-khaki.vercel.app` and is deployed from the GitHub `main` branch through Vercel.

## Production error handling

`error.tsx` and `global-error.tsx` provide staff with a Hebrew recovery action when an unexpected render failure reaches a Next.js error boundary. They report only the failure digest, pathname, source, and timestamp to `POST /api/client-error`; do not add customer data, form values, full URLs, stack traces, or error messages to this payload. The API writes the structured event to the Vercel runtime log. Server-side map adapters log a short provider failure message without the requested address. See `DEPLOYMENT.md` for the operational log-review procedure.

## Runtime architecture

`src/app/layout.tsx` renders the persistent RTL navigation shell and wraps every page in `AuthGate`. `AuthGate` restores the Supabase session, signs users in or out, and loads the current user's `organization_members` row and organization name before rendering business data.

Supabase can emit token-refresh events when a mobile browser returns from the camera or file picker. `AuthGate` must keep an already-authorized user's page mounted for same-user session refreshes; resetting `allowed` or `loading` in that path discards in-progress forms and selected files. It rechecks membership only when the authenticated user ID changes.

Pages call the singleton returned by `getSupabase()` and manage their own loading, form, validation, and error state. Joined PostgREST queries provide related customer, address, service, and appointment data. Mutations run with the signed-in user's JWT and therefore remain subject to database RLS.

Mutation forms use shared `FieldError` and `SaveError` components. Each form keeps page-loading errors separate from its submission summary and field-error map. Validation failures appear beside the relevant input and beside the Save button; changing a field clears its own error. Forms use `noValidate` so application validation has consistent placement instead of relying on browser-native validation bubbles. Preserve this pattern when adding or extracting forms.

Customer creation with multiple initial addresses uses `create_customer_with_addresses`, an invoker-security PostgreSQL function. This keeps the customer and all starting addresses in one transaction. Other edits currently use direct table mutations.

## Authentication and authorization

The application has database-enforced tenant isolation for a limited two-business pilot.

- Supabase Auth owns user credentials and sessions.
- `organization_members` is the approved-user allowlist and maps each user to one organization.
- Users can read only their own membership row.
- Anonymous users have no business-table access.
- Authenticated users without membership have no business-table access.
- Approved members have an `admin` or `staff` role within their organization. Both roles can read, create, and update that organization's records. Only `admin` can delete rows.
- Every business table has a mandatory `organization_id`. RLS compares it with `current_organization_id()`, and composite foreign keys prevent cross-organization customer, address, service, appointment, and history relationships.
- The current pilot intentionally allows one organization membership per user and has no workspace switcher.
- Browser code uses only the Supabase project URL and publishable key. Never expose a service-role key in the application or a `NEXT_PUBLIC_*` variable.

Adding a member is an administrator operation described in `supabase/README.md`.

## Database model

### `organizations` and `organization_members`

`organizations` identifies each private workspace. `organization_members` maps an authenticated user to one workspace and stores its `admin` or `staff` role. Membership is provisioned through Supabase administration and cannot be changed through the application.

### `customers`

Stores tenant-owned contact details and customer notes. `updated_at` represents recent business activity, not only direct profile edits. Triggers also touch it when an address or appointment changes, which drives the recent-customer appointment picker.

### `customer_addresses`

Stores any number of addresses per customer. Each newly created or edited address has a verified or manually pinned `latitude`/`longitude` pair; legacy rows may remain null until edited. A check constraint requires both coordinates together and validates their ranges. A partial unique index permits at most one default address. A composite foreign key ensures an appointment address belongs to the same customer as the appointment.

### `job_types`

Stores service names, default price, default duration, description/notes, and active status. Appointment rows copy price and duration at creation, so later price-list changes do not rewrite historical appointments.

### `appointments`

References a customer, customer address, and service. It stores the scheduled instant as `timestamptz`, copied duration and price, status (`scheduled`, `in_progress`, `completed`, or `cancelled`), `started_at` and `completed_at` workflow timestamps, legacy notes, optional `cancellation_reason`, and a reschedule counter.

### `appointment_notes`

Stores any number of timestamped notes for an appointment. Each note is classified as `research` or `meeting_summary`, records its author through `created_by`, and has a `use_in_final_report` flag. Text is optional when the note has an attachment. Notes are tenant-isolated with an organization-consistent appointment foreign key. Members may add and update notes; only organization admins may delete them. The records are designed to appear in the customer timeline in a later Phase 2 change.

### `appointment_note_attachments`

Stores private attachment metadata for note documents, images, and short videos. Binary files live in the private Supabase Storage bucket `appointment-files`; object paths begin with the organization ID and Storage RLS compares that folder with `current_organization_id()`. The UI permits five files per note and 50 MB per file. It normalizes MIME types from mobile camera filenames, including HEIC/HEIF, validates files before saving the note, reports upload progress and failures next to the file control and Save button, creates one-hour signed URLs for viewing, previews supported images and videos, and renders documents as secure links. Do not make this bucket public.

### `appointment_reschedules`

Append-only scheduling history. The appointment update trigger increments `reschedule_count` and inserts the old and new start times whenever `starts_at` changes.

### `availability_blocks`

Reserved for working-hours and availability planning. The table exists, but the current UI does not use it.

## Planned intake, clinical notes, and follow-up architecture

The product plan includes organization-specific customer intake and follow-up workflows. This section records the intended boundaries; these tables and integrations have not been implemented yet.

- Store form configuration per organization, including the Google Form URL, whether it is active, and whether it is required before the first appointment or every appointment. Never place a global form URL in application configuration.
- Store each form request/completion record against its organization, customer, and, when applicable, appointment. Calendar warnings should be derived from the organization's rule and recorded completion state rather than inferred from a link click.
- Google Forms links may be sent through the planned WhatsApp integration. Direct response verification requires a separate Google integration; until that exists, staff need an explicit way to mark a response as received.
- Store notes made during or after a meeting on the appointment or in an appointment-note table with author and timestamps. Treat these as organization-owned customer data and include them in customer history.
- Store research performed between appointments as a separate customer timeline entry with organization, customer, author, content, and timestamps. It must not require a related appointment.
- Store follow-up message rules and templates per organization. A completed appointment may create a scheduled follow-up communication record, subject to the organization's automatic-send or staff-approval setting.
- Every new table in this workflow must have a mandatory `organization_id`, tenant-scoped RLS, and organization-consistent foreign keys. Access must follow the existing admin/staff membership model. Do not expose one organization's forms, notes, research, templates, or message history to another organization.
- Form responses and treatment notes may contain sensitive personal or health information. Define data minimization, retention, access, export, and deletion behavior before implementing the sports-therapy workflow.

## Database functions and triggers

- `create_customer`: legacy atomic customer plus optional first-address creation.
- `create_customer_with_addresses`: current atomic customer plus multiple-address creation.
- `set_customer_updated_at`: updates a customer timestamp on profile edits.
- `touch_related_customer`: updates recent activity after address or appointment mutations.
- `track_appointment_change`: updates appointment timestamps and records rescheduling history.

## Time handling

Appointment input and display use `Asia/Jerusalem`, independent of the browser's local timezone. `calendar/page.tsx` converts a selected Israeli wall-clock date and time into an ISO instant and validates the round trip. This rejects nonexistent local times during daylight-saving transitions. Appointment creation and editing also reject instants that are not in the future.

Keep this conversion behavior when moving calendar logic into shared utilities or server code. Do not construct appointment instants by assuming a fixed UTC offset because Israel observes daylight-saving time.

## Local setup

Requirements: a current Node.js runtime, npm, and access to the Supabase project.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set these values in `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Open `http://127.0.0.1:3000`. If macOS file-watcher limits cause problems, use:

```sh
WATCHPACK_POLLING=true npm run dev -- --hostname 127.0.0.1 --webpack
```

## Schema changes and migrations

Create a new timestamped SQL file in `supabase/migrations/` for every schema change, then update `supabase/schema.sql` so it continues to describe a fresh project. Apply the migration to the hosted Supabase project and verify it before merging application code that depends on it.

Current migration order:

1. `202609100001_initial.sql` — initial tables, RLS, membership, RPC, indexes, and seed services.
2. `202609100002_multi_address_customer.sql` — atomic multi-address customer RPC.
3. `202609100003_appointment_workflow.sql` — recent activity and reschedule tracking.
4. `202609100004_cancellation_reason.sql` — optional appointment cancellation reason.
5. `202609140001_address_coordinates.sql` — coordinate columns and coordinate-aware atomic customer creation.
6. `202609140002_coordinate_pair_constraint.sql` — strict coordinate-pair constraint correction after manual deployment.
7. `202609150001_member_roles.sql` — admin/staff roles and admin-only database deletion policies.
8. `202609170001_multi_tenancy.sql` — organizations, tenant ownership, composite integrity constraints, and tenant-scoped RLS.
9. `202609170002_remove_redundant_tenant_foreign_keys.sql` — removes the superseded single-column relationships so tenant-safe PostgREST embeds are unambiguous, including for empty organizations.
10. `202609170003_appointment_completion_notes.sql` — adds the in-progress/completed workflow timestamps and tenant-isolated, timestamped appointment notes.
11. `202609170004_note_attachments.sql` — adds final-report flags, private mixed-media note attachments, and tenant-scoped Storage policies.
12. `202609170005_mobile_camera_mime.sql` — permits the HEIF MIME variant produced by some mobile camera uploads.

The hosted project was initialized manually through the Supabase SQL Editor. Those applications are not registered in Supabase CLI migration history. Reconcile the hosted baseline before adopting `supabase db push`; do not replay the initial migration blindly.

## Validation

Run application checks after code changes:

```sh
npm run build
npx tsc --noEmit
git diff --check
```

Run `supabase/tests/access-and-save.sql` in the Supabase SQL Editor after security, RLS, RPC, or transaction changes. It creates temporary fixtures in a transaction and rolls them back. The final result must begin with `PASS`.

For user-facing workflow changes, also test the affected path in the browser while signed in as an approved member. Test both a normal desktop width and a narrow viewport for calendar, form, or table changes.

## Known architectural limitations

- Pages contain data access, domain logic, and UI in the same files. Extract shared hooks/services when workflows begin to overlap materially.
- Shared database types are handwritten and incomplete. Generate Supabase TypeScript types before the schema or query surface grows substantially.
- There is no automated browser test suite.
- Hosted migration history is not managed by the Supabase CLI yet.
- Each user can currently belong to only one organization; there is no workspace switcher or self-service invitation flow.
- Availability, route optimization, WhatsApp integration, reminders, and customer self-service are future work.

## Documentation maintenance rule

Update this guide in the same change whenever work alters:

- Database tables, columns, constraints, indexes, RLS, functions, or triggers.
- Authentication or authorization boundaries.
- Application routing, major components, data-flow boundaries, or external integrations.
- Environment variables, setup steps, migration procedures, or required validation.

Small visual or copy-only changes do not require an update unless they change a documented workflow.
