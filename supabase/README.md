# Database setup

This MVP supports separate private workspaces for approved service businesses.

## Fresh project

Run `schema.sql` once in the Supabase SQL Editor as postgres. It creates the complete
current schema for a fresh project. Do not also replay the individual migrations.
The electrician-mvp hosted project was initialized through the SQL Editor on 2026-09-10.
This manual initialization does not register the migration with the Supabase CLI.
Before adopting CLI migrations on this project, reconcile the applied baseline instead of replaying it.

Tables: organizations, organization_members, customers, customer_addresses, job_types,
appointments, availability_blocks, and appointment_reschedules. Three initial electrical
service prices are seeded only for the electrician organization; no demo customers.
All tables have RLS enabled. Anonymous visitors have no table access. Authenticated
non-members cannot access business records. Members can access only their organization's
records. Staff can read, create, and update; only organization admins can delete. Members
cannot change membership. Customer creation uses an atomic, invoker-security RPC.

## Add an organization administrator

1. In Supabase Authentication > Users, create a user with their email and password.
   The account owner should enter their password themselves. Auto-confirm is suitable
   for this administrator-created login.
2. After verifying the user's identity, copy their UUID from Authentication > Users.
3. Run the following in the SQL Editor, replacing the placeholders. It creates an empty
   organization and assigns the user as its administrator in one transaction:

```sql
begin;
with new_organization as (
  insert into public.organizations(name, profession)
  values ('BUSINESS_NAME_HERE', 'PROFESSION_HERE')
  returning id
)
insert into public.organization_members(user_id, organization_id, role)
select 'USER_UUID_HERE', id, 'admin' from new_organization;
commit;
```

To add staff to an existing organization, insert their Auth user UUID and the existing
organization UUID into `organization_members`. Only the project administrator can provision
membership. A Supabase dashboard login and an application login are separate accounts.
The pilot supports one organization per user and has no in-app invitation flow.

## Local connection

Copy `.env.example` to `.env.local` and enter the project URL and publishable key.
Restart Next.js after changing configuration. Never add secret/service-role keys to
browser code or `NEXT_PUBLIC_` variables. The app requires no service-role key.

## Verification

Run `tests/access-and-save.sql` as postgres in the SQL Editor. It creates temporary
fixtures inside one transaction, checks tenant isolation, staff CRUD and atomic rollback,
membership protection, cross-tenant denial, non-member denial, and anonymous denial, then rolls everything
back. The final result must start with PASS.

The initial schema and access checks were applied successfully to the hosted database.
The browser client was also checked to receive permission denied for signed-out reads.

## Current application scope

- Sign in/out with email and password; staff membership checked before rendering business pages.
- Customers: database list/search, atomic creation with multiple initial addresses,
  edit details, add and edit addresses,
  and remove addresses that are not referenced by appointments.
- New and edited addresses must be located by the map service or manually pinned;
  verified latitude and longitude are stored together on `customer_addresses`.
- Pricing: database list, create and edit with notes; updates do not rewrite historical appointment prices.
- Dashboard: actual customer, open appointment and active service counts, plus the route for today or the next scheduled work day.
- Calendar: creates and lists appointments, uses `Asia/Jerusalem` for input and
  display, searches customers by name or phone in recent-activity order, fills price
  and duration from the selected service, edits and cancels meetings, adds customer
  addresses inline, and separates upcoming appointments from history. Completion
  and more advanced rescheduling workflows remain future work.

Browser verification completed on 2026-09-10 with the approved staff account:
customer + address + notes persisted after a full refresh; a price change persisted
and was restored to its original value; dashboard displayed the actual counts.
One clearly labeled, fictional connection-test customer remains for inspection.
