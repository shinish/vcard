# Contact cards

Every person in a company gets one share link. Whoever opens it taps once and
the details land in their phone's address book — photo, job title, every
number, in English, Arabic, German or French. Built for True Star Business
Solutions.

FastAPI and SQLite behind a Next.js front end. Three faces:

- **Admin** — companies (one row per branch), the people in them, card design,
  analytics, settings. Every administrator spans every company.
- **A card** — `/user/<public id>`, no sign-in, serves a `.vcf`, a QR code and
  a matching email signature.
- **A card holder's page** — their own link, their own signature, their own
  figures, and nothing else.

## Running it

Two processes. The front end proxies `/api/*` to the back end, so the browser
only ever talks to one origin — a cross-origin API silently drops the session
cookie.

```sh
cd backend && uv sync && uv run uvicorn app.main:app --reload --port 8000
cd web && npm install && npm run dev
```

Then <http://localhost:3000/login>. The first run creates the database, the
uploads directory and an administrator; see `backend/app/bootstrap.py`.

```sh
cd backend && uv run pytest        # the API, end to end, against a throwaway database
cd backend && uv run ruff check .
cd web && npx tsc --noEmit
```

## Configuration

`backend/.env.example` lists the environment variables. Anything an admin
should be able to change without a redeploy — the share-link address, the
ZeptoMail token, notification addresses, the geocoder — lives in the database
instead, under Settings.

Two of them are easy to forget on a real domain: `COOKIE_SECURE=1`, or the
admin session cookie travels in the clear, and `CORS_ORIGINS`.

## Deploying

One small host runs all three containers. The images are built by CI and
pulled, so the host never compiles — which is the point of a burstable box.

```sh
az group create --name cards-rg --location centralindia
az deployment group create --resource-group cards-rg --template-file deploy/azure-vm.json \
  --parameters adminPublicKey="$(cat ~/.ssh/id_ed25519.pub)" sshFrom="$(curl -s https://api.ipify.org)" \
               size=Standard_B2ts_v2 cloudInit="$(base64 -i deploy/cloud-init.yml | tr -d '\n')"
ssh azureuser@<ip> 'cd /opt/cards && sudo docker compose up -d'
ssh azureuser@<ip> 'cd /opt/cards && sudo docker compose exec -T api \
  uv run --no-sync python -m app.bootstrap --email you@example.com'
```

Then point an A record at the address; Caddy gets the certificate itself.
Updating is `sudo sh /opt/cards/update.sh` — the database and the uploads are
on a named volume and outlive the images. The script exists because a plain
`docker compose pull` fetches both images at once, which on a 891 MB host ran
the memory down until the containers were killed and the box stopped
answering; it keeps a swapfile in place, pulls one at a time, and waits for
the login page before reporting.

Two things the deployment taught, both now in the code: Next resolves its
rewrites when it *builds*, so the API is routed by Caddy rather than through
the front end, and `app.bootstrap` is the only way into a fresh install, so it
has a test over it.

## Decisions worth knowing before changing things

- **A company row is a branch.** Branches share a name and differ by branch, so
  uniqueness is on the pair, never the name alone.
- **A public id is 22 characters of base62.** The card page has no sign-in, so
  that id is the only thing guarding the record. Never shorten it.
- **Company details seed a new card and then stop.** Editing a company does not
  rewrite cards that already exist — the same rule for its default photo.
- **One form saves a company.** The API rewrites every column it knows, so a
  form that posts half of them resets the other half.
- **Switches post `1` or `0`.** A bare checkbox posts nothing when it is off,
  which the API cannot tell apart from a form that never asked.
- **Two photo sizes from one upload.** 700 KB for the page, ~64 KB for the
  `.vcf`: base64 inflates by a third and phones refuse an oversized card.
- **No IP address is stored anywhere.** A visitor is a hash of address and
  agent, re-salted daily, so the same phone on two days counts twice and
  nobody can be followed between them. That is why there is no country report.
