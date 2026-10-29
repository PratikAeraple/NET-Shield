# NETSHIELD isolated failure lab

`./run.sh` starts only short-lived, resource-limited Node containers on two Docker `internal: true` networks. The probe has no published port or route to the second network. A temporary self-signed, wrong-host TLS certificate is generated under an ignored directory, mounted read-only, and removed by the exit trap. The script refuses to overwrite a pre-existing `.runtime` directory.

The repeatable run validates:

- internal Docker DNS and HTTP service identity;
- NXDOMAIN-style Docker DNS failure and a name in a separate network;
- a closed TCP port;
- application response timeout;
- TLS hostname mismatch rejected by Node's normal certificate validation;
- actual service stop → failed connection → start → successful health response.

This validates Docker network isolation and application diagnostics only. It does not claim an OPNsense firewall rule, hardware VLAN, DHCP server, VPN, routed VLAN failure or physical packet capture. No Nmap scan is required by this lab. The optional `scripts/nmap-owned-lab.sh` accepts only the two named lab containers after verifying membership on the exact internal lab network and uses a fixed two-port profile; it never accepts an arbitrary target or caller-supplied scan arguments.

Run only on a host with the pinned Node image already available or where Docker is permitted to pull it. Cleanup removes only the Compose project `netshield-lab`, its containers and two networks created by this fixture; it never uses `docker system prune` or deletes volumes.
