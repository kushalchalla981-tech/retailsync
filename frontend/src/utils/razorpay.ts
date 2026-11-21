import { API_BASE as API } from './api';

declare const Razorpay: any;

export interface RazorpayOptions {
  storeName: string;
  storeSlug: string;
  amount: number;        // in paise (₹1 = 100 paise)
  productName: string;
  /** Line items for the owner's emailed invoice (the server takes the total from Razorpay). */
  invoice?: {
    lines: { name: string; storeName: string; qty: number; unitPriceInr: number }[];
    customerName?: string;
    customerEmail?: string;
  };
  onSuccess: (paymentId: string) => void;
  onFailure: (error: unknown) => void;
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
    });
  } catch (err) {
    return opts.onFailure(err);
  }

  if (order.status === 503) {
    setTimeout(() => opts.onSuccess('demo_payment_' + Date.now()), 1200);
    return;
  }
  if (order.status !== 201) return opts.onFailure(order.data);

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
        const verified = await post<{ paymentId: string }>('verify', { ...response, invoice: opts.invoice });
        if (verified.status === 200) opts.onSuccess(verified.data.paymentId);
        else opts.onFailure(verified.data);
      } catch (err) {
        opts.onFailure(err);
      }
    },
    modal: { ondismiss: () => opts.onFailure({ reason: 'dismissed' }) },
  });
  rzp.on('payment.failed', (resp: { error: unknown }) => opts.onFailure(resp.error));
  rzp.open();
}
