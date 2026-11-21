import { API_BASE as API } from './api';

declare const Razorpay: any;

export interface RazorpayOptions {
  storeName: string;
  storeSlug: string;
  amount: number;        // in paise (₹1 = 100 paise)
  productName: string;
  /** Line items for the owner's emailed invoice (the server takes the total from Razorpay). */
  invoice?: {
    lines: { name: string; storeName: string; qty: number; unitPriceInr: number; storeId?: string; productId?: string }[];
    customerName?: string;
    customerEmail?: string;
  };
  onSuccess: (result: PaymentResult) => void;
  onFailure: (error: PaymentFailure) => void;
}

export type DeliveryStatus = 'sent' | 'skipped' | 'failed';

export interface PaymentResult {
  paymentId: string;
  /** Amount Razorpay captured (null for demo payments or if the lookup failed). */
  paidInr: number | null;
  invoice: { owner: DeliveryStatus; buyer: DeliveryStatus } | null;
  demo: boolean;
}

export interface PaymentFailure {
  reason: 'dismissed' | 'out_of_stock' | 'error';
  message?: string;
  /** For out_of_stock: products that cannot be covered. */
  items?: { storeId: string; productId: string; stock: number; requested: number }[];
}


async function post<T>(path: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API}/api/payments/razorpay/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({}) as T) };
}

/**
 * Server creates the Razorpay order (key secret stays on the backend), Checkout
 * collects payment, then the server verifies the signature before we report success.
 * If the backend has no Razorpay keys (503), fall back to a simulated payment for demos.
 */
export async function openRazorpayCheckout(opts: RazorpayOptions) {
  let order: { status: number; data: { orderId: string; amount: number; currency: string; keyId: string } };
  try {
    order = await post('order', {
      amount: opts.amount,
      receipt: `${opts.storeSlug}_${Date.now()}`.slice(0, 40),
      notes: { store_slug: opts.storeSlug, product: opts.productName.slice(0, 256) },
      lines: opts.invoice?.lines.flatMap((l) => (l.storeId && l.productId ? [{ storeId: l.storeId, productId: l.productId, qty: l.qty }] : [])),
    });
  } catch (err) {
    return opts.onFailure({ reason: 'error', message: err instanceof Error ? err.message : undefined });
  }

  if (order.status === 503) {
    setTimeout(() => opts.onSuccess({ paymentId: 'demo_payment_' + Date.now(), paidInr: null, invoice: null, demo: true }), 1200);
    return;
  }
  if (order.status === 409) {
    const err = (order.data as unknown as { error?: { message?: string; details?: { items?: PaymentFailure['items'] } } }).error;
    return opts.onFailure({ reason: 'out_of_stock', message: err?.message, items: err?.details?.items });
  }
  if (order.status !== 201) return opts.onFailure({ reason: 'error' });

  const rzp = new Razorpay({
    key: order.data.keyId,
    order_id: order.data.orderId,
    amount: order.data.amount,
    currency: order.data.currency,
    name: opts.storeName,
    description: opts.productName,
    image: '/favicon.ico',
    notes: { store_slug: opts.storeSlug, product: opts.productName },
    theme: { color: '#1a1918' },
    handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
      try {
        const verified = await post<{ paymentId: string; paidInr: number | null; invoice: PaymentResult['invoice'] }>('verify', { ...response, invoice: opts.invoice });
        if (verified.status === 200) opts.onSuccess({ paymentId: verified.data.paymentId, paidInr: verified.data.paidInr ?? null, invoice: verified.data.invoice ?? null, demo: false });
        else opts.onFailure({ reason: 'error' });
      } catch {
        opts.onFailure({ reason: 'error' });
      }
    },
    modal: { ondismiss: () => opts.onFailure({ reason: 'dismissed' }) },
  });
  rzp.on('payment.failed', (resp: { error?: { description?: string } }) => opts.onFailure({ reason: 'error', message: resp.error?.description }));
  rzp.open();
}
