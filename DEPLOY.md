# Deploying to wsl.vrittechnologies.com

Target server: `5.223.63.171` (DNS A record `wsl` → that IP, DNS-only).

That box **already runs** `uhn-caddy` (Caddy on ports 80/443) for the `uhn` app.
We do **not** start a second proxy and do **not** touch the uhn sites. Instead we
run Termix internally and add **one site block** to the existing Caddy — adding a
route is graceful (Caddy hot-reloads) and leaves uhn untouched.

```
            uhn-caddy  (80/443, Let's Encrypt)
            ├── (existing uhn sites)            ← untouched
            └── wsl.vrittechnologies.com ──► termix:8080   ← we add this
```

---

## One-time setup on the server

### 1. Make sure the image exists
Our CI (`build-deploy.yml`) builds `ghcr.io/questbibek/termix:latest` on every
push to the **`vrit`** branch (our deploy branch; `main` mirrors upstream — see
UPSTREAM_SYNC.md). Push `vrit` once so the image is published, or the deploy will
have nothing to pull. (The same workflow also SSHes in and runs the compose below.)

### 2. Clone the fork and start Termix (internal only)
```bash
git clone -b vrit https://github.com/questbibek/Termix /opt/termix
cd /opt/termix

# log in so the server can pull our private GHCR image (read:packages PAT)
echo <GHCR_PAT> | docker login ghcr.io -u questbibek --password-stdin

# optional: enable R2 backups
cp docker/backup.env.example .env && nano .env && chmod 600 .env

docker compose -f docker/compose.prod.yml up -d
```

`compose.prod.yml` publishes `8080:8080`. On a shared box you usually don't want
that port open to the internet — bind it to loopback instead by creating
`/opt/termix/docker-compose.override.yml`:
```yaml
services:
  termix:
    ports: !reset []          # drop the public 8080 mapping
```
Caddy will reach Termix over the Docker network by name, so no host port is
needed (see step 3).

### 3. Let uhn-caddy reach the Termix container
Attach the existing Caddy to Termix's network so it can resolve `termix` by name:
```bash
# find Termix's network (usually termix_termix-net)
docker network ls | grep termix

docker network connect termix_termix-net uhn-caddy
```
> If the uhn stack is later recreated, re-run this `network connect` (or add
> `termix_termix-net` as an `external` network in the uhn compose to make it
> durable).

### 4. Add the site to uhn-caddy's Caddyfile
Find where the uhn Caddyfile is mounted from (so the edit persists):
```bash
docker inspect uhn-caddy -f '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```
Edit that host file and append:
```caddy
wsl.vrittechnologies.com {
    reverse_proxy termix:8080
}
```
Then reload Caddy gracefully (no downtime for uhn):
```bash
docker exec uhn-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
# (use the Destination path from the inspect output if it isn't /etc/caddy/Caddyfile)
```

### 5. Verify
```bash
curl -I https://wsl.vrittechnologies.com        # 200/302 from Termix, valid LE cert
```
Open the site — you should see the Vrit-branded login page over HTTPS.

---

## Updates after the first deploy
Pushing to `vrit` triggers `build-deploy.yml`, which SSHes in and runs
`docker compose -f docker/compose.prod.yml pull && up -d`. Caddy keeps routing
the domain automatically — no further proxy changes needed.

## If you ever move to Dokploy
Deploy the repo as a Dokploy compose app using `docker/compose.prod.yml`, set the
domain to `wsl.vrittechnologies.com` in the Dokploy UI, and let Dokploy's Traefik
own the cert. In that case skip steps 3–4 above.
