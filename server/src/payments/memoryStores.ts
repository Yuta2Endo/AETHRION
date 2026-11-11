import type { EntitlementStore, PaymentOrder, PaymentStore } from './types';

export function createMemoryPaymentStore(): PaymentStore & { all(): PaymentOrder[] } {
  const orders = new Map<string, PaymentOrder>();
  return {
    getByOrderId(orderId) {
      return orders.get(orderId);
    },
    getByInvoiceId(invoiceId) {
      return Array.from(orders.values()).find((o) => o.providerInvoiceId === invoiceId);
    },
    save(order) {
      orders.set(order.orderId, structuredClone(order));
    },
    all() {
      return Array.from(orders.values()).map((o) => structuredClone(o));
    },
  };
}

export function createMemoryEntitlementStore(): EntitlementStore & { grants: Array<{ orderId: string; accountId: string; entitlement: string }> } {
  const grants: Array<{ orderId: string; accountId: string; entitlement: string }> = [];
  return {
    grants,
    hasGrant(orderId, accountId, entitlement) {
      return grants.some((g) => g.orderId === orderId && g.accountId === accountId && g.entitlement === entitlement);
    },
    grant(orderId, accountId, entitlement) {
      if (!grants.some((g) => g.orderId === orderId && g.accountId === accountId && g.entitlement === entitlement)) {
        grants.push({ orderId, accountId, entitlement });
      }
    },
  };
}