#!/usr/bin/env bash
set -Eeuo pipefail

readonly project_dir=/docker/habitly-prod
readonly compose_file="$project_dir/docker-compose.yml"
readonly request_file=/home/habitly-deploy/.habitly-deploy-request
readonly state_dir=/var/lib/habitly-deploy
readonly current_tag_file="$state_dir/current-tag"
readonly previous_tag_file="$state_dir/previous-tag"
readonly domain=habitly.srv1353882.hstgr.cloud

exec 9>/run/lock/habitly-deploy.lock
flock -n 9 || { echo 'A Habitly deployment operation is already running.' >&2; exit 1; }

request=$(python3 - "$request_file" "$(id -u habitly-deploy)" <<'PY'
import os
import stat
import sys

path, expected_uid = sys.argv[1], int(sys.argv[2])
fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
try:
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != expected_uid or info.st_size > 64:
        raise SystemExit("Invalid deployment request file.")
    raw = os.read(fd, 65)
finally:
    os.close(fd)

try:
    request = raw.decode("ascii").strip()
except UnicodeDecodeError:
    raise SystemExit("Deployment request must be ASCII.")

if not request or "\n" in request or "\r" in request:
    raise SystemExit("Deployment request must contain exactly one value.")
print(request)
PY
)

mkdir -p "$state_dir"
chmod 700 "$state_dir"
touch "$current_tag_file" "$previous_tag_file"
chmod 600 "$current_tag_file" "$previous_tag_file"

current_tag=$(cat "$current_tag_file")
previous_tag=$(cat "$previous_tag_file")

compose() {
    local tag=$1
    shift
    IMAGE_TAG="$tag" docker compose --env-file /dev/null -p habitly-prod -f "$compose_file" "$@"
}

route_healthy() {
    curl --silent --show-error --fail --resolve "$domain:443:127.0.0.1" \
        --max-time 8 "https://$domain/health" >/dev/null
}

wait_healthy() {
    local tag=$1
    local attempt=0
    while [ "$attempt" -lt 36 ]; do
        local api_id web_id api_health web_health
        api_id=$(compose "$tag" ps -q api 2>/dev/null || true)
        web_id=$(compose "$tag" ps -q web 2>/dev/null || true)
        if [ -n "$api_id" ] && [ -n "$web_id" ]; then
            api_health=$(docker inspect -f '{{.State.Health.Status}}' "$api_id" 2>/dev/null || true)
            web_health=$(docker inspect -f '{{.State.Health.Status}}' "$web_id" 2>/dev/null || true)
            if [ "$api_health" = healthy ] && [ "$web_health" = healthy ] && route_healthy; then
                return 0
            fi
        fi
        attempt=$((attempt + 1))
        sleep 5
    done
    return 1
}

deploy_tag() {
    local tag=$1
    if ! [[ "$tag" =~ ^[0-9a-f]{40}$ ]]; then
        echo 'Refusing an image tag that is not a full Git commit SHA.' >&2
        return 1
    fi
    docker network inspect n8n_default >/dev/null
    if ! compose "$tag" pull api web; then
        echo 'Image pull failed; leaving the current Habitly deployment in place.' >&2
        return 1
    fi
    if ! compose "$tag" up -d api web; then
        echo 'Container update failed; restoring the last successful image.' >&2
        if [ -n "$current_tag" ]; then
            compose "$current_tag" pull api web || true
            compose "$current_tag" up -d api web || true
        fi
        return 1
    fi
    if wait_healthy "$tag"; then
        if [ -n "$current_tag" ] && [ "$current_tag" != "$tag" ]; then
            printf '%s\n' "$current_tag" > "$previous_tag_file"
        fi
        printf '%s\n' "$tag" > "$current_tag_file"
        current_tag=$tag
        echo "Habitly production image $tag is healthy at https://$domain"
        return 0
    fi
    echo 'Habitly health checks failed; attempting rollback.' >&2
    local restore_tag=$current_tag
    if [ -z "$restore_tag" ]; then
        restore_tag=$previous_tag
    fi
    if [[ "$restore_tag" =~ ^[0-9a-f]{40}$ ]]; then
        if compose "$restore_tag" pull api web && compose "$restore_tag" up -d api web && wait_healthy "$restore_tag"; then
            if [ -z "$current_tag" ]; then
                printf '%s\n' "$restore_tag" > "$current_tag_file"
                current_tag=$restore_tag
            fi
        else
            echo 'The previous Habitly image did not pass health checks.' >&2
        fi
    else
        compose "$tag" stop api web || true
    fi
    return 1
}

if [[ "$request" =~ ^[0-9a-f]{40}$ ]]; then
    if deploy_tag "$request"; then
        exit 0
    else
        exit 1
    fi
fi

case "$request" in
    rollback)
        if ! [[ "$previous_tag" =~ ^[0-9a-f]{40}$ ]]; then
            echo 'No previous successful Habitly image is available for rollback.' >&2
            exit 1
        fi
        old_current=$current_tag
        if deploy_tag "$previous_tag"; then
            printf '%s\n' "$old_current" > "$previous_tag_file"
        else
            exit 1
        fi
        ;;
    status)
        docker ps --filter label=com.docker.compose.project=habitly-prod \
            --format '{{.Names}} {{.Status}} {{.Ports}}'
        ;;
    logs)
        if [[ "$current_tag" =~ ^[0-9a-f]{40}$ ]]; then
            compose "$current_tag" logs --tail=100 api web
        else
            echo 'Habitly production has no successful deployment yet.'
            exit 1
        fi
        ;;
    restart)
        if [[ "$current_tag" =~ ^[0-9a-f]{40}$ ]]; then
            compose "$current_tag" restart api web
        else
            echo 'Habitly production has no successful deployment yet.'
            exit 1
        fi
        ;;
    retire-old-api)
        if ! [[ "$current_tag" =~ ^[0-9a-f]{40}$ ]] || ! wait_healthy "$current_tag"; then
            echo 'Refusing to stop the old API before production passes health checks.' >&2
            exit 1
        fi
        old_project=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' habitly-api-1)
        if [ "$old_project" != habitly ]; then
            echo 'The old API container identity did not match the expected Habitly project.' >&2
            exit 1
        fi
        docker stop habitly-api-1
        ;;
    *)
        echo 'Unsupported Habitly deployment request.' >&2
        exit 64
        ;;
esac
