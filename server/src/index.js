import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { openDatabase, createSqlitePaymentStore, createSqliteEntitlementStore, withTransaction } from './db/sqliteStores.js';
import { buildPaymentUrl, generateRobokassaPaymentSignature, validateNotificationAgainstOrder, verifyRobokassaResultSignature } from './robokassa.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const PORT = Number(process.env.PORT || 8787);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../db/payments.sqlite');
const ROBOKASSA_MERCHANT_LOGIN = process.env.ROBOKASSA_MERCHANT_LOGIN || '';
const ROBOKASSA_PASSWORD1 = process.env.ROBOKASSA_PASSWORD1 || '';
const ROBOKASSA_PASSWORD2 = process.env.ROBOKASSA_PASSWORD2 || '';
const ROBOKASSA_IS_TEST = String(process.env.ROBOKASSA_IS_TEST || 'true').toLowerCase() !== 'false';
const ROBOKASSA_PAYMENT_URL = process.env.ROBOKASSA_PAYMENT_URL || 'https://auth.robokassa.ru/Merchant/Index.aspx';
const NODE_ENV = process.env.NODE_ENV || 'development';
const ALLOW_INSECURE_AUTH_STUB = String(process.env.ALLOW_INSECURE_AUTH_STUB ?? 'true').toLowerCase() !== 'false';
const REQUIRE_REAL_AUTH = String(process.env.REQUIRE_REAL_AUTH ?? (NODE_ENV === 'production' ? 'true' : 'false')).toLowerCase() === 'true';

// Server-authoritative product catalogue (never trust client price/entitlement)
const PRODUCTS = new Map([
  ['starter_boost', { id: 'starter_boost', amount: 99.0, currency: 'RUB', entitlement: 'starter_boost', description: 'Starter Boost' }],
  ['empire_pack', { id: 'empire_pack', amount: 199.0, currency: 'RUB', entitlement: 'empire_pack', description: 'Empire Pack' }],
]);

const db = openDatabase(DB_PATH);
const paymentStore = createSqlitePaymentStore(db);
const entitlementStore = createSqliteEntitlementStore(db);

function nextInvoiceId() {
  // Robokassa InvId must be unique numeric (merchant scope). Simple local strategy for this server instance.
  return String(Date.now()) + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
}

function requireAuth(req, res, next) {
  // Development/local stub only. Do not treat x-account-id as secure authentication.
  // Real deployments must integrate authenticated identity (session/JWT/provider) and set REQUIRE_REAL_AUTH=true.
  if (REQUIRE_REAL_AUTH) {
    return res.status(501).json({
      error: 'Payment authentication is not configured. Real authenticated identity provider integration is required before payment creation in this environment.',
      code: 'REAL_AUTH_REQUIRED',
    });
  }

  if (!ALLOW_INSECURE_AUTH_STUB) {
    return res.status(401).json({ error: 'Unauthorized: insecure auth stub disabled.' });
  }

  const accountId = String(req.header('x-account-id') || '').trim();
  if (!accountId) {
    return res.status(401).json({ error: 'Unauthorized: x-account-id header required for local development stub only.' });
  }
  // Basic format guard for stub; still not secure identity.
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(accountId)) {
    return res.status(400).json({ error: 'Invalid account identifier format.' });
  }
  req.accountId = accountId;
  next();
}

function robokassaConfigured() {
  return !!(ROBOKASSA_MERCHANT_LOGIN && ROBOKASSA_PASSWORD1 && ROBOKASSA_PASSWORD2);
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    robokassaConfigured: robokassaConfigured(),
    testMode: ROBOKASSA_IS_TEST,
    db: path.basename(DB_PATH),
    auth: {
      requireRealAuth: REQUIRE_REAL_AUTH,
      insecureStubAllowed: ALLOW_INSECURE_AUTH_STUB && !REQUIRE_REAL_AUTH,
    },
  });
});

app.get('/products', (_req, res) => {
  res.json({ products: Array.from(PRODUCTS.values()).map(({ id, amount, currency, description }) => ({ id, amount, currency, description })) });
});

