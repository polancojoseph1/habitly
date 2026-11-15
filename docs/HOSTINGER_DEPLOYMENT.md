# Habitly Hostinger Deployment

## Target

| Item | Value |
| --- | --- |
| Repository | `https://github.com/polancojoseph1/habitly.git` |
| Branch | `main` |
| VPS | Ubuntu 24.04 at `187.77.8.184`, SSH port `22` |
| Deployment directory | `/docker/habitly-prod` |
| Initial URL | `https://habitly.srv1353882.hstgr.cloud` |
| Existing proxy | Traefik on ports `80` and `443` |
| Shared proxy network | `n8n_default` |
| Existing app to preserve | n8n at `n8n.srv1353882.hstgr.cloud`, internal port `5678` |

Habitly uses two public GHCR images, `ghcr.io/polancojoseph1/habitly-api` and `ghcr.io/polancojoseph1/habitly-web`. GitHub Actions tags each image with the full Git commit SHA and `latest`. The production `docker-compose.yml` pulls those images and does not build or mount source code on the VPS. Local development stays in `docker-compose.dev.yml`.

The API stores its SQLite database at `/data/habitly.db` in the Compose volume `habitly-prod_habitly_data`. Neither the API nor web service publishes a host port. Traefik routes HTTP traffic to the web container on internal port `3000`; the web service proxies API requests to the API on internal port `8000`.

The VPS hostname `habitly.srv1353882.hstgr.cloud` resolves to the VPS, but does not currently present a trusted certificate. Habitly must use the existing Traefik HTTPS entrypoint and certificate resolver. Inspect the current Traefik labels before setting `HOSTINGER_TRAEFIK_CERT_RESOLVER`; do not change Traefik or the n8n route to make Habitly work.

## Files and secrets

- `docker-compose.yml`: production image based stack and Traefik labels.
- `docker-compose.dev.yml`: local development stack with source bind mounts.
- `backend/Dockerfile` and `frontend/Dockerfile`: non-root production images with health checks.
- `.github/workflows/deploy.yml`: run API tests and a web build, publish images on `main`, then deploy through Hostinger's Docker Manager action only when explicitly enabled.
- `env.production.example`: safe template for the protected server file `/docker/habitly-prod/.env.production`.

Create `.env.production` on the VPS from `env.production.example`, then set permissions to `600`. It contains the SQLite URL and optional Telegram credentials. Never commit the server file or place its secrets in GitHub Actions logs.

The GitHub Actions workflow uses public GHCR images, so no container registry credentials are needed on the VPS. Hostinger Docker Manager deployment requires the `HOSTINGER_API_KEY` Actions secret. The `HOSTINGER_VM_ID`, `PRODUCTION_DOMAIN`, and `HOSTINGER_TRAEFIK_CERT_RESOLVER` Actions variables must also be set. The Compose file does not depend on a server-side `.env.production` file; optional Telegram credentials default to empty and should be configured in a protected Hostinger environment if needed. Do not enable deployment until the data migration path and HTTPS route have been inspected. The earlier SSH deployment variables are no longer used by this workflow.

## Before enabling deployment

1. Store the Hostinger API key in the GitHub Actions secret `HOSTINGER_API_KEY`; never place it in the repository.
2. Confirm the Hostinger VM ID, production domain, and existing Traefik certificate resolver.
3. Inspect the old `habitly` Compose project and locate its SQLite file. Back it up and copy it into the new `habitly-prod_habitly_data` volume before switching traffic.
4. Confirm the external Docker network `n8n_default` and the Traefik HTTPS entrypoint exist.
5. Enable daily VPS backups after reviewing any additional cost. Verify n8n is healthy before deployment.
6. Set `HOSTINGER_DEPLOY_ENABLED` to `true` only after the old database is safely copied and the HTTPS route is configured.

Do not install Nginx. Do not stop, replace, delete, or reconfigure the existing Traefik or n8n containers, volumes, networks, or routes.

Docker daemon access is effectively host-level access. If the deploy user must be more restricted than Docker socket access allows, install a reviewed root-owned fixed deploy wrapper and adjust the workflow to call only that wrapper before granting the user Docker access.

## First deployment and operations

The workflow publishes SHA-tagged images and calls Hostinger's Docker Manager action for the separate `habitly-prod` project. It checks the HTTPS health route and, on a failed push deployment, requests deployment of the previous commit's image tag. A first deployment has no prior commit rollback. The new named volume must be populated from the old SQLite data before traffic is switched. The existing `habitly` Compose project remains in place.

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
