# Production deployment

The application is deployed as a Node.js Next.js application on Vercel and uses the existing hosted Supabase project.

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
