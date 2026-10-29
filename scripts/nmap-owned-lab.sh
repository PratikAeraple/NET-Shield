#!/usr/bin/env bash
set -euo pipefail

target_name=${1:-}
case "$target_name" in
  netshield-lab-web|netshield-lab-tls) ;;
  *) echo "Refusing: target must be a named NETSHIELD disposable lab container." >&2; exit 2 ;;
esac
if ! command -v nmap >/dev/null 2>&1; then
  echo "nmap is not installed; no scan performed." >&2
  exit 3
fi
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo -n /usr/bin/docker info >/dev/null 2>&1; then
  DOCKER=(sudo -n /usr/bin/docker)
else
  echo "Docker CLI is unavailable; no scan performed." >&2
  exit 3
fi
networks=$("${DOCKER[@]}" inspect --format '{{json .NetworkSettings.Networks}}' "$target_name")
if ! python3 -c 'import json,sys; d=json.loads(sys.argv[1]); sys.exit(0 if "brutehost-netshield-lab" in d else 1)' "$networks"; then
  echo "Refusing: target is not attached to the exact isolated brutehost-netshield-lab network." >&2
  exit 2
fi
target_ip=$("${DOCKER[@]}" inspect --format '{{range $name, $net := .NetworkSettings.Networks}}{{if eq $name "brutehost-netshield-lab"}}{{$net.IPAddress}}{{end}}{{end}}' "$target_name")
if [[ -z "$target_ip" ]]; then
  echo "Refusing: no address on the isolated lab network." >&2
  exit 2
fi
# Fixed conservative scan profile; caller cannot append arbitrary Nmap arguments.
exec nmap -n -Pn --max-retries 1 --host-timeout 10s -p 8080,8443 "$target_ip"
