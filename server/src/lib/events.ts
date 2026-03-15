type Listener = (marketId: number) => void;

const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function broadcastMarketUpdate(marketId: number): void {
  listeners.forEach((fn) => fn(marketId));
}
