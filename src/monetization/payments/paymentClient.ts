import { readPlatformConfig } from '@/platform/config/platformConfig';
import { canUseExternalPayments } from '@/monetization/policy/distributionPolicy';
import type { CreatePaymentRequest, CreatePaymentResponse, PaymentStatusResponse } from './types';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Payment request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
  const config = readPlatformConfig();
  const decision = canUseExternalPayments(config.distributionMode);
  if (!decision.allowed) {
    return {
      orderId: '',
      status: 'failed',
      message: decision.reason ?? 'External payments are not available in this distribution mode.',
    };
  }
  if (!config.paymentsEnabled) {
    return {
      orderId: '',
      status: 'failed',
      message: 'Payments are disabled by configuration or unavailable pending secure backend deployment.',
    };
  }

  return requestJson<CreatePaymentResponse>(`${config.apiBaseUrl.replace(/\/$/, '')}/payments/create`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getPaymentStatus(orderId: string): Promise<PaymentStatusResponse> {
  const config = readPlatformConfig();
  return requestJson<PaymentStatusResponse>(`${config.apiBaseUrl.replace(/\/$/, '')}/payments/${encodeURIComponent(orderId)}`);
}