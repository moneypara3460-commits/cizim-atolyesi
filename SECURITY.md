# Security Policy

## Reporting a vulnerability

Please do not publish exploitable details in a public issue. Contact the repository owner privately through GitHub's security advisory reporting feature.

Include:
- A concise description and affected component
- Reproduction steps that do not access another user's data
- Impact and any suggested mitigation

Do not include passwords, access tokens, API keys, personal data, or production customer records in reports.

## Security controls

- Keep server-side credentials in Supabase Edge Function secrets, never in browser or mobile bundles.
- Enforce authorization in Supabase RLS and Edge Functions. Client-side checks are not an authorization boundary.
- Keep dependency and GitHub Actions updates enabled.
- Review CodeQL and dependency alerts before merging.
- Rotate any credential that may have been committed or exposed. Removing a secret from the current tree does not invalidate it.

## Operational note

Repository configuration cannot enable GitHub secret scanning or push protection on every account/plan. Verify and enable both in the repository's Settings > Security > Code security and analysis.
