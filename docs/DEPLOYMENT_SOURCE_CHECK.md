# Deployment source check

Checked on 8 September 2026 against local HEAD `30b50fc` and the locally cached `origin/main` reference `a10e15c` (not freshly fetched).

## Findings

- `allo-sante-tchad 3/` was introduced by commit `c636410` on 25 August 2026. Its path history contains only that initial upload.
- `app/` was introduced by commit `1cdb340` the same day. Subsequent application maintenance and security fixes are in this directory.
- The locally cached `origin/main` contains five commits beyond the working branch, all changing files within `app/`. These include reference caching and authentication anti-bot changes. They have not been merged or reviewed as part of this check.
- Both directories contain a Netlify configuration with relative build/publish/functions paths. Neither establishes which directory the live site's Netlify settings select.
- No root Netlify configuration or local Netlify site linkage was found. No authenticated Netlify connector is available in this session.
- `app/index.html` names `https://afiyatchad.com/` as its canonical URL. The browsing tool could not open it, so no deployed artifact comparison was possible.

## Resolution (9 September 2026)

`curl -I https://afiyatchad.com/` was compared against both `netlify.toml` files instead of the Netlify dashboard. The live response headers are:

```
content-security-policy: default-src 'self'; ...; connect-src 'self' https://ffpxbefenbnhkicstyph.supabase.co; ...
strict-transport-security: max-age=31536000; includeSubDomains
x-frame-options: DENY
permissions-policy: geolocation=(self), microphone=(self), camera=(self), payment=(), usb=(), serial=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=(), midi=(), display-capture=()
cross-origin-opener-policy: same-origin
server: Netlify
```

This set — the CSP, the HSTS header, `X-Frame-Options: DENY`, the long `Permissions-Policy`, and `Cross-Origin-Opener-Policy` — exists only in `app/netlify.toml`. `allo-sante-tchad 3/netlify.toml` has no CSP, no HSTS, `X-Frame-Options: SAMEORIGIN`, and a short `Permissions-Policy`. The CSP's `connect-src` also names the project's actual Supabase host (`ffpxbefenbnhkicstyph.supabase.co`), ruling out a third, undiscovered source.

**Conclusion: the live Netlify site builds from `app/`.** `allo-sante-tchad 3/` is confirmed to be an inert, superseded snapshot — not a deployment source, not a dependency of anything live.

## Conclusion

`app/` is the maintained source and is confirmed as the live deployment root. Git maintenance history plus the live header comparison above are now both evidence, not just the former.

`allo-sante-tchad 3/` can be removed with its history preserved in Git; a root README should then name `app/` as the sole application. Deployment settings themselves were not touched as part of this check — only their observable effect (response headers) was read.
