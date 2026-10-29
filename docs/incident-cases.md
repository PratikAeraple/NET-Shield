# Controlled lab incident notes

These are fixture-generated outcomes from the repository's disposable Docker lab, not production incidents.

## NS-LAB-01 — service unavailable and recovery

- **Evidence:** the `netshield-lab-web` container was stopped; a probe from the same internal network could not connect to its previously observed address; container start restored the identity response.
- **Detection:** bounded TCP check failed during the stop window and succeeded after restart.
- **Status:** LAB VALIDATED by `lab/run.sh`.
- **Scope:** disposable container only; no production service or data.

## NS-LAB-02 — name and segmentation failures

- **Evidence:** Docker DNS lookup for a nonexistent service and a service attached only to the separate `brutehost-netshield-isolated` network failed from the probe network; the expected same-network service resolved.
- **Status:** LAB VALIDATED. This demonstrates Docker network namespace/DNS isolation, not an OPNsense ACL or routed VLAN.

## NS-LAB-03 — port, timeout and TLS identity

- **Evidence:** port 8081 on the lab web fixture refused/timed out; `/slow` exceeded a 100 ms client deadline; a trusted self-signed certificate with a deliberately wrong SAN was rejected with Node's hostname-validation error.
- **Status:** LAB VALIDATED. Temporary certificate and private key are generated at runtime and removed on exit; none are committed.
