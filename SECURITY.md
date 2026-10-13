# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through GitHub: on this repository's **Security** tab,
choose **Report a vulnerability**
(<https://github.com/ctoepfer/carboy/security/advisories/new>). Include what
you found, how to reproduce it, and what an attacker could do with it.

You should get an acknowledgement within 7 days. Please give us a reasonable
time to fix the problem before you disclose it publicly; we will agree a
date with you and credit you if you wish.

## Supported versions

There is no released version yet. The repository holds planning documents
and throwaway spike code (`spikes/`), which is not supported and never
shipped. This section will list supported releases from the first public
release (Phase 6).

## Scope

In scope: this repository's code, data formats, and contracts. That
includes how the application handles imported files, language packs and
themes, the local AI connector, device pairing, and stored secrets.

The optional hosted service is maintained separately; problems you find in
it can be reported through the same channel and will be passed on.

Out of scope: vulnerabilities in third-party dependencies with no effect on
this project (please report those upstream), and social-engineering or
physical attacks.

## Hardware safety

If you find a way the application could operate brewing hardware unsafely
(for example heating without liquid, or acting without the user's
confirmation), report it here as a security issue, even before hardware
support is released.
