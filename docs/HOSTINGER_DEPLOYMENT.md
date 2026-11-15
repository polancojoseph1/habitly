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

The VPS hostname `habitly.srv1353882.hstgr.cloud` resolves to the VPS. Traefik uses the existing `mytlschallenge` resolver and redirects HTTP to HTTPS. Do not change Traefik or the n8n route to make Habitly work.

## Files and secrets

- `docker-compose.yml`: production image based stack and Traefik labels.
- `docker-compose.dev.yml`: local development stack with source bind mounts.
- `backend/Dockerfile` and `frontend/Dockerfile`: non-root production images with health checks.
- `.github/workflows/deploy.yml`: run API tests and a web build, publish images on `main`, then deploy over SSH only when explicitly enabled.
- `ops/habitly-deploy-wrapper.sh`: restricted root-owned deployment wrapper installed at `/usr/local/sbin/habitly-deploy`.

The production Compose file has no server `.env` dependency. Telegram credentials remain unset unless separately configured in a protected server environment.

The GitHub Actions workflow uses public GHCR images, so no container registry credentials are needed on the VPS. It connects with the `HABITLY_DEPLOY_PRIVATE_KEY` Actions secret and the verified `HABITLY_SSH_KNOWN_HOSTS` entry. It invokes a root-owned fixed wrapper through a narrowly scoped sudo rule; the deploy account is not added to the Docker group. The wrapper only accepts full Git commit SHA image tags and fixed operations for the `habitly-prod` project. Optional Telegram credentials default to empty.

## Deployment status and boundaries

GitHub Actions deployment is enabled. The restricted `habitly-deploy` account, fixed wrapper, SSH secrets, `n8n_default` network, Traefik route, and HTTPS health check are configured and were used successfully for the 2026-11-15 deployment.

Daily Hostinger VPS backups are not a prerequisite for deploying Habitly. Jefe explicitly waived that requirement. Preserve the existing Traefik and n8n containers, volumes, networks, and routes during future deployments.

Do not install Nginx. Do not stop, replace, delete, or reconfigure the existing Traefik or n8n containers, volumes, networks, or routes.

The deploy user is intentionally not in the Docker group. Its sudo rule permits only the fixed root-owned wrapper, which uses the root-owned Compose file and limits deployments to SHA-tagged Habitly images.

## First deployment and operations

The workflow publishes SHA-tagged images and calls the fixed server wrapper for the separate `habitly-prod` project. The wrapper pulls and starts only the API and web services, checks container health and the HTTPS route, and restores the previous known-good image tag if the new version fails. GitHub Actions also checks the public HTTPS route and requests a rollback if that check fails. Only after the production route passes does the workflow stop the old API container, closing its direct port 8000 exposure while retaining the old project and SQLite file.

Run the wrapper through the restricted deployment account:

```sh
sudo /usr/local/sbin/habitly-deploy
```

Logs:

```sh
printf '%s\n' logs > ~/.habitly-deploy-request
sudo /usr/local/sbin/habitly-deploy
```

Restart Habitly:

```sh
printf '%s\n' restart > ~/.habitly-deploy-request
sudo /usr/local/sbin/habitly-deploy
```

Manual rollback to the previous successful image tag:

```sh
printf '%s\n' rollback > ~/.habitly-deploy-request
sudo /usr/local/sbin/habitly-deploy
```

Rollback changes only the Habitly API and web images. It does not remove the SQLite volume. Before restoring an old image after a database schema change, review compatibility with the current SQLite data.

## Data persistence

The SQLite volume `habitly-prod_habitly_data` persists across container replacement and is not removed by rollback. Before restoring an old image after a database schema change, review compatibility with the current SQLite data. The ignored local `backend/habitly.db` is not copied to the VPS.

The old `docker-compose.hostinger.yml` remains in the repository for reference. It is not used by this image based deployment.
