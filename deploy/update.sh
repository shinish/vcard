#!/bin/sh
# Pull the new images and swap the containers over. Run on the host:
#   sudo sh /opt/cards/update.sh
#
# The box has under a gigabyte of memory, and unpacking two image layers at
# once was enough to take it down mid-deploy — so there is a swapfile to fall
# back on and the pulls run one at a time.
set -eu
cd /opt/cards

if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon --show | grep -q /swapfile || swapon /swapfile

COMPOSE_PARALLEL_LIMIT=1 docker compose pull -q
docker compose up -d
docker image prune -f >/dev/null

# Give the front end a moment, then say whether it actually came back.
i=0
while [ $i -lt 30 ]; do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/login || true)
  [ "$code" = "200" ] && break
  i=$((i + 1))
  sleep 2
done
docker compose ps --format '{{.Service}} {{.Status}}'
free -m | head -3
echo "login page: ${code:-no answer}"
[ "${code:-}" = "200" ]
