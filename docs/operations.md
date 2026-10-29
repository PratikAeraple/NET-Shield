# NETSHIELD defensive operations

## Implementation status

| Capability | Status | Evidence |
|---|---|---|
| Python DNS/TCP/route/service diagnostics | IMPLEMENTED | `src/diagnostics.py`, unit tests |
| Owned-container inventory | IMPLEMENTED | Exact container-name and Docker-network allowlist |
| Bounded log parsing/redaction | IMPLEMENTED | Drops lines containing sensitive field labels; tests verify values are not returned |
| Docker-only DNS/TCP/timeout/TLS/service recovery scenarios | LAB VALIDATED | `lab/run.sh`, isolated internal Docker networks |
| Firewall policy/VLAN/IP/DHCP/DNS/VPN architecture | DESIGNED | `docs/architecture.md`, `policy/firewall-matrix.csv` |
| OPNsense appliance and physical VLANs | PLANNED / REQUIRES VIRTUALIZATION | No firewall VM/switch is deployed |

## Safe diagnostics

```bash
python3 src/diagnostics.py dns netshield-lab-web
python3 src/diagnostics.py tcp netshield-lab-web 8080 --timeout 2
python3 src/diagnostics.py routes
python3 src/diagnostics.py inventory netshield-lab-web
python3 src/diagnostics.py logs ./fixtures/sample-service.log
```

DNS/TCP arguments are length/range validated. The inventory command only accepts three named lab containers and confirms the exact isolated network. Log parsing caps input at 256 KiB and 1,000 lines, truncates output lines and replaces credential-bearing lines instead of returning their contents. The tools never invoke a shell or scan arbitrary hosts. The Nmap helper is optional, checks Docker membership in the exact owned lab network and has a fixed port profile; the project does not install Nmap.

## Troubleshooting method

1. Confirm the symptom and exact application hostname/port with the owner.
2. Check local interface/route state without changing it.
3. Test name resolution independently of TCP.
4. Test TCP reachability to the stated port with a strict timeout.
5. Check the service health endpoint and TLS chain/hostname separately.
6. Review bounded sanitized logs and timestamps.
7. Change one documented control in an isolated lab, observe recovery, then stop and preserve evidence.

No commands modify routes, firewall policy, DNS, DHCP or network interfaces.
