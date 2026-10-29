#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if docker info >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo -n /usr/bin/docker info >/dev/null 2>&1; then
  DOCKER=(sudo -n /usr/bin/docker)
else
  echo 'No authorized Docker CLI is available; no lab containers were started.' >&2
  exit 3
fi
runtime="$PWD/.runtime"
if [[ -e "$runtime" ]]; then
  echo 'Refusing to replace an existing lab runtime directory.' >&2
  exit 2
fi
cleanup() {
  "${DOCKER[@]}" compose -p netshield-lab -f compose.yaml down --remove-orphans >/dev/null 2>&1 || true
  rm -rf -- "$runtime"
}
trap cleanup EXIT INT TERM
wait_for_web() {
  for attempt in $(seq 1 30); do
    if "${DOCKER[@]}" compose -p netshield-lab -f compose.yaml run --rm --no-deps netshield-lab-probe node -e "fetch('http://netshield-lab-web:8080/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo 'Lab web identity did not become reachable.' >&2
  "${DOCKER[@]}" logs --tail 30 netshield-lab-web netshield-lab-tls >&2 || true
  return 1
}
umask 077
mkdir -p "$runtime"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=wrong.lab.invalid' \
  -addext 'subjectAltName=DNS:wrong.lab.invalid' -keyout "$runtime/lab.key" -out "$runtime/lab.crt" >/dev/null 2>&1
chmod 600 "$runtime/lab.key" "$runtime/lab.crt"
"${DOCKER[@]}" compose -p netshield-lab -f compose.yaml up -d netshield-lab-web netshield-lab-isolated-target netshield-lab-tls
wait_for_web
"${DOCKER[@]}" compose -p netshield-lab -f compose.yaml run --rm --no-deps netshield-lab-probe
web_ip=$("${DOCKER[@]}" inspect --format '{{range $name, $net := .NetworkSettings.Networks}}{{if eq $name "brutehost-netshield-lab"}}{{$net.IPAddress}}{{end}}{{end}}' netshield-lab-web)
if [[ -z "$web_ip" ]]; then echo 'Could not identify the disposable lab container address.' >&2; exit 1; fi
"${DOCKER[@]}" compose -p netshield-lab -f compose.yaml stop netshield-lab-web
NETSHIELD_STOPPED_WEB_IP="$web_ip" "${DOCKER[@]}" compose -p netshield-lab -f compose.yaml run --rm --no-deps -e "NETSHIELD_STOPPED_WEB_IP=$web_ip" netshield-lab-probe node /lab/verify.mjs outage
"${DOCKER[@]}" compose -p netshield-lab -f compose.yaml start netshield-lab-web
for attempt in $(seq 1 30); do
  if "${DOCKER[@]}" compose -p netshield-lab -f compose.yaml run --rm --no-deps netshield-lab-probe node -e "fetch('http://netshield-lab-web:8080/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then break; fi
  sleep 1
done
"${DOCKER[@]}" compose -p netshield-lab -f compose.yaml run --rm --no-deps netshield-lab-probe
