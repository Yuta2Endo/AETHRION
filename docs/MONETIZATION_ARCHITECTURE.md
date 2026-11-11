# AETHRION — Monetization Architecture (Stage 10)

**Owner-selected providers (preserved):**
- **Advertising:** Yandex Mobile Ads (Android SDK)
- **Purchases:** Robokassa

**Principles:** server-authoritative payments, verified ad rewards, policy-compliant distribution gating, no secrets in client, no fabricated IDs/credentials.

## 1. Modules

| Area | Location | Responsibility |
|------|----------|----------------|
| Ads types/service/bridge | `src/monetization/ads/` | Rewarded lifecycle states, config validation, idempotent reward granting after verified completion, Capacitor `YandexAds` plugin bridge |
| Payments client/types | `src/monetization/payments/` | Typed payment states/transitions, policy-gated backend API client (create/status), no secrets, no client-trusted success |
| Distribution policy | `src/monetization/policy/` | Safe mode gating (`direct_distribution`, `web_distribution`, `google_play_standard_policy`, `google_play_eea_alternative_billing`) |
| Reference server payments | `server/src/payments/` | Robokassa signature gen/verify, notification validation, idempotent ResultURL processing and entitlement granting logic (reference, not deployed) |

## 2. Yandex Ads (rewarded-first)

- **Flow:** user explicitly initiates → initialize/load → show → **grant only on verified completion callback** (SDK/plugin token). Service guards against duplicate/in-flight requests and duplicate completion tokens.
- **Modes:** development uses configured/demo test placement IDs (official Yandex demo IDs where applicable, not fabricated as production). Production requires real configured unit ID and fails safely if missing.
- **Failures:** load/show/init/inventory/lifecycle failures surfaced as states/errors; gameplay not blocked.
- **Native boundary:** `React` → `YandexAds` Capacitor plugin → Kotlin + Yandex Mobile Ads SDK (device integration pending).

## 3. Robokassa payments (server-authoritative)

- **Flow:** authenticated client requests product → backend validates server-side catalogue/price/account → creates pending order → returns payment URL/metadata (no secrets) → Robokassa **ResultURL** verified (signature, amount, invoice) → idempotent status/entitlement transaction → client polls/receives status.
- **Client restrictions:** cannot declare success, cannot supply authoritative price/entitlement, holds no merchant passwords or signing secrets.
- **State model:** `created → pending → paid|failed|cancelled|expired`, `paid → refunded`; idempotent processing for repeated notifications.
- **Current state:** client contracts + policy gating + reference verification/idempotency logic and tests implemented; **deployable backend, auth, DB, credentials, and live test-mode processing blocked/unavailable**.

## 4. Distribution/payment policy (Google Play aware)

- External payment flows are **enabled only in allowed modes** (e.g. direct/web) and **safely blocked** for Google Play standard mode. EEA alternative billing mode is **architecturally gated and not activated** (requires verified eligibility, Play Console enrollment, compliant APIs/disclosures/reporting/fees, and approval — none claimed).
- Google Play Billing is **not** presented as the owner’s preferred primary provider; policy requirements are respected/documented.

## 5. Privacy and ads policy

- No unnecessary personal data collection added. No undisclosed device identifiers/tracking. Ads must not be intrusive during active gameplay or shown over payment/security screens. Rewarded ads are user-initiated with clear offer. Legal/compliance claims not made without verification.

## 6. Configuration (public only)

- `VITE_ADS_ENABLED`, `VITE_ADS_MODE`, `VITE_YANDEX_REWARDED_AD_UNIT_ID` (public placement ID only)
- `VITE_DISTRIBUTION_MODE`, `VITE_PAYMENTS_ENABLED`, `VITE_API_BASE_URL`, `VITE_RENDER_QUALITY`
- Secrets (Robokassa passwords/keys, API tokens, keystore passwords) **server/local only, never in VITE or client bundle**. See `.env.example`.