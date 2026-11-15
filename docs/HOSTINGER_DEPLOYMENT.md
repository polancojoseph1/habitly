# Habitly Hostinger Deployment

## Target

| Item | Value |
| --- | --- |
| Repository | `https://github.com/polancojoseph1/habitly.git` |
| Branch | `main` |
| VPS | Ubuntu 24.04 at `187.77.8.184`, SSH port `22` |
| Deployment directory | `/docker/habitly-prod` |
| Initial URL | `http://187.77.8.184` |
| Existing proxy | Traefik on ports `80` and `443` |
| Shared proxy network | `n8n_default` |
| Existing app to preserve | n8n at `n8n.srv1353882.hstgr.cloud`, internal port `5678` |

Habitly uses two public GHCR images, `ghcr.io/polancojoseph1/habitly-api` and `ghcr.io/polancojoseph1/habitly-web`. GitHub Actions tags each image with the full Git commit SHA and `latest`. The production `docker-compose.yml` pulls those images and does not build or mount source code on the VPS. Local development stays in `docker-compose.dev.yml`.

The API stores its SQLite database at `/data/habitly.db` in the Compose volume `habitly-prod_habitly_data`. Neither the API nor web service publishes a host port. Traefik routes HTTP traffic to the web container on internal port `3000`; the web service proxies API requests to the API on internal port `8000`.

The production route uses Traefik entrypoint `web` and matches the IP host. Confirm that the existing Traefik entrypoint is named `web` and that no global HTTP to HTTPS redirect prevents access by IP. Do not change Traefik or the n8n route to make Habitly work. The current route should be inspected before enabling deployment.

## Files and secrets

- `docker-compose.yml`: production image based stack and Traefik labels.
- `docker-compose.dev.yml`: local development stack with source bind mounts.
- `backend/Dockerfile` and `frontend/Dockerfile`: non-root production images with health checks.
- `.github/workflows/deploy.yml`: build and publish images on `main`, then deploy only when explicitly enabled.
- `env.production.example`: safe template for the protected server file `/docker/habitly-prod/.env.production`.

Create `.env.production` on the VPS from `env.production.example`, then set permissions to `600`. It contains the SQLite URL and optional Telegram credentials. Never commit the server file or place its secrets in GitHub Actions logs.

The repository already has the GitHub Actions secret `HABITLY_DEPLOY_PRIVATE_KEY` and variables `HABITLY_SERVER_HOST`, `HABITLY_SERVER_PORT`, and `HABITLY_SERVER_USER`. Both GHCR packages were published as public with the first successful workflow run. Before enabling deployment, add the verified VPS host key lines as the secret `HABITLY_SSH_KNOWN_HOSTS`. Keep `HABITLY_DEPLOY_ENABLED` unset or false until all prerequisites below are complete.

## Before enabling deployment

1. Verify the VPS SSH host fingerprint and store its matching known-hosts line in `HABITLY_SSH_KNOWN_HOSTS`.
2. Confirm the `habitly-deploy` account can write `/docker/habitly-prod`, run Docker Compose, and has the generated deployment public key installed.
3. Confirm the external Docker network `n8n_default` and Traefik entrypoint `web` exist.
4. Confirm no Traefik rule already claims `Host(187.77.8.184)` and no global middleware redirects the initial HTTP route to HTTPS.
5. Create `/docker/habitly-prod/.env.production` with mode `600` and make sure `DATABASE_URL` is exactly `sqlite:////data/habitly.db`.
6. Enable daily VPS backups after reviewing any additional cost. Verify n8n is healthy before deployment.
7. Set the GitHub Actions variable `HABITLY_DEPLOY_ENABLED` to `true` only after the account, host key, public packages, environment file, and route are ready.

Do not install Nginx. Do not stop, replace, delete, or reconfigure the existing Traefik or n8n containers, volumes, networks, or routes.

Docker daemon access is effectively host-level access. If the deploy user must be more restricted than Docker socket access allows, install a reviewed root-owned fixed deploy wrapper and adjust the workflow to call only that wrapper before granting the user Docker access.

## First deployment and operations

The workflow copies the tracked production Compose file to `/docker/habitly-prod`, pulls the SHA-tagged images, and runs `docker compose up -d` as the separate `habitly-prod` project. The first deployment creates production containers and a SQLite volume without changing the existing `habitly` project. It waits for API and web container health and checks `http://127.0.0.1/health` through Traefik with the Habitly IP host header. If health fails, it restores the last successful image tag. On a failed first deployment it stops only the new production API and web services and leaves the data volume intact.

Run these commands from `/docker/habitly-prod`:

```sh
docker compose config
docker compose pull
docker compose up -d
docker compose ps
curl -i -H 'Host: 187.77.8.184' http://127.0.0.1/health
```

Logs:

```sh
docker compose logs --tail=100 api web
```

Restart Habitly:

```sh
docker compose restart api web
```

Manual rollback to the previous successful image tag:

```sh
IMAGE_TAG="$(cat .deploy-state.previous)" docker compose pull
IMAGE_TAG="$(cat .deploy-state.previous)" docker compose up -d
cp .deploy-state.previous .deploy-state
```

Rollback changes only the Habitly API and web images. It does not remove the SQLite volume. Before restoring an old image after a database schema change, review compatibility with the current SQLite data.

## Data and backup notes

The SQLite volume persists across container replacement. It is not a substitute for backups. Enable Hostinger daily VPS backups after checking the price, and regularly make an off-server copy of `habitly-prod_habitly_data` before schema changes. The ignored local `backend/habitly.db` is not copied to the VPS; import browser workspace data through Habitly Settings after deployment.

The old `docker-compose.hostinger.yml` remains in the repository for reference. It is not used by this image based deployment.
