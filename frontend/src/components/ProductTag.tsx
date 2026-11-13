import { Plus } from 'lucide-react';
import { inr } from '../services/api';
import type { Product, StoreLocation } from '../types';

interface Props {
  product: Product;
  store: StoreLocation | undefined;
  inCart: number;
  busy: boolean;
  onAdd: (p: Product) => void;
}

/** A product as a line of the sale bill: lot, name, price, and the stock at the chosen store. */
export function ProductTag({ product, store, inCart, busy, onAdd }: Props) {
  const here = store ? product.inventory.find((i) => i.locationId === store.id) : undefined;
  const stock = here?.stockQuantity ?? 0;
  const left = stock - inCart;
  const out = !here || stock === 0;
  const stockText = !store ? `${product.totalStock} across stores` : !here ? 'Not carried here' : stock === 0 ? 'Sold out here' : stock === 1 ? `Last one at ${store.name}` : `${stock} at ${store.name}`;

  return (
    <article className="flex h-full flex-col border-t border-ink py-4">
      {product.imageUrl && <img src={product.imageUrl} alt="" loading="lazy" className="frame mb-3 aspect-[4/3] w-full object-cover p-1" />}
      <div className="flex justify-between gap-3 text-xs text-ink-2">
        <span>{product.category.name}</span>
        <span className="figures">{product.sku}</span>
      </div>
      <h3 className="mt-1.5 max-w-none font-sans text-[1.0625rem] font-semibold normal-case leading-snug">{product.name}</h3>
      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <div>
          <p className="display text-[2.5rem] leading-[0.9]">{inr(product.price)}</p>
          <p className={`mt-1 overflow-hidden text-sm ${out || stock === 1 ? 'font-semibold text-fail' : 'text-ink-2'}`}>
            <span key={stockText} className="tick-in block">{stockText}</span>
          </p>
        </div>
        <button type="button" onClick={() => onAdd(product)} disabled={busy || !store || left <= 0} aria-label={`Add ${product.name} to cart`} className="btn btn--frame shrink-0">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {inCart > 0 ? `${inCart} in cart` : 'Add'}
        </button>
      </div>
    </article>
  );
}
