#!/usr/bin/env bash
# Writes render.env (gitignored) with the Aiven settings Render needs, inlining
# the certificate files as single-line PEM ("\n" escapes). Upload it in the
# Render dashboard: Environment -> Add from .env. Never commit render.env.
set -euo pipefail
cd "$(dirname "$0")/.."

get() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
pem() { awk 'BEGIN{ORS="\\n"} {print}' "$1"; }

{
  echo "AIVEN_PG_URI=$(get AIVEN_PG_URI)"
  echo "AIVEN_KAFKA_BROKERS=$(get AIVEN_KAFKA_BROKERS)"
  echo "AIVEN_OPENSEARCH_URI=$(get AIVEN_OPENSEARCH_URI)"
  echo "AIVEN_CA_CERT=$(pem .certs/ca.pem)"
  echo "AIVEN_KAFKA_ACCESS_CERT=$(pem .certs/service.cert)"
  echo "AIVEN_KAFKA_ACCESS_KEY=$(pem .certs/service.key)"
} > render.env
chmod 600 render.env
echo "Wrote render.env ($(wc -l < render.env) variables). Upload it in Render, then delete it."
