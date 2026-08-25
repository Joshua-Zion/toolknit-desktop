# ToolKnit Code Signing Policy

## Current status

ToolKnit has applied for the SignPath Foundation open-source code-signing program. This policy becomes operational only after that application is approved and the signing workflow is integrated.

ToolKnit Desktop 2.1.1 is **not** signed through SignPath. Its release integrity is verified with the SHA-256 checksum published alongside the installer.

## Signing service and scope

After approval, official Windows release artifacts will be built from the public [ToolKnit repository](https://github.com/ZihangDong/toolknit-desktop) by GitHub Actions and submitted to [SignPath.io](https://signpath.io/) under the [SignPath Foundation](https://signpath.org/) open-source program.

SignPath Foundation will sponsor the code-signing certificate, and SignPath.io will perform signing. Private signing keys will remain in the signing service and will not be stored in this repository, GitHub Actions secrets, or on a maintainer device.

Only release artifacts that meet all of the following conditions may be submitted:

- The release tag is reachable from the protected `main` branch.
- Required build, test, security, and version checks have passed.
- The artifact was produced by the repository's documented GitHub Actions workflow.
- The signing request can be traced to its source commit and workflow run.

## Project roles

| Role | Assigned account | Responsibility |
| --- | --- | --- |
| Committer | [ZihangDong](https://github.com/ZihangDong) | Maintains source code, build definitions, tests, and release metadata. |
| Reviewer | [ZihangDong](https://github.com/ZihangDong) | Reviews the release diff, dependency and security results, and required CI checks before a signing request is created. |
| Approver | [ZihangDong](https://github.com/ZihangDong) | Confirms artifact provenance and explicitly approves or rejects each release signing request. |

Signing approval is never automatic. A failed, untraceable, locally built, or otherwise non-compliant artifact must be rejected.

## Release handling

Once the SignPath workflow is active, signed installers will be published only after the signing result and artifact identity have been verified. Release notes will state whether an artifact is signed, and SHA-256 checksums will continue to be published.

## Privacy and security

Code signing processes release artifacts and build metadata only. ToolKnit user files, tool inputs, passwords, API keys, and application usage data are never part of a signing request.

- ToolKnit privacy statement: [https://toolknit.com/privacy.html](https://toolknit.com/privacy.html)
- SignPath privacy policy: [https://signpath.io/privacy-policy](https://signpath.io/privacy-policy)
- Security reporting: [SECURITY.md](toolknit-desktop/SECURITY.md)

Suspected certificate misuse, compromised release infrastructure, or unauthorized signed artifacts must be reported immediately through the security contact documented in `SECURITY.md`. Affected releases will be withdrawn while the incident is investigated with SignPath Foundation and SignPath.io.
