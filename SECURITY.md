# Security policy

Throughline processes authored artifacts and Markdown, so input validation and clear trust boundaries matter. The pure compiler does not execute the described code or contact a model provider. The Node host still accesses local files under a configured trusted root; applications remain responsible for securely handling the content they pass to it.

## Supported releases

Security fixes normally target the **latest published npm release** of `@0xbuff/throughline`. Earlier releases may not receive backports, particularly before version 1.0. A source branch or release candidate does **not** become a supported npm version merely because its `package.json` has changed.

Check the installed version with `npm ls @0xbuff/throughline` and the registry's published version with `npm view @0xbuff/throughline version`.

## Report a vulnerability privately

Please do not share active exploit details, credentials, private files, or sensitive proof-of-concept material in public GitHub issues, PRs or discussions.

Use the repository's [Security page](https://github.com/0xbuffdev/throughline/security) and choose **Report a vulnerability** if private vulnerability reporting is enabled. If that option is unavailable, open an issue requesting a private reporting route **without including technical exploit details**. Maintainers will provide an appropriate channel when available.

A useful private report states the affected release or commit, impact, reproducing steps, expected and actual behavior, and any suggested mitigation. Do not include secrets unless the secure channel specifically supports them. We investigate as capacity permits, without guaranteed response or bounty.

Relevant reports include unsafe Markdown/MDX handling, code or network execution, malicious file/path traversal, unbounded resource use, sensitive-information disclosure, browser injection, and supply-chain or release provenance failures.

For non-security bugs and usage questions, follow [Contributing](CONTRIBUTING.md).
