import { createHash } from 'node:crypto';

function md5(input) {
  return createHash('md5').update(input).digest('hex');
}

export function normalizeSignature(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function generateRobokassaPaymentSignature({ merchantLogin, outSum, invId, password1, shpParams }) {
  const shp = Object.keys(shpParams ?? {})
    .sort()
    .map((key) => `${key}=${shpParams[key]}`)
    .join(':');
  const base = `${merchantLogin}:${outSum}:${invId}:${password1}${shp ? `:${shp}` : ''}`;
  return md5(base);
}

export function generateRobokassaResultSignature({ outSum, invId, password2, shpParams }) {
  const shp = Object.keys(shpParams ?? {})
    .sort()
    .map((key) => `${key}=${shpParams[key]}`)
    .join(':');
  const base = `${outSum}:${invId}:${password2}${shp ? `:${shp}` : ''}`;
  return md5(base);
}

export function extractShpParams(notification) {
  const shpParams = {};
  for (const [key, value] of Object.entries(notification ?? {})) {
    if ((key.startsWith('Shp_') || key.startsWith('shp_')) && typeof value === 'string') {
      shpParams[key] = value;
    }
  }
  return shpParams;
}

export function verifyRobokassaResultSignature(notification, password2) {
  const expected = generateRobokassaResultSignature({
    outSum: notification.OutSum,
    invId: notification.InvId,
    password2,
    shpParams: extractShpParams(notification),
  });
  return normalizeSignature(expected) === normalizeSignature(notification.SignatureValue);
}

export function validateNotificationAgainstOrder(order, notification) {
  const errors = [];
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

export function buildPaymentUrl({ baseUrl, merchantLogin, outSum, invId, description, signature, isTest }) {
  const url = new URL(baseUrl);
  url.searchParams.set('MerchantLogin', merchantLogin);
  url.searchParams.set('OutSum', outSum);
  url.searchParams.set('InvId', String(invId));
  url.searchParams.set('Description', description);
  url.searchParams.set('SignatureValue', signature);
  if (isTest) url.searchParams.set('IsTest', '1');
  return url.toString();
}
