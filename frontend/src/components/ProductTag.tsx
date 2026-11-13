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

/** A product as a shelf tag: photo, name, price and the stock at the chosen store. */
export function ProductTag({ product, store, inCart, busy, onAdd }: Props) {
  const here = store ? product.inventory.find((i) => i.locationId === store.id) : undefined;
  const stock = here?.stockQuantity ?? 0;
  const left = stock - inCart;
  const stockText = !store ? `${product.totalStock} across stores` : !here ? 'Not carried here' : stock === 0 ? 'Sold out here' : `${stock} at ${store.name}`;
  const stockColor = !here || stock === 0 ? 'var(--fail)' : stock <= 3 ? 'var(--wait)' : 'var(--ok)';

  return (
    <article className="group flex flex-col bg-sheet">
      {product.imageUrl && (
        <div className="aspect-[4/3] overflow-hidden bg-paper">
          <img src={product.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
        </div>
      )}
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
        <div className="figures flex justify-between text-[0.625rem] text-ink-2">
          <span>{product.category.name}</span>
          <span>{product.sku}</span>
        </div>
        <h3 className="mt-1 text-[0.9375rem] font-semibold leading-snug">{product.name}</h3>
        <div className="perf my-3" />
        <div className="mt-auto flex items-end justify-between gap-3">
          <div>
            <p className="figures text-lg font-bold">{inr(product.price)}</p>
            <p className="figures text-[0.6875rem]" style={{ color: stockColor }}>
              {stockText}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onAdd(product)}
            disabled={busy || !store || left <= 0}
            aria-label={`Add ${product.name} to cart`}
            className="flex items-center gap-1 border border-ink px-3 py-2 text-[0.8125rem] font-semibold hover:bg-ink hover:text-sheet disabled:border-rule disabled:text-ink-2 disabled:hover:bg-transparent"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {inCart > 0 ? `${inCart} in cart` : 'Add'}
          </button>
        </div>
      </div>
    </article>
  );
}
