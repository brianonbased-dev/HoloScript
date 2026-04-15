import StorePageClient from './StorePageClient';

/** Server entry so `/store` is always emitted in the App Router manifest (standalone/Railway). */
export const dynamic = 'force-dynamic';

export default function StorePage() {
  return <StorePageClient />;
}
