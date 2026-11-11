# AETHRION — Security Audit Report

**Project:** AETHRION  
**Stage:** 04 — Technology & Production Engines  
**Last reviewed:** 2026-11-12  
**Commands:** `npm audit` · `npm audit --omit=dev` (npm 11.20.0, Node v26.13.0)

---

## 1. Executive Summary

| Scope | Before | **Now** |
|-------|--------|---------|
| `npm audit` (full tree) | 17 vulnerabilities (3 critical, 2 high, 12 moderate) | **0 vulnerabilities** ✅ |
| `npm audit --omit=dev` (production runtime) | 0 vulnerabilities | **0 vulnerabilities** ✅ |
| Installed packages | 387 | 326 |

The previously reported development-dependency advisories have been **resolved**. The Stage 01
toolchain (Vite 5, Vitest 2, Capacitor 6, minimatch 10) was migrated to the current major
versions, and the last remaining `minimatch` advisory was closed with an npm `overrides` entry.

**The production runtime was never affected** — it has reported 0 vulnerabilities throughout.

---

## 2. What Was Upgraded

| Package | Before | After | Reason |
|---------|--------|-------|--------|
| `vite` | ^5.4.11 | **^8.3.8** | `esbuild` dev-server advisory; also moves the bundler to Rolldown |
| `vitest` | ^2.1.4 | **^5.1.0** | `vitest` arbitrary-file-read advisory and the `tinypool` prototype-pollution → RCE advisories |
| `@vitejs/plugin-react` | ^4.3.3 | **^6.3.0** | peer requirement of Vite 8 |
| `@capacitor/cli` | ^6.1.0 | **^8.6.0** | the `tar` / `glob` / `rimraf` advisory chain (critical `tar` advisories) |
| `@capacitor/core` | ^6.1.0 | **^8.6.0** | peer requirement of Capacitor CLI 8 |
| `@capacitor/android` | ^6.1.0 | **^8.6.0** | matching the Capacitor platform version |
| `minimatch` (transitive) | 10.2.6 | **11.0.8** (via `overrides`) | the DoS-via-globparts-amplification advisory, inherited through `typescript-eslint` |

`typescript-eslint` stays at **8.72.2** — it is already the latest published version and has no
fix of its own; the inherited `minimatch` advisory was closed with an npm override instead.

### The `overrides` entry

```json
"overrides": {
  "minimatch": "^11.0.8"
}
```

`@typescript-eslint/typescript-estree` declares `minimatch@10.x`, which falls inside the
vulnerable range `7.0.0 - 11.0.0`. The override forces the patched `11.0.8` everywhere. The
`minimatch` API used by typescript-eslint (`minimatch(path, pattern, options)`) is unchanged,
which is verified by the ESLint run over the whole source tree and the 19 test files.

---

## 3. Migration Notes

The upgrade required three code changes — all of them verified by the full validation run:

1. **`src/tests/setup.ts`** — the import changed from `@testing-library/jest-dom` to
   `@testing-library/jest-dom/vitest`. The plain entry point only augments the *Jest* types;
   the `/vitest` entry point registers the matchers at runtime **and** augments the Vitest
   `expect` types. Without it, every `toBeInTheDocument()` lost its type.
2. **`vite.config.ts` / `vitest.config.ts`** — `__dirname` was replaced by `import.meta.dirname`.
   The native config loader of Vite 8 does not provide `__dirname` and warns about it.
3. **`vite.config.ts`** — `manualChunks` had to be rewritten as a **function**. Rolldown (the
   bundler behind Vite 8) rejects the object form.

A **fourth** issue was found during the migration and fixed: `MainNavigation.tsx` used the
`as any` type assertion inside a JSX attribute list. JSX does not read `as any` as a type
assertion there — it parses it as two boolean attributes, `as={true}` and `any={true}`, which
React then forwarded to the SVG element of every Phosphor icon. The navigation now uses the
`Icon` type exported by `@phosphor-icons/react`, so no assertion is needed at all.

### Bundle effect

The vendor splitting survived the migration and the Rolldown bundler produced noticeably
smaller chunks:

| Chunk | Before (Vite 5) | After (Vite 8) |
|-------|------------------|-----------------|
| Application chunk | 449.78 kB | **119.94 kB** |
| react | 4.16 kB | 317.28 kB |
| motion | 120.51 kB | 114.90 kB |
| state | 3.62 kB | 5.53 kB |

The application chunk — the part that changes with every release — shrank by 73 %.

---

## 4. Remaining Findings

**None.** `npm audit` reports 0 vulnerabilities and `npm audit --omit=dev` reports 0.

---

## 5. Standing Rules

- Do not run `npm audit fix --force` blindly: it performs semver-major upgrades of the whole
  toolchain and requires a full re-validation (typecheck, lint, tests, build, dev server).
- Keep the production dependency set free of advisories — `npm audit --omit=dev` must stay at 0.
- Re-run the full validation after every dependency change; the migration above touched the
  test setup, both build configs and a component.
