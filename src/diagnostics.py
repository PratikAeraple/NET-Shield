#!/usr/bin/env python3
"""Bounded, read-only network diagnostics for operator-supplied owned lab targets."""
import argparse
import ipaddress
import json
import re
import socket
import subprocess
import time
from pathlib import Path

MAX_TIMEOUT = 5.0
MAX_LOG_BYTES = 256_000
LAB_NETWORK = "brutehost-netshield-lab"
ALLOWED_LAB_NAMES = {"netshield-lab-web", "netshield-lab-tls", "netshield-lab-isolated-target", "netshield-lab-probe"}
SAFE_LOG_FIELDS = re.compile(r"(?i)(password|token|secret|authorization|cookie|api[_-]?key)")


def bounded_host(value):
    if not isinstance(value, str) or not value or len(value) > 253 or any(c.isspace() for c in value):
        raise ValueError("invalid host")
    try:
        address = ipaddress.ip_address(value)
        if not address.is_loopback:
            raise ValueError("only loopback IP literals are allowed by the default profile")
        return str(address)
    except ValueError:
        if "." in value and value not in ALLOWED_LAB_NAMES:
            raise ValueError("DNS targets must be an exact owned lab service name")
        if value in ALLOWED_LAB_NAMES:
            return value
        if value not in {"localhost"}:
            raise ValueError("target is outside the default localhost/owned-lab allowlist")
        return value


def bounded_port(value):
    port = int(value)
    if not 1 <= port <= 65535:
        raise ValueError("port must be 1..65535")
    return port


def resolve_host(host):
    host = bounded_host(host)
    started = time.monotonic()
    try:
        results = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
        addresses = sorted({row[4][0] for row in results})
        return {"status": "resolved", "host": host, "addresses": addresses,
                "elapsed_ms": round((time.monotonic() - started) * 1000, 2)}
    except socket.gaierror as exc:
        return {"status": "failed", "host": host, "error": exc.__class__.__name__,
                "elapsed_ms": round((time.monotonic() - started) * 1000, 2)}


def tcp_check(host, port, timeout=2.0):
    host, port = bounded_host(host), bounded_port(port)
    timeout = min(MAX_TIMEOUT, max(0.1, float(timeout)))
    started = time.monotonic()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return {"status": "connected", "host": host, "port": port,
                    "elapsed_ms": round((time.monotonic() - started) * 1000, 2)}
    except OSError as exc:
        return {"status": "failed", "host": host, "port": port, "error": exc.__class__.__name__,
                "elapsed_ms": round((time.monotonic() - started) * 1000, 2)}


def route_snapshot():
    # Read-only, fixed executable and argument vector. Never invokes a shell.
    path = "/proc/net/route"
    rows = []
    try:
        lines = Path(path).read_text().splitlines()[1:65]
        for line in lines:
            fields = line.split()
            if len(fields) >= 8:
                rows.append({"interface": fields[0], "destination_hex": fields[1],
                             "gateway_hex": fields[2], "mask_hex": fields[7]})
        return {"status": "available", "routes": rows}
    except OSError as exc:
        return {"status": "unavailable", "error": exc.__class__.__name__}


def owned_container_inventory(container, runner=subprocess.run):
    if not re.fullmatch(r"netshield-lab-(?:dns|web|probe)", container):
        raise ValueError("container name is outside the explicit NETSHIELD lab allowlist")
    result = runner(["docker", "inspect", "--format", "{{json .NetworkSettings.Networks}}", container],
                    capture_output=True, text=True, timeout=3, check=False)
    if result.returncode:
        return {"status": "not_found", "container": container}
    try:
        networks = json.loads(result.stdout)
    except json.JSONDecodeError:
        return {"status": "invalid_docker_response", "container": container}
    if LAB_NETWORK not in networks:
        return {"status": "outside_lab_network", "container": container}
    return {"status": "present", "container": container, "networks": [LAB_NETWORK]}


def sanitize_log(path):
    p = Path(path)
    if p.is_symlink() or not p.is_file() or p.stat().st_size > MAX_LOG_BYTES:
        raise ValueError("log must be a regular, bounded file")
    rows = []
    for line in p.read_text(errors="replace").splitlines()[:1000]:
        # Drop full lines containing credential-bearing field names; never echo values.
        if SAFE_LOG_FIELDS.search(line):
            rows.append("[REDACTED: sensitive field detected]")
        else:
            rows.append(line[:500])
    return {"status": "parsed", "lines": len(rows), "entries": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="command", required=True)
    dns = subs.add_parser("dns"); dns.add_argument("host", type=bounded_host)
    tcp = subs.add_parser("tcp"); tcp.add_argument("host", type=bounded_host); tcp.add_argument("port", type=bounded_port); tcp.add_argument("--timeout", type=float, default=2)
    health = subs.add_parser("health"); health.add_argument("host", type=bounded_host); health.add_argument("port", type=bounded_port); health.add_argument("--timeout", type=float, default=2)
    inv = subs.add_parser("inventory"); inv.add_argument("container", choices=["netshield-lab-web", "netshield-lab-tls", "netshield-lab-isolated-target", "netshield-lab-probe"])
    logs = subs.add_parser("logs"); logs.add_argument("path")
    subs.add_parser("routes")
    args = parser.parse_args()
    if args.command == "dns":
        result = resolve_host(args.host)
    elif args.command == "tcp":
        result = tcp_check(args.host, args.port, args.timeout)
    elif args.command == "health":
        result = {"transport": tcp_check(args.host, args.port, args.timeout), "route_snapshot": route_snapshot()}
    elif args.command == "inventory":
        result = owned_container_inventory(args.container)
    elif args.command == "logs":
        result = sanitize_log(args.path)
    else:
        result = route_snapshot()
    print(json.dumps(result, sort_keys=True))
    return 0 if result.get("status") not in {"failed", "not_found", "outside_lab_network", "unavailable"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
