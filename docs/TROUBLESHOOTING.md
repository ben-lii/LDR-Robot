# Troubleshooting

Symptom → cause → fix table will grow in later phases.

| Symptom                                      | Cause                                                                      | Fix                                                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Login returns rate limited after a few tries | In-memory limiter: max 5 failures per IP+email per 10 minutes              | Wait, or restart the web process (clears the bucket). On Vercel this is per-instance only — a speed bump, not a hard global lock. |
| Login fails / server error about passwordHash parts | `.env` expanded `$` inside the scrypt hash                          | In `AUTH_USERS_JSON`, escape each `$` as `\$` (e.g. `scrypt\$16384\$8\$1\$…`). Restart `dev:web`.                                  |
| Session API 401                              | Missing/expired login cookie, or user removed from `AUTH_USERS_JSON`       | Sign in again; redeploy after editing users.                                                                                      |
| Session API 404 for a robot you expect       | Slug missing from `ROBOTS_JSON`, or user `robots` list does not include it | Fix env JSON and restart / redeploy.                                                                                              |
