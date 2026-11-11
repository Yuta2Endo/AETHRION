import { describe, expect, it } from 'vitest';
import { generateRobokassaPaymentSignature, generateRobokassaResultSignature, validateNotificationAgainstOrder, verifyRobokassaResultSignature } from '../../../server/src/payments/robokassa';
import { processRobokassaResult, createPendingOrder } from '../../../server/src/payments/paymentService';
import { createMemoryEntitlementStore, createMemoryPaymentStore } from '../../../server/src/payments/memoryStores';
import type { PaymentProduct } from '../../../server/src/payments/types';

const product: PaymentProduct = { id: 'boost_pack', amount: 199.0, currency: 'RUB', entitlement: 'boost_pack' };

describe('Robokassa reference payment processing', () => {
  it('generates and verifies signatures correctly', () => {
    const paymentSig = generateRobokassaPaymentSignature({ merchantLogin: 'shop', outSum: '199.00', invId: '42', password1: 'pass1' });
    expect(paymentSig).toHaveLength(32);

    const resultSig = generateRobokassaResultSignature({ outSum: '199.00', invId: '42', password2: 'pass2' });
    expect(verifyRobokassaResultSignature({ OutSum: '199.00', InvId: '42', SignatureValue: resultSig }, 'pass2')).toBe(true);
    expect(verifyRobokassaResultSignature({ OutSum: '199.00', InvId: '42', SignatureValue: resultSig }, 'wrong')).toBe(false);
  });

  it('rejects amount or invoice mismatches', () => {
    const order = { orderId: 'o1', providerInvoiceId: '42', accountId: 'u1', productId: 'p', amount: 199, currency: 'RUB', status: 'pending', entitlement: 'e', entitlementGranted: false, createdAt: 1, updatedAt: 1 } as any;
    expect(validateNotificationAgainstOrder(order, { OutSum: '200.00', InvId: '42', SignatureValue: 'x' })).toContain('Amount mismatch.');
    expect(validateNotificationAgainstOrder(order, { OutSum: '199.00', InvId: '43', SignatureValue: 'x' })).toContain('Invoice ID mismatch.');
  });

  it('processes valid notifications idempotently and never grants duplicate entitlements', async () => {
    const paymentStore = createMemoryPaymentStore();
    const entitlementStore = createMemoryEntitlementStore();
    await createPendingOrder(paymentStore, { orderId: 'o1', providerInvoiceId: '42', accountId: 'u1', product, now: 1000 });

    const sig = generateRobokassaResultSignature({ outSum: '199.00', invId: '42', password2: 'pass2' });
    const notification = { OutSum: '199.00', InvId: '42', SignatureValue: sig };

    const first = await processRobokassaResult({ notification, password2: 'pass2', paymentStore, entitlementStore, now: 2000 });
    expect(first.ok).toBe(true);
    expect(first.ack).toBe('OK');
    expect(first.duplicate).toBe(false);

    const second = await processRobokassaResult({ notification, password2: 'pass2', paymentStore, entitlementStore, now: 3000 });
    expect(second.ok).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(entitlementStore.grants).toHaveLength(1);
    expect(paymentStore.all()[0].status).toBe('paid');
  });

  it('rejects invalid signatures and unknown invoices', async () => {
    const paymentStore = createMemoryPaymentStore();
    const entitlementStore = createMemoryEntitlementStore();
    await createPendingOrder(paymentStore, { orderId: 'o1', providerInvoiceId: '42', accountId: 'u1', product, now: 1000 });

    const badSig = await processRobokassaResult({ notification: { OutSum: '199.00', InvId: '42', SignatureValue: 'bad' }, password2: 'pass2', paymentStore, entitlementStore, now: 2000 });
    expect(badSig.ok).toBe(false);
    expect(badSig.ack).toBe('ERROR');

    const sig = generateRobokassaResultSignature({ outSum: '199.00', invId: '99', password2: 'pass2' });
    const unknown = await processRobokassaResult({ notification: { OutSum: '199.00', InvId: '99', SignatureValue: sig }, password2: 'pass2', paymentStore, entitlementStore, now: 2000 });
    expect(unknown.ok).toBe(false);
    expect(unknown.message).toMatch(/unknown/i);
  });
});