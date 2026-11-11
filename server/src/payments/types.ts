export type PaymentStatus =
  | 'created'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refunded';

export interface PaymentProduct {
  id: string;
  amount: number;
  currency: string;
  entitlement: string;
}

export interface PaymentOrder {
  orderId: string;
  providerInvoiceId: string;
  accountId: string;
  productId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  entitlement: string;
  entitlementGranted: boolean;
  createdAt: number;
  updatedAt: number;
  providerTransactionRef?: string | null;
}

export interface RobokassaNotification {
  OutSum: string;
  InvId: string;
  SignatureValue: string;
  [key: string]: string | undefined;
}

export interface PaymentStore {
  getByOrderId(orderId: string): Promise<PaymentOrder | undefined> | PaymentOrder | undefined;
  getByInvoiceId(invoiceId: string): Promise<PaymentOrder | undefined> | PaymentOrder | undefined;
  save(order: PaymentOrder): Promise<void> | void;
}

export interface EntitlementStore {
  hasGrant(orderId: string, accountId: string, entitlement: string): Promise<boolean> | boolean;
  grant(orderId: string, accountId: string, entitlement: string): Promise<void> | void;
}