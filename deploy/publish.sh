#!/bin/sh
# Publish from a laptop: the edge config first, then the images.
#   sh deploy/publish.sh [user@host]
#
# compose.yml mounts the Caddyfile as a single file, so the container is bound
# to that one inode. Replacing the file — scp, install, or vim's default write
# — leaves the running Caddy reading the old, now-deleted inode: it reloads
# without complaint and changes nothing, which is how the domain went a day
# with no certificate while the repo said otherwise. `tee` truncates and
# rewrites in place, so the inode survives and the reload actually takes.
set -eu

host="${1:-azureuser@20.198.87.210}"
cd "$(dirname "$0")"

ssh "$host" 'sudo tee /opt/cards/Caddyfile >/dev/null' <Caddyfile
ssh "$host" 'sudo tee /opt/cards/compose.yml >/dev/null' <compose.yml

# Validate before reloading. A bad file is already on disk by this point, but
# the running config is untouched until the reload, so a typo costs the next
# deploy rather than this one's uptime.
ssh "$host" 'sudo docker exec cards-edge-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null &&
	sudo docker exec cards-edge-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile'

ssh "$host" 'sudo sh /opt/cards/update.sh'
ssh "$host" 'sudo /opt/cards/cert-check.sh truetap.in 21'
