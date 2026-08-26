# Tink banking Edge Function

This function keeps the confidential Tink client secret and short-lived user
access token outside the Android bundle. It requires a valid Supabase Auth JWT.

Server-side secrets:

- `TINK_CLIENT_ID`
- `TINK_CLIENT_SECRET`

Deploy with Supabase JWT verification enabled. Never expose either secret via an
`EXPO_PUBLIC_*` variable or return provider tokens to the mobile client.
