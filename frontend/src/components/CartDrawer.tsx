import { useState, type FormEvent } from 'react';
import { Minus, Plus, Trash2, X } from 'lucide-react';
import { Dialog } from './Dialog';
import { api, ApiError, inr, short } from '../services/api';
import type { Cart, Order } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  cart: Cart | null;
  busy: boolean;
  onQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onCheckedOut: () => void;
}

type Step = 'cart' | 'details' | 'placing' | 'placed';

export function CartDrawer({ open, onClose, cart, busy, onQuantity, onRemove, onCheckedOut }: Props) {
  const [step, setStep] = useState<Step>('cart');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<{ title: string; body: string; lines?: string[] } | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [replayed, setReplayed] = useState(false);

  const close = () => {
    if (step === 'placed') {
      setStep('cart');
      setOrder(null);
    }
    setError(null);
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!cart) return;
    setStep('placing');
    setError(null);
    try {
      const r = await api.checkout(cart.id, { name: name.trim(), email: email.trim() });
      setOrder(r.data.order);
      setReplayed(r.data.replayed);
      setStep('placed');
      onCheckedOut();
    } catch (err) {
      setStep('details');
      if (err instanceof ApiError && err.notDeployed) {
        setError({ title: 'Checkout is not available yet', body: 'The server has no checkout route yet (plan 02-02). Your cart is saved and nothing was charged.' });
      } else if (err instanceof ApiError && err.code === 'OUT_OF_STOCK') {
        const items = (err.details?.items as { name: string; requested: number; available: number }[] | undefined) ?? [];
        setError({
          title: 'Someone got there first',
          body: `${err.message} The transaction rolled back; no stock moved and your cart is unchanged.`,
          lines: items.map((i) => `${i.name}: wanted ${i.requested}, ${i.available} left`),
        });
      } else {
        setError({ title: 'Checkout failed', body: err instanceof Error ? err.message : 'Unknown error. Try again.' });
      }
    }
  };

  const items = cart?.items ?? [];

  return (
    <Dialog open={open} onClose={close} labelledBy="cart-title" placement="right">
      <header className="flex items-center justify-between px-6 pb-3 pt-6">
        <h2 id="cart-title" className="text-2xl">
          {step === 'placed' ? 'Order receipt' : step === 'cart' ? 'Your cart' : 'Checkout'}
        </h2>
        <button type="button" onClick={close} aria-label="Close cart" className="-mr-2 p-2 text-ink-2 hover:text-ink">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>
      <p className="figures px-6 text-[0.6875rem] text-ink-2">
        {cart?.location ? `Pickup at ${cart.location.name}, ${cart.location.city}` : 'No store selected'}
      </p>
      <div className="border-t border-rule mx-6 mt-3" />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {step === 'placed' && order ? (
          <div className="figures text-[0.75rem]">
            <span className="verdict">
              {replayed ? 'Replayed' : 'Committed'}
            </span>
            <dl className="mt-5 space-y-1.5">
              <Row k="order" v={short(order.id)} />
              <Row k="store" v={order.location.name} />
              <Row k="customer" v={order.customer.name} />
              <Row k="placed" v={new Date(order.createdAt).toLocaleString('en-IN')} />
            </dl>
            <div className="border-t border-rule my-4" />
            <ul className="space-y-1.5">
              {order.items.map((i) => (
                <li key={i.productId} className="flex justify-between gap-3">
                  <span className="truncate">
                    {i.quantity} × {i.name}
                  </span>
                  <span>{inr(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-rule my-4" />
            <Row k="total" v={inr(order.totalAmount)} strong />
            <p className="mt-6 font-sans text-sm text-ink-2">The stock decrement and this order committed in one PostgreSQL transaction. The ledger shows the line.</p>
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-2">Your cart is empty. Add something from the shelf.</p>
        ) : (
          <ul className="divide-y divide-dashed divide-rule">
            {items.map((i) => (
              <li key={i.productId} className="flex gap-3 py-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden bg-paper">
                  {i.imageUrl && <img src={i.imageUrl} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{i.name}</p>
                  <p className="figures text-[0.6875rem] text-ink-2">
                    {inr(i.unitPrice)} each, {i.availableQuantity} in this store
                  </p>
                  {step === 'cart' && (
                    <div className="mt-2 flex items-center gap-1">
                      <button type="button" disabled={busy || i.quantity <= 1} onClick={() => onQuantity(i.productId, i.quantity - 1)} aria-label={`One fewer ${i.name}`} className="border border-rule p-1 hover:border-ink disabled:opacity-40">
                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <span className="figures w-8 text-center text-[0.75rem]" aria-label="Quantity">
                        {i.quantity}
                      </span>
                      <button type="button" disabled={busy} onClick={() => onQuantity(i.productId, i.quantity + 1)} aria-label={`One more ${i.name}`} className="border border-rule p-1 hover:border-ink disabled:opacity-40">
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button type="button" disabled={busy} onClick={() => onRemove(i.productId)} aria-label={`Remove ${i.name}`} className="ml-auto p-1 text-ink-2 hover:text-fail">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                  {i.quantity > i.availableQuantity && <p className="mt-1 text-[0.75rem] text-fail">Only {i.availableQuantity} left here.</p>}
                </div>
                <span className="figures text-[0.75rem] font-semibold">{inr(i.lineTotal)}</span>
              </li>
            ))}
          </ul>
        )}

        {(step === 'details' || step === 'placing') && (
          <form id="checkout-form" onSubmit={submit} className="mt-4 space-y-3">
            <div className="border-t border-rule mb-4" />
            <Field id="co-name" label="Name" value={name} onChange={setName} autoComplete="name" />
            <Field id="co-email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
            {error && (
              <div role="alert" className="border border-fail px-3 py-2 text-sm">
                <p className="font-semibold text-fail">{error.title}</p>
                <p className="mt-1 text-ink-2">{error.body}</p>
                {error.lines?.map((l) => (
                  <p key={l} className="figures mt-1 text-[0.6875rem]">
                    {l}
                  </p>
                ))}
              </div>
            )}
          </form>
        )}
      </div>

      {step !== 'placed' && items.length > 0 && (
        <footer className="border-t border-rule px-6 py-4">
          <div className="figures mb-3 flex justify-between text-sm font-semibold">
            <span>Subtotal</span>
            <span>{inr(cart?.subtotal ?? 0)}</span>
          </div>
          {step === 'cart' ? (
            <button type="button" onClick={() => setStep('details')} className="w-full btn ">
              Check out
            </button>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep('cart')} disabled={step === 'placing'} className="border border-ink px-4 py-3 text-sm font-semibold hover:bg-paper">
                Back
              </button>
              <button type="submit" form="checkout-form" disabled={step === 'placing'} className="flex-1 btn  disabled:opacity-60">
                {step === 'placing' ? 'Locking stock…' : 'Place order'}
              </button>
            </div>
          )}
        </footer>
      )}
    </Dialog>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex gap-2 ${strong ? 'text-sm font-bold' : ''}`}>
      <dt className="text-ink-2">{k}</dt>
      <span aria-hidden="true" className="mb-1 flex-1 border-b border-dotted border-rule" />
      <dd>{v}</dd>
    </div>
  );
}

function Field(props: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string }) {
  return (
    <div>
      <label htmlFor={props.id} className="block text-sm font-semibold">
        {props.label}
      </label>
      <input
        id={props.id}
        required
        type={props.type ?? 'text'}
        maxLength={props.type === 'email' ? 254 : 120}
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-1 w-full border border-ink-2 bg-sheet px-3 py-2 text-sm focus:border-ink"
      />
    </div>
  );
}
