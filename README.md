# Electrician MVP

Hebrew, right-to-left business management app for mobile service businesses in Israel.
Built with Next.js, React, TypeScript and Supabase.

Engineering architecture, schema notes, and contribution guidance are documented in
[`ENGINEERING.md`](ENGINEERING.md). Keep it current when database schema or code
architecture changes.

## Run locally

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. If macOS reports file-watcher limits, use:

```sh
WATCHPACK_POLLING=true npm run dev -- --hostname 127.0.0.1 --webpack
```

## Database and login

See `supabase/README.md` for schema setup, staff approval and database tests.
Copy `.env.example` to `.env.local` and supply the project URL and publishable key.
The hosted database has been initialized. Each app user needs a Supabase Auth login
and an approved `organization_members` entry. Supabase dashboard credentials are separate.

Customers, their addresses and notes are saved in Supabase. Existing customer
details and addresses can be edited, and unused addresses can be removed after
confirmation. New customers can be created with multiple addresses. The customer
list keeps multiple addresses collapsed behind a count and shows past and future
appointment totals. Pricing supports adding and editing service types, including
notes. The calendar searches recently updated customers, creates and edits future
appointments with customer, address, service, Israeli date/time, duration, price
and notes, adds missing customer addresses inline, cancels appointments into
history, and maps Day-view appointments in time order with a road route. Dashboard
counts use real records.

## Checks

```sh
npx tsc --noEmit
```

Database access and atomic-write regression checks: `supabase/tests/access-and-save.sql`.

## Production

The production setup, environment variables, release checks, smoke tests, and rollback procedure are documented in [`DEPLOYMENT.md`](DEPLOYMENT.md).
