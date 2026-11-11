import { DatabaseSync } from 'node:sqlite';

export function openDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      provider_invoice_id TEXT UNIQUE NOT NULL,
      account_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      entitlement TEXT NOT NULL,
      entitlement_granted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      provider_transaction_ref TEXT
    );
    CREATE TABLE IF NOT EXISTS entitlements (
      order_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      entitlement TEXT NOT NULL,
      granted_at INTEGER NOT NULL,
      PRIMARY KEY (order_id, account_id, entitlement)
    );
  `);
  return db;
}

function rowToOrder(row) {
  if (!row) return undefined;
  return {
    orderId: row.order_id,
    providerInvoiceId: row.provider_invoice_id,
    accountId: row.account_id,
    productId: row.product_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    entitlement: row.entitlement,
    entitlementGranted: !!row.entitlement_granted,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    providerTransactionRef: row.provider_transaction_ref ?? null,
  };
}

export function createSqlitePaymentStore(db) {
  const getByOrder = db.prepare('SELECT * FROM orders WHERE order_id = ?');
  const getByInvoice = db.prepare('SELECT * FROM orders WHERE provider_invoice_id = ?');
  const upsert = db.prepare(`
    INSERT INTO orders (
      order_id, provider_invoice_id, account_id, product_id, amount, currency, status,
      entitlement, entitlement_granted, created_at, updated_at, provider_transaction_ref
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(order_id) DO UPDATE SET
      provider_invoice_id=excluded.provider_invoice_id,
      account_id=excluded.account_id,
      product_id=excluded.product_id,
      amount=excluded.amount,
      currency=excluded.currency,
      status=excluded.status,
      entitlement=excluded.entitlement,
      entitlement_granted=excluded.entitlement_granted,
      created_at=excluded.created_at,
      updated_at=excluded.updated_at,
      provider_transaction_ref=excluded.provider_transaction_ref
  `);

  return {
    getByOrderId(orderId) {
      return rowToOrder(getByOrder.get(orderId));
    },
    getByInvoiceId(invoiceId) {
      return rowToOrder(getByInvoice.get(String(invoiceId)));
    },
    save(order) {
      upsert.run(
        order.orderId,
        String(order.providerInvoiceId),
        order.accountId,
        order.productId,
        order.amount,
        order.currency,
        order.status,
        order.entitlement,
        order.entitlementGranted ? 1 : 0,
        order.createdAt,
        order.updatedAt,
        order.providerTransactionRef ?? null,
      );
    },
  };
}

export function createSqliteEntitlementStore(db) {
  const hasStmt = db.prepare('SELECT 1 FROM entitlements WHERE order_id = ? AND account_id = ? AND entitlement = ?');
  const insertStmt = db.prepare('INSERT OR IGNORE INTO entitlements (order_id, account_id, entitlement, granted_at) VALUES (?, ?, ?, ?)');

  return {
    hasGrant(orderId, accountId, entitlement) {
      return !!hasStmt.get(orderId, accountId, entitlement);
    },
    grant(orderId, accountId, entitlement) {
      insertStmt.run(orderId, accountId, entitlement, Date.now());
    },
  };
}

export function withTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}
