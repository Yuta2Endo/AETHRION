# AETHRION — npm Audit Report

**Project:** AETHRION  
**Stage:** 01 — Project Foundation & Architecture  
**Date:** 2026-11-12  
**Command:** `npm audit` (npm 11.20.0, Node v26.13.0)  
**Command:** `npm audit --omit=dev` (production dependency scope)

---

## 1. Executive Summary

| Scope | Result |
|-------|--------|
| `npm audit` (all dependencies) | **17 vulnerabilities** — 3 critical, 2 high, 12 moderate, 0 low, 0 info |
| `npm audit --omit=dev` (production/runtime only) | **0 vulnerabilities** ✅ |

**All 17 vulnerabilities originate exclusively from `devDependencies`.** The production runtime bundle (`dist/`) is not affected — `npm audit --omit=dev` reports zero findings for `react`, `react-dom`, `zustand`, `three`, `framer-motion`, `@phosphor-icons/react`, `comlink`, `idb`, `@capacitor/core`, `@capacitor/android`.

---

## 2. Severity Breakdown by Package

16 distinct packages are affected (17 vulnerability entries; `tar` alone carries 12 advisories).

| Package | Severity | Direct? | Vulnerable range | Available fix |
|---------|----------|---------|------------------|---------------|
| `vitest` | **critical** | yes | `<=4.1.10` | `vitest@5.1.0` (semver-major) |
| `tinypool` | **critical** | no | `<=2.1.1` | `vitest@5.1.0` (semver-major) |
| `tar` | **critical** | no | `<=7.5.20` | `@capacitor/cli@8.6.0` (semver-major) |
| `vite` | **high** | yes | `<=6.4.3` | `vite@8.3.8` (semver-major) |
| `@capacitor/cli` | **high** | yes | `0.0.10-1.1.1 \|\| 3.0.0-alpha.0-7.4.5 \|\| 8.0.0-alpha.1-8.0.2-nightly-…` | `@capacitor/cli@8.6.0` (semver-major) |
| `@vitest/mocker` | moderate | no | `<=4.1.11` | `vitest@5.1.0` (semver-major) |
| `vite-node` | moderate | no | `<=2.2.0-beta.2` | `vitest@5.1.0` (semver-major) |
| `esbuild` | moderate | no | `<=0.24.2` | `vite@8.3.8` (semver-major) |
| `glob` | moderate | no | `9.0.0-14.0.1` | `@capacitor/cli@8.6.0` (semver-major) |
| `rimraf` | moderate | no | `4.2.0-6.1.3` | `@capacitor/cli@8.6.0` (semver-major) |
| `minimatch` | moderate | no | `7.0.0-11.0.0` | `@capacitor/cli@8.6.0` (semver-major) |
| `typescript-eslint` | moderate | yes | `<=8.72.2` | none available |
| `@typescript-eslint/eslint-plugin` | moderate | no | `6.16.0-8.72.2` | none available |
| `@typescript-eslint/parser` | moderate | no | `6.16.0-8.72.2` | none available |
| `@typescript-eslint/type-utils` | moderate | no | `6.16.0-8.72.2` | none available |
| `@typescript-eslint/typescript-estree` | moderate | no | `6.16.0-8.72.2` | none available |
| `@typescript-eslint/utils` | moderate | no | `6.16.0-8.72.2` | none available |

### Direct dependencies affected

All four are `devDependencies`: `vitest`, `vite`, `@capacitor/cli`, `typescript-eslint`.

### Dependency chains

```
vitest (direct, critical)
  ├── @vitest/mocker        (moderate)  → path traversal / arbitrary file read, code injection
  ├── tinypool              (critical)  → prototype pollution gadget → RCE
  ├── vite-node             (moderate)
  └── vite                  (high)      → esbuild, launch-editor issues

vite (direct, high)
  └── esbuild               (moderate)  → dev-server request/response exposure

@capacitor/cli (direct, high)
  └── rimraf               (moderate)
      ├── glob              (moderate)
      └── tar               (critical)  → 12 advisories: path traversal, symlink poisoning,
                                                file smuggling, DoS

typescript-eslint (direct, moderate)
  ├── @typescript-eslint/parser, /eslint-plugin, /type-utils,
  │   /typescript-estree, /utils
  └── minimatch             (moderate)  → DoS via globparts amplification
```

