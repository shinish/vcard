#!/bin/sh
# Does the live site still present a certificate with time left on it?
#
# This does not renew anything and must not try to: Caddy renews on its own,
# about thirty days out, and re-issuing on a schedule only spends Let's
# Encrypt's duplicate-certificate allowance. This watches the endpoint rather
# than Caddy's intent, which is how it also catches the failure that actually
# happened here — a Caddyfile that never reached the container, so the domain
# served nothing while a certificate for an older name sat in the volume.
#
# `-checkend` is openssl's own comparison, so there is no date arithmetic to
# get wrong and nothing that behaves differently on a Mac than on the host.
set -eu

host="${1:-truetap.in}"
days="${2:-21}"

cert=$(echo | openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null) || true
if ! printf '%s' "$cert" | grep -q 'BEGIN CERTIFICATE'; then
	echo "$host served no certificate at all" >&2
	exit 1
fi

printf '%s' "$cert" | openssl x509 -noout -subject -enddate

if printf '%s' "$cert" | openssl x509 -noout -checkend "$((days * 86400))" >/dev/null; then
	exit 0
fi
echo "under $days days left: Caddy has not renewed. docker logs cards-edge-1" >&2
exit 1
