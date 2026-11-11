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
  title: string;
  description?: string;
  amount: number;
  currency: string;
}

export interface PaymentRecord {
  orderId: string;
  providerInvoiceId: string | null;
  accountId: string;
  productId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: number;
  updatedAt: number;
  providerTransactionRef?: string | null;
  entitlementGranted: boolean;
}

export interface CreatePaymentRequest {
  accountId: string;
  productId: string;
}

export interface CreatePaymentResponse {
  orderId: string;
  status: PaymentStatus;
  paymentUrl?: string;
  message?: string;
}

export interface PaymentStatusResponse {
  orderId: string;
  status: PaymentStatus;
  entitlementGranted: boolean;
  updatedAt: number;
}

export function canTransitionPaymentStatus(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) return true;
  const allowed: Record<PaymentStatus, PaymentStatus[]> = {
    created: ['pending', 'failed', 'cancelled', 'expired'],
    pending: ['paid', 'failed', 'cancelled', 'expired'],
    paid: ['refunded'],
    failed: [],
    cancelled: [],
    expired: [],
    refunded: [],
  };
  return allowed[from].includes(to);
}