---

## 3. Full Advisory List (29 individual advisories)

### `vitest` — critical

| # | Severity | Advisory |
|---|----------|----------|
| 1 | critical | Vitest UI server: arbitrary file can be read and executed — [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) (`<3.2.6`) |

### `tinypool` — critical

| # | Severity | Advisory |
|---|----------|----------|
| 2 | critical | Prototype Pollution gadget in worker options leads to Remote Code Execution — [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) (`<=2.1.0`) |
| 3 | critical | Prototype Pollution Gadget to RCE in `run()` options — [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) (`<2.1.2`) |

### `tar` — critical (via `@capacitor/cli` → `rimraf` → `tar`)

| # | Severity | Advisory |
|---|----------|----------|
| 4 | high | Arbitrary File Creation/Overwrite via Hardlink Path Traversal — [GHSA-34x7-hfp2-rc4v](https://github.com/advisories/GHSA-34x7-hfp2-rc4v) (`<7.5.7`) |
| 5 | high | Arbitrary File Overwrite and Symlink Poisoning via Insufficient Path Sanitization — [GHSA-8qq5-rm4j-mr97](https://github.com/advisories/GHSA-8qq5-rm4j-mr97) (`<=7.5.2`) |
| 6 | high | Arbitrary File Read/Write via Hardlink Target Escape Through Symlink Chain in node-tar Extraction — [GHSA-83g3-92jg-28cx](https://github.com/advisories/GHSA-83g3-92jg-28cx) (`<7.5.8`) |
| 7 | high | Hardlink Path Traversal via Drive-Relative Linkpath — [GHSA-qffp-2rhf-9h96](https://github.com/advisories/GHSA-qffp-2rhf-9h96) (`<=7.5.9`) |
| 8 | high | Symlink Path Traversal via Drive-Relative Linkpath — [GHSA-9ppj-qmqm-q256](https://github.com/advisories/GHSA-9ppj-qmqm-q256) (`<=7.5.10`) |
| 9 | high | Race Condition in Path Reservations via Unicode Ligature Collisions on macOS APFS — [GHSA-r6q2-hw4h-h46w](https://github.com/advisories/GHSA-r6q2-hw4h-h46w) (`<=7.5.3`) |
| 10 | moderate | PAX size override to intermediary GNU long-name/long-link headers → file smuggling — [GHSA-vmf3-w455-68vh](https://github.com/advisories/GHSA-vmf3-w455-68vh) (`<=7.5.15`) |
| 11 | moderate | Process crash via PAX numeric path type confusion — [GHSA-w8wr-v893-vjvp](https://github.com/advisories/GHSA-w8wr-v893-vjvp) (`<=7.5.17`) |
| 12 | critical | Decompression/parse DoS via unlimited input — [GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw) (`<=7.5.18`) |
| 13 | high | Negative tar entry size causes infinite loop in archive replace — [GHSA-8x88-c5mf-7j5w](https://github.com/advisories/GHSA-8x88-c5mf-7j5w) (`<=7.5.17`) |
| 14 | moderate | Uncaught Exception DoS via NUL byte in PAX path/linkpath records — [GHSA-gvwx-54wh-qm9j](https://github.com/advisories/GHSA-gvwx-54wh-qm9j) (`<=7.5.16`) |
| 15 | high | Uncontrolled recursion in mapHas/filesFilter → uncatchable stack-overflow DoS — [GHSA-r292-9mhp-454m](https://github.com/advisories/GHSA-r292-9mhp-454m) (`<=7.5.20`) |

### `vite` — high

| # | Severity | Advisory |
|---|----------|----------|
| 16 | moderate | Path Traversal in Optimized Deps `.map` Handling — [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) (`<=6.4.1`) |
| 17 | moderate | `launch-editor`: NTLMv2 hash disclosure via UNC path handling on Windows — [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) (`<=6.4.2`) |
| 18 | moderate | `launch-editor`: `escapeCmdArgs()` omits `%` escaping on Windows — [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) (`<=6.4.3`) |
| 19 | moderate | `launch-editor`: Editor CLI flag misinterpretation → arbitrary command execution for some editors — [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) (`<=6.4.3`) |
| 20 | high | `launch-editor`: `fs.existsSync()` existence check can be bypassed on Windows — [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) (`<=6.4.3`) |
| 21 | low | Cross origin script execution through Vite custom middleware — [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) (`<=6.4.3`) |
| 22 | moderate | Files outside `server.fs.allow` could be served when project paths match system paths (non-Windows) — [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) (`<=6.4.3`) |
| 23 | moderate | `server.fs.deny` bypass on Windows alternate paths — [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) (`<=6.4.2`) |

### `@vitest/mocker` — moderate

| # | Severity | Advisory |
|---|----------|----------|
| 24 | moderate | Path Traversal / Arbitrary File Read via Redirect Mock — [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) (`>=2.1.0 <4.1.11`) |
| 25 | moderate | Code injection via unauthenticated manual mock registration — [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) (`>=2.1.0-beta.7 <4.1.12`) |

### `esbuild` — moderate

| # | Severity | Advisory |
|---|----------|----------|
| 26 | moderate | Any website can send requests to the dev server and read the response — [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) (`<=0.24.2`) |

### `glob` — moderate

| # | Severity | Advisory |
|---|----------|----------|
| 27 | moderate | AbortSignal cancellation bypass allows post-timeout filesystem traversal — [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) (`>=9.0.0 <=14.0.1`) |

### `minimatch` — moderate

| # | Severity | Advisory |
|---|----------|----------|
| 28 | moderate | Potential denial of service via globparts amplification — [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) (`>=7.0.0 <11.0.1`) |

### `typescript-eslint` chain — moderate

| # | Severity | Advisory |
|---|----------|----------|
| 29 | moderate | Inherited from `minimatch` via `@typescript-eslint/typescript-estree`, `/parser`, `/eslint-plugin`, `/type-utils`, `/utils` | 

---

## 4. Remediation Analysis

### Why `npm audit fix` alone does nothing

Every available fix requires a **semver-major** upgrade, so the non-breaking `npm audit fix` command has no eligible action. npm itself reports:

```
To address issues that require attention, run `npm audit fix`
To address all issues (including breaking changes), run `npm audit fix --force`
```

### Available upgrade paths

| Path | Packages | Notes |
|------|----------|-------|
| A | `vitest@5.1.0` | Resolves `vitest`, `tinypool`, `@vitest/mocker`, `vite-node` (critical + moderate). Major: config/API changes, migration needed. |
| B | `vite@8.3.8` | Resolves `vite` and `esbuild` (high + moderate). Major: requires Vitest 5 / plugin-react 5 alignment. |
| C | `@capacitor/cli@8.6.0` | Resolves `tar`, `rimraf`, `glob`, `minimatch` (critical + moderate). Major: Capacitor 8 requires `@capacitor/core` 8 and a Node/Android toolchain check. |

`typescript-eslint` has **no fix available** — the `minimatch` advisory is inherited and cannot be resolved without a future release of the `@typescript-eslint` packages.

### Risk assessment

- **Runtime impact: none.** None of the affected packages ship in `dist/`. They are build-time, test-time and CLI tools.
- **Dev-workstation impact: low but real.** The `vite` / `esbuild` advisories affect the **dev server** only (path traversal, `launch-editor` command execution on Windows, dev-server response exposure). Do not expose the Vite dev server (`--host`) to an untrusted network.
- **`tar` impact: low.** `tar` is pulled in by `rimraf` inside `@capacitor/cli` and is exercised when Capacitor copies/syncs the web build. Advisories require maliciously crafted tar archives, not normal operation.
- **`tinypool` / `vitest` impact: low.** Prototype pollution requires untrusted input passed into worker options. Vitest UI is not enabled in this project.
- **Supply-chain note.** `npm audit` advisories are only exploitable if the affected code path runs against attacker-controlled input.

### Decision for Stage 01

Upgrades A, B and C are all breaking and interdependent (Vite 8 + Vitest 5 + Capacitor CLI 8). Performing them inside Stage 01 would change the verified toolchain after validation and risk destabilising the greenfield foundation.

**Decision:** keep the Stage 01 toolchain as validated and record the upgrade paths as a dedicated maintenance task, to be executed as the first activity of a future stage with full re-validation (typecheck, lint, tests, build, dev server).

---

## 5. Commands to Reproduce

```bash
npm audit                      # full tree
npm audit --omit=dev           # production runtime only → 0 vulnerabilities
npm audit --json > audit.json  # machine-readable detail
```
