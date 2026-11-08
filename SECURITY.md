# Security policy

## Supported versions

Version `0.0.1` is the first planned public package release. It is
not published yet. After release, the latest published version is the
primary target for security fixes; older versions do not have a
guaranteed maintenance window.

## Reporting a vulnerability

**Do not disclose credentials, exploit details or sensitive
proofs of concept in public GitHub issues, pull requests or discussions.**

When the public repository offers GitHub's **Report a vulnerability**
option under its Security tab, use it to submit a private report.
If private vulnerability reporting is not enabled, open a
**non-sensitive** issue titled "Request private security reporting"
without including the vulnerability itself; the maintainer can then
establish a secure channel before receiving details.

Please include the affected version, impact, reproduction steps and
possible mitigations **only through the private channel**.
The maintainer will investigate and coordinate disclosure where
appropriate. No fixed response-time or bug-bounty commitment is made.

## Scope

Relevant examples include unsafe handling of authored strings,
unexpected code/network execution, unbounded computation, browser
injection, leaks of source/content, and malicious package or build
behavior. Ordinary API usage questions belong in [SUPPORT.md](SUPPORT.md).

This policy does not replace GitHub's own abuse reporting process.
