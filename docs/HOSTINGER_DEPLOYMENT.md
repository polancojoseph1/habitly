# Habitly Hostinger Deployment Brief

This file keeps the deployment facts and safety requirements for Habitly's Hostinger VPS. It contains no passwords, API tokens, private keys, or database credentials.

## Confirmed project details

| Item | Value |
| --- | --- |
| GitHub repository | `https://github.com/polancojoseph1/habitly.git` |
| Branch | `main` |
| Application | Habitly |
| Stack | Next.js frontend, FastAPI Python API, PostgreSQL, Docker Compose |
| Deployment directory | `/opt/habitly` |
| Frontend container port | `3000`, bound only to VPS loopback through the deployment Compose file |
| API container port | `8000`, internal Docker network only |
| PostgreSQL container port | `5432`, internal Docker network only |
| Public web ports | `80` and `443` through the existing Hostinger reverse proxy |
| VPS operating system | Ubuntu 24.04 |
| VPS hostname | `srv1353882.hstgr.cloud` |
| VPS public IPv4 | `187.77.8.184` |
| SSH port | `22` |
| VPS resources | 2 vCPU, 8 GB RAM, 100 GB disk |
| Region | Boston, United States |
| Docker Manager | Installed |
| Existing service to preserve | n8n and its data, configuration, containers, and routes |

## Still required before public release

- Public domain or subdomain for Habitly. Do not assume the VPS hostname is the website domain.
- A dedicated deployment SSH key and a limited deployment user. Do not use the Hostinger password, root password, or an unrestricted root key in automation.
- A verified inventory of the existing Docker containers, reverse proxy, networks, and ports. Do not alter or stop n8n or its proxy while determining the route for Habitly.
- Hostinger daily VPS backups are reported as disabled. Enable a suitable backup plan before storing live user data. Check any added cost in hPanel first.
- Set production database credentials in an untracked server-side `.env` file. Never put real credentials in this repository or in chat.

## Repository findings

- The existing `docker-compose.yml` is for local development. It uses SQLite, mounts the source tree, and runs the Next.js development server. Do not use it on the VPS.
- `docker-compose.hostinger.yml` is the separate production stack. It gives PostgreSQL a named persistent volume, keeps the API and database off public host ports, and binds the frontend to loopback only.
- `frontend/Dockerfile` builds Next.js as a standalone production server. Its API rewrite is compiled to the internal Docker service address `http://api:8000`.
- `backend/Dockerfile` runs FastAPI on port `8000` inside Docker. Production mode refuses to start if `DATABASE_URL` is missing or points to SQLite.
- `schema.postgres.sql` initializes tables only when the PostgreSQL volume is first created. Later schema updates require reviewed incremental SQL. Never reapply the full schema to a database containing data.
- The deployment Compose file does not bind ports `80` or `443`. The VPS must first be inspected to identify the existing proxy and route Habitly without disturbing n8n.

## Safe deployment path

1. Confirm the domain and its DNS records point to `187.77.8.184`.
2. Enable daily backups in hPanel before the first live database write. Confirm any backup charge before enabling it.
3. Inspect running Docker containers, compose projects, networks, firewall rules, and listeners on ports `80`, `443`, and `3100`. Record n8n's existing containers, volumes, and proxy route. Make no changes to n8n.
4. Create a dedicated `habitly-deploy` user and a restricted deploy command. Do not give the user an interactive root shell. Docker access is powerful, so the deploy key should be limited to the fixed Habitly deploy command where practical.
5. Add only the public SSH key to Hostinger. Keep its private key in GitHub Actions secrets or on the user's local machine, never in the repository or chat.
6. Place the repository under `/opt/habitly`. Create its server-side `.env` from `.env.hostinger.example`, replace all placeholders with generated values, and restrict permissions to the deployment administrator.
7. Inspect the existing proxy and configure the requested domain to route to Habitly's loopback frontend port or attach Habitly to the existing proxy network. Keep the API and PostgreSQL private.
8. Start Habitly with the production Compose file, confirm the health checks, then confirm domain routing and HTTPS.
9. Set up GitHub Actions to call the fixed deploy command only after the deployment SSH key, limited user, and proxy route are ready. A push to `main` is the approval event for automatic production deployment.
10. Keep the prior image or commit available for rollback. Confirm n8n still responds and its persistent data volume is unchanged.

## Production Compose commands

Run from `/opt/habitly` after the proxy and server-side `.env` are ready:

```sh
docker compose -f docker-compose.hostinger.yml config
docker compose -f docker-compose.hostinger.yml up -d --build
docker compose -f docker-compose.hostinger.yml ps
docker compose -f docker-compose.hostinger.yml logs --tail=100 api web db
```

The first database container initialization imports `schema.postgres.sql` into a new named volume. The script is not rerun when the volume already contains a PostgreSQL database.

## Data migration note

The ignored local SQLite database and browser cache are not copied to Hostinger automatically. Before production launch, preserve a local backup. Use Habitly's Settings export/import flow to transfer browser workspace data after the production service is online. Existing local API database accounts may require administrator-assisted export because older accounts without current passwords and token records cannot safely be claimed by email alone.

## Missing deployment inputs

- Domain/subdomain: not supplied yet.
- Hostinger deploy username and SSH public key: not provisioned yet.
- GitHub Actions deploy key and pinned SSH host key: not configured yet.
- Existing proxy type, container name, Docker network, and active routes: must be read from the VPS before selecting a routing configuration.
- Production secrets: not generated yet and must be created directly on the VPS.
