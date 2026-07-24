#!/usr/bin/env bash
# One-shot deploy of the Conduit backend to your Supabase project.
#
# Run this on YOUR machine (this sandbox can't reach Supabase — egress is policy-blocked).
# Prereqs: the Supabase CLI (https://supabase.com/docs/guides/cli) and Docker running.
# Secrets are handled by the CLI's own prompts — nothing is written to the repo.
#
#   ./supabase/deploy.sh <project-ref>
#
# <project-ref> is the ref in your project's dashboard URL:
#   https://supabase.com/dashboard/project/<project-ref>

set -euo pipefail

REF="${1:-}"
if [ -z "$REF" ]; then
  echo "usage: ./supabase/deploy.sh <project-ref>" >&2
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI not found. Install it: https://supabase.com/docs/guides/cli" >&2
  exit 1
fi

# Run from the repo root so the functions' import map can resolve ../../packages.
cd "$(dirname "$0")/.."

echo "==> 1/4 Authenticating (opens a browser; or set SUPABASE_ACCESS_TOKEN first)"
supabase login >/dev/null 2>&1 || supabase login

echo "==> 2/4 Linking project '$REF' (prompts for the database password)"
supabase link --project-ref "$REF"

echo "==> 3/4 Applying migrations: tables, RLS, Vault RPCs, pg_cron"
supabase db push

echo "==> 4/4 Deploying Edge Functions"
supabase functions deploy connectors capabilities health sync bots

echo
echo "==> Backend deployed. Frontend env values (anon key only — never the service_role key):"
echo "    VITE_SUPABASE_URL=https://$REF.supabase.co"
supabase projects api-keys --project-ref "$REF" 2>/dev/null | sed -n '1,20p' || \
  echo "    (get VITE_SUPABASE_ANON_KEY from: Dashboard → Project Settings → API → anon public)"
echo
echo "Next: see 'Smoke test' and 'Scheduled sync' in supabase/README.md."
