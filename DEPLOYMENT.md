# Production deployment

The application is deployed as a Node.js Next.js application on Vercel and uses the existing hosted Supabase project.

## Live production environment

- URL: https://electrician-mvp-khaki.vercel.app
- Vercel project: `electrician-mvp` in the `TalZ` Hobby team
- Source: `talzemour-gif/electrician-mvp`, branch `main`
- Initial production deployment: commit `87a2f04`
- Status: live; `/`, `/customers`, `/calendar`, and `/pricing` return HTTP 200 and show the staff login when signed out.

Vercel automatically creates a new deployment when changes are pushed to `main`.

## Required production environment variables

Configure these in the Vercel project for Production, Preview, and Development environments:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

These are the same public client values documented in `.env.example`. Never add `.env.local`, a database password, or a Supabase service-role key to Git or Vercel client variables.

## First deployment

1. Import the GitHub repository into Vercel.
2. Keep the detected framework preset as Next.js and the project root as the repository root.
3. Add the required environment variables without surrounding quotes.
4. Deploy the `main` branch.
5. In Supabase Authentication URL configuration, set the production Site URL to the final HTTPS deployment URL. Add any required preview URLs separately.
6. Verify the production checklist below before giving staff the URL.

## Production checklist

- The page loads over HTTPS on a mobile phone and a laptop.
- An anonymous visitor sees only the login form.
- An authenticated user who is not in `app_members` cannot access business data.
- An approved staff user can sign in and sign out.
- Dashboard totals load.
- A test customer and verified address can be created, edited, and removed.
- A test service can be created and edited.
- A future appointment can be created, edited, and cancelled.
- Agenda, Day, and Week views load; Day view displays its route and stop list.
- Browser refresh keeps the signed-in session.
- No `.env` file or secret is present in the deployed Git revision.

Remove production test records after validation if they are not useful business data.

### Phase 1 closure — 2026-09-17

- Release commit: `a647919`
- `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `git diff --check` passed.
- `/`, `/customers`, `/calendar`, and `/pricing` returned HTTP 200 in production.
- The production monitoring endpoint returned HTTP 204 after deployment.
- Signed-out production access displayed only the login interface, with no business records.
- The production login interface was visually checked at a narrow mobile width. Laptop workflows and authenticated mobile workflows had already been exercised during the production rollout; issues found during that rollout were fixed before closure.
- Git contained no tracked environment or secret file.

## Error monitoring

Unexpected React rendering failures are caught by the route and global error boundaries. Staff see a Hebrew recovery screen, and the browser sends a small event to `POST /api/client-error`. The event contains only the page path, error digest, source, and timestamp; it must not contain customer or form data. Map API failures are logged by their server routes.

Review these events in Vercel under the project's **Logs** view by filtering for `[client-error]`, `[day-route-error]`, or `[address-lookup-error]`. During the pilot, review logs after a reported problem and at least once at the end of each working day. Vercel Hobby log retention is limited, so this is basic pilot monitoring rather than permanent error storage.

## Routine release

1. Review and commit the intended changes.
2. Run `npm ci`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` locally.
3. Push the reviewed commit to `main`.
4. Wait for the Vercel production deployment to succeed.
5. Smoke-test login and the feature changed by the release.

## Rollback

If a release breaks production, open the Vercel project's Deployments page, select the last known-good deployment, and promote it to Production. If the release included a database migration, follow the migration-specific recovery instructions; redeploying application code does not reverse database changes.

## External map services

Address lookup and daily routing currently use public OpenStreetMap, Nominatim, and OSRM services. They are acceptable for a low-volume pilot but do not provide a production service-level guarantee. A contracted provider or self-hosted services are required before meaningful traffic growth.
