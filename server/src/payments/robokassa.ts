import { createHash } from 'node:crypto';
import type { PaymentOrder, RobokassaNotification } from './types';

function md5(input: string): string {
  return createHash('md5').update(input).digest('hex');
}

export function normalizeSignature(value: string): string {
  return value.trim().toLowerCase();
}

export function generateRobokassaPaymentSignature(params: {
  merchantLogin: string;
  outSum: string;
  invId: string;
  password1: string;
  shpParams?: Record<string, string>;
}): string {
  const shp = Object.keys(params.shpParams ?? {})
    .sort()
    .map((key) => `${key}=${params.shpParams![key]}`)
    .join(':');
  const base = `${params.merchantLogin}:${params.outSum}:${params.invId}:${params.password1}${shp ? `:${shp}` : ''}`;
  return md5(base);
}

export function generateRobokassaResultSignature(params: {
  outSum: string;
  invId: string;
  password2: string;
  shpParams?: Record<string, string>;
}): string {
  const shp = Object.keys(params.shpParams ?? {})
    .sort()
    .map((key) => `${key}=${params.shpParams![key]}`)
    .join(':');
  const base = `${params.outSum}:${params.invId}:${params.password2}${shp ? `:${shp}` : ''}`;
  return md5(base);
}

export function verifyRobokassaResultSignature(notification: RobokassaNotification, password2: string): boolean {
  const shpParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(notification)) {
    if (key.startsWith('Shp_') || key.startsWith('shp_')) {
      if (typeof value === 'string') shpParams[key] = value;
    }
  }
  const expected = generateRobokassaResultSignature({
    outSum: notification.OutSum,
    invId: notification.InvId,
    password2,
    shpParams,
  });
  return normalizeSignature(expected) === normalizeSignature(notification.SignatureValue);
}

export function validateNotificationAgainstOrder(order: PaymentOrder, notification: RobokassaNotification): string[] {
  const errors: string[] = [];
  if (String(order.providerInvoiceId) !== String(notification.InvId)) {
    errors.push('Invoice ID mismatch.');
  }
  const notifiedAmount = Number(notification.OutSum);
  if (!Number.isFinite(notifiedAmount)) {
    errors.push('Invalid notified amount.');
  } else if (Math.abs(notifiedAmount - order.amount) > 0.000001) {
    errors.push('Amount mismatch.');
  }
  return errors;
}