app.post('/payments/create', requireAuth, (req, res) => {
  try {
    if (!robokassaConfigured()) {
      return res.status(503).json({ orderId: '', status: 'failed', message: 'Robokassa is not configured on server (missing merchant credentials). Set env secrets to enable.' });
    }

    const { productId } = req.body ?? {};
    const product = PRODUCTS.get(String(productId));
    if (!product) {
      return res.status(400).json({ orderId: '', status: 'failed', message: 'Unknown or unavailable product.' });
    }

    const orderId = randomUUID();
    const providerInvoiceId = nextInvoiceId();
    const now = Date.now();
    const outSum = product.amount.toFixed(2);

    const signature = generateRobokassaPaymentSignature({
      merchantLogin: ROBOKASSA_MERCHANT_LOGIN,
      outSum,
      invId: providerInvoiceId,
      password1: ROBOKASSA_PASSWORD1,
    });

    const paymentUrl = buildPaymentUrl({
      baseUrl: ROBOKASSA_PAYMENT_URL,
      merchantLogin: ROBOKASSA_MERCHANT_LOGIN,
      outSum,
      invId: providerInvoiceId,
      description: product.description,
      signature,
      isTest: ROBOKASSA_IS_TEST,
    });

    const order = {
      orderId,
      providerInvoiceId,
      accountId: req.accountId,
      productId: product.id,
      amount: product.amount,
      currency: product.currency,
      status: 'pending',
      entitlement: product.entitlement,
      entitlementGranted: false,
      createdAt: now,
      updatedAt: now,
      providerTransactionRef: null,
    };

    paymentStore.save(order);
    return res.json({ orderId, status: 'pending', paymentUrl });
  } catch (err) {
    return res.status(500).json({ orderId: '', status: 'failed', message: err instanceof Error ? err.message : 'Internal error' });
  }
});

app.get('/payments/:orderId', requireAuth, (req, res) => {
  const order = paymentStore.getByOrderId(String(req.params.orderId));
  if (!order || order.accountId !== req.accountId) {
    return res.status(404).json({ error: 'Payment not found.' });
  }
  return res.json({ orderId: order.orderId, status: order.status, entitlementGranted: order.entitlementGranted, updatedAt: order.updatedAt });
});

// Robokassa ResultURL (server-to-server, authoritative). Must return "OK{InvId}" on success.
app.all('/payments/robokassa/result', (req, res) => {
  const notification = { ...(req.query ?? {}), ...(req.body ?? {}) };
  try {
    if (!ROBOKASSA_PASSWORD2) {
      return res.status(503).send('ERROR');
    }

    const invId = String(notification.InvId ?? '');
    if (!/^\d{1,32}$/.test(invId)) {
      return res.status(400).send('ERROR');
    }

    if (!verifyRobokassaResultSignature(notification, ROBOKASSA_PASSWORD2)) {
      return res.status(400).send('ERROR');
    }

    const outcome = withTransaction(db, () => {
      const order = paymentStore.getByInvoiceId(invId);
      if (!order) return { ok: false, duplicate: false };
      const errors = validateNotificationAgainstOrder(order, notification);
      if (errors.length) return { ok: false, duplicate: false, order };

      if (order.status === 'paid' && order.entitlementGranted) {
        return { ok: true, duplicate: true, order };
      }

      if (!entitlementStore.hasGrant(order.orderId, order.accountId, order.entitlement)) {
        entitlementStore.grant(order.orderId, order.accountId, order.entitlement);
      }

      const updated = {
        ...order,
        status: 'paid',
        entitlementGranted: true,
        updatedAt: Date.now(),
        providerTransactionRef: invId,
      };
      paymentStore.save(updated);
      return { ok: true, duplicate: false, order: updated };
    });

    if (!outcome.ok) return res.status(400).send('ERROR');
    return res.status(200).send(`OK${invId}`);
  } catch (_err) {
    return res.status(500).send('ERROR');
  }
});

app.get('/payments/robokassa/success', (_req, res) => {
  res.type('text').send('Payment return received. Final status is confirmed only by server ResultURL processing.');
});

app.get('/payments/robokassa/fail', (req, res) => {
  // Client-facing redirect endpoint is not proof; actual state transitions should be driven by verified server events/policy.
  res.type('text').send(`Payment failed or cancelled (non-authoritative). InvId=${String(req.query?.InvId ?? '')}`);
});

app.listen(PORT, () => {
  console.log(`AETHRION payments server listening on http://localhost:${PORT}`);
  console.log(`DB: ${DB_PATH}`);
  console.log(`Robokassa configured: ${robokassaConfigured()} (testMode=${ROBOKASSA_IS_TEST})`);
});
