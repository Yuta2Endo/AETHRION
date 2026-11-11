import { validateNotificationAgainstOrder, verifyRobokassaResultSignature } from './robokassa';
import type { EntitlementStore, PaymentOrder, PaymentProduct, PaymentStore, RobokassaNotification } from './types';

export interface CreateOrderInput {
  orderId: string;
  providerInvoiceId: string;
  accountId: string;
  product: PaymentProduct;
  now: number;
}

export async function createPendingOrder(store: PaymentStore, input: CreateOrderInput): Promise<PaymentOrder> {
  const order: PaymentOrder = {
    orderId: input.orderId,
    providerInvoiceId: input.providerInvoiceId,
    accountId: input.accountId,
    productId: input.product.id,
    amount: input.product.amount,
    currency: input.product.currency,
    status: 'pending',
    entitlement: input.product.entitlement,
    entitlementGranted: false,
    createdAt: input.now,
    updatedAt: input.now,
    providerTransactionRef: null,
  };
  await store.save(order);
  return order;
}

export interface ResultProcessingOutcome {
  ok: boolean;
  ack: 'OK' | 'ERROR';
  message: string;
  order?: PaymentOrder;
  duplicate: boolean;
}

export async function processRobokassaResult(options: {
  notification: RobokassaNotification;
  password2: string;
  paymentStore: PaymentStore;
  entitlementStore: EntitlementStore;
  now: number;
}): Promise<ResultProcessingOutcome> {
  const { notification, password2, paymentStore, entitlementStore, now } = options;

  if (!verifyRobokassaResultSignature(notification, password2)) {
    return { ok: false, ack: 'ERROR', message: 'Invalid signature.', duplicate: false };
  }

  const order = await paymentStore.getByInvoiceId(String(notification.InvId));
  if (!order) {
    return { ok: false, ack: 'ERROR', message: 'Unknown invoice.', duplicate: false };
  }

  const validationErrors = validateNotificationAgainstOrder(order, notification);
  if (validationErrors.length > 0) {
    return { ok: false, ack: 'ERROR', message: validationErrors.join(' '), duplicate: false, order };
  }

  // Idempotency: repeated valid notification must not duplicate entitlement or corrupt state.
  if (order.status === 'paid' && order.entitlementGranted) {
    return { ok: true, ack: 'OK', message: 'Already processed.', duplicate: true, order };
  }

  const alreadyGranted = await entitlementStore.hasGrant(order.orderId, order.accountId, order.entitlement);
  if (!alreadyGranted) {
    await entitlementStore.grant(order.orderId, order.accountId, order.entitlement);
  }

  const updated: PaymentOrder = {
    ...order,
    status: 'paid',
    entitlementGranted: true,
    updatedAt: now,
    providerTransactionRef: String(notification.InvId),
  };
  await paymentStore.save(updated);

  return { ok: true, ack: 'OK', message: 'Processed.', duplicate: false, order: updated };
}