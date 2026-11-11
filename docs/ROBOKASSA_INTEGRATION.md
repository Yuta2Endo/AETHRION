# AETHRION — Robokassa Integration (Stage 10)

**Provider:** Robokassa (owner-selected)  
**Architecture:** **server-authoritative only** (mandatory)  
**Status:** reference implementation + tests in-repo; **deployable backend/credentials/live integration blocked**

## 1. Authoritative flow

1. **Client (Android/React)** sends authenticated request to application API (product intent only).
2. **Backend** authenticates user, validates product against **server catalogue**, determines authoritative price/currency, creates unique internal order + provider invoice mapping, generates Robokassa signature (password #1), stores `pending` record, returns payment URL + safe metadata.
3. **User pays via Robokassa**.
4. **Robokassa → ResultURL (server)**: verify signature (password #2), validate amount and invoice against stored order, reject malformed/mismatched notifications, process **idempotently** (transactional status + entitlement where supported), return provider-required acknowledgment only after durable success.
5. **Client** obtains status from application API (poll/restore after restart). **SuccessURL redirect is not proof of payment.**

## 2. Implemented in repository (reference)

Location: `server/src/payments/`

- `types.ts`: order/product/notification/store interfaces, payment statuses.
- `robokassa.ts`: MD5 signature generation (payment/result), signature verification, amount/invoice validation helpers.
- `paymentService.ts`: pending order creation, `processRobokassaResult` with signature check, order lookup, amount/invoice validation, idempotent paid/grant handling, durable save semantics via stores.
- `memoryStores.ts`: in-memory stores for deterministic tests (demonstrates idempotent entitlement grant; production must use DB transactions).
- **Tests:** `src/tests/server/robokassa.test.ts` cover signature gen/verify, mismatch rejection, idempotent processing/duplicate notification safety, invalid signature and unknown invoice handling.

## 3. Security requirements

- **Never in client/frontend bundle:** password #1/#2, signing secrets, private API keys, DB credentials.
- Server owns catalogue, prices, entitlements, and account binding.
- Validate and compare all critical fields (amount, invoice, merchant context).
- Idempotent processing; no duplicate entitlement grants on repeated/delayed notifications.
- Support recovery after restart by persisting payment state and querying authoritative status.

## 4. Data model (minimum)

- unique internal `orderId`, provider `invoiceId`, authenticated `accountId`, `productId`, `amount`, `currency`, `status`, timestamps, provider transaction ref, entitlement-granted flag.
- States: `created, pending, paid, failed, cancelled, expired, refunded` (schema/types prepared).

## 5. Testing (required)

- Use **Robokassa test mode** with test credentials (never real merchant credentials).
- Cases: success, failure, cancel, invalid signature, wrong amount, wrong invoice, repeated/delayed notification, duplicate request, return-before-confirmation, restart recovery.
- Automated unit tests for signature/validation/idempotency implemented against reference logic.

## 6. Blockers / pending external work

- No backend service, authentication system, database, deployment, or merchant/test credentials in this repository/environment.
- No live ResultURL endpoint or end-to-end Robokassa test-mode execution.
- Frontend payment UI flows beyond safe gated client contracts not implemented without backend; **no fake frontend-only payment success**.

To complete: deploy secure authenticated API, configure Robokassa merchant/test settings and server-side secrets, implement persistent transactional stores, expose create/status endpoints and ResultURL handler per provider contract, and verify test-mode scenarios.