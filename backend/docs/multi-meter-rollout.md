# Multi-meter accounts — production rollout

Branch: `feature/multi-meter-accounts` (backend only; no frontend build needed).
Server: `~/gridx-combined-backend`, pm2 process `combined-backend`.

## 0. Before you start

- The server checkout may be on a different branch with commits that are not
  in `feature/multi-meter-accounts` (it is based on
  `feature/ble-app-authentication` @ 30e8f58). Check with
  `git log --oneline HEAD..origin/feature/multi-meter-accounts` and the
  reverse; merge rather than switch if the server has commits this branch
  lacks, or other features get rolled back.
- `backend/.env` must define `SECRET_KEY` (there is no fallback any more;
  without it every login fails) and `EMAIL_KEY` (the hard-coded SMTP
  fallback was removed; without it password-reset e-mails fail).

## 1. Back up the database

```bash
cd ~/gridx-combined-backend/backend
set -a; . ./.env; set +a
mysqldump -h "$RDS_HOSTNAME" -P "${RDS_PORT:-3306}" -u "$RDS_USERNAME" -p"$RDS_PASSWORD" \
  --single-transaction --routines --triggers "$RDS_DB_NAME" | gzip > ~/backup-pre-multimeter-$(date +%F-%H%M).sql.gz
```

## 2. Deploy

```bash
cd ~/gridx-combined-backend
git fetch origin
git merge --no-ff origin/feature/multi-meter-accounts   # or checkout, see step 0
cd backend && npm install --omit=dev
node migrations/20261029_customer_meters.js --dry-run   # shows what the backfill will do
node migrations/20261029_customer_meters.js             # creates tables, backfills, validates
pm2 restart combined-backend && pm2 logs combined-backend --lines 50
```

The migration also runs at startup (idempotent); running it by hand first
lets you read its report. It never modifies or deletes existing rows.

## 3. Transition switches (backend/.env)

| Variable | Default | Effect |
|---|---|---|
| `METER_VALIDATE_ALLOW_UNVERIFIED` | `false` | `false`: the meter-button confirmation must come from a meter with a pinned key. **No meter has one yet**, so customer self-signup and "Add meter" stay unavailable until meters pin keys (see 4). Existing accounts keep working. `true`: the confirmation is accepted without meter credentials — signup/linking work, but anyone who can reach the endpoint can confirm a pending validation (the pre-existing level of risk). |
| `METER_REGISTRATION_ALLOW_ANONYMOUS` | `false` | Maintenance app builds older than this change register meters without a token. `true` keeps them working (registration without a token creates the record but never opens a key-pinning window). |
| `METER_PIN_TOFU` | `false` | `true` pins a meter's key on its first signed registration without a window. |
| `METER_REQUIRE_TOKEN` | `false` | `true` refuses meter telemetry posted without a verified meter token. Only once the fleet has pinned keys. |
| `RUN_MIGRATIONS_ON_START` | (on) | `false` skips the startup migration. |

Recommended initial production setting: leave all at default except
`METER_REGISTRATION_ALLOW_ANONYMOUS=true` until technicians have the updated
Maintenance app.

## 4. Getting meters onto verified identities

A meter pins its key the next time it performs a signed registration while
a pinning window is open. Windows are opened by a technician registering
the meter (Maintenance app, signed in) or by an admin:

```bash
curl -X POST https://gridx-meters.com/meters/pin-window \
  -H "Authorization: Bearer <admin token>" -H 'Content-Type: application/json' \
  -d '{"drns":["0260028359123"],"hours":24}'
```

Deployed firmware only calls `/meters/getAccessToken` when it is not
registered (first boot, factory reset, or after 3 HTTP responses carrying an
`err` key — api.cpp). A meter that is already registered therefore has to be
factory-reset / re-registered while its window is open. Firmware support for
re-registering on request is the follow-up that makes this fleet-wide.

## 5. Linking an existing account to a meter (support path)

```bash
curl -X POST https://gridx-meters.com/cb/admin/customer-meters \
  -H "Authorization: Bearer <admin token>" -H 'Content-Type: application/json' \
  -d '{"Email":"customer@example.com","DRN":"0260028359123"}'      # member
# add "role":"owner" to make the account the meter's owner (one per meter)
```

Check: `GET /cb/admin/customers/<UserID>/meters`, or sign in to the app.

## 6. Verify

```bash
# customer: profile with meter count
curl -s https://gridx-meters.com/cb/customer/me -H "Authorization: Bearer <customer token>"
# customer token on another meter -> 403 METER_NOT_AUTHORIZED
# customer token on /cb/meters-list -> 403
# anonymous POST /meters/getAccessToken with {"DRN":...} -> token without "typ" (grants nothing)
```

## 7. Rollback

```bash
cd ~/gridx-combined-backend && git checkout <previous commit> && pm2 restart combined-backend
```

The new tables (`CustomerMeters`, `MeterLinkRequests`, `MeterDeviceKeys`) and
the `SystemUsers.token_version` column are ignored by the old code and can
stay. Restore the dump from step 1 only if data was damaged.
