import type { EnrichedMarket } from "./market-data";
import { getEnrichedMarket } from "./market-data";

const encoder = new TextEncoder();
const marketSubscribers = new Map<number, Set<ReadableStreamDefaultController<Uint8Array>>>();

function writeMessage(
  controller: ReadableStreamDefaultController<Uint8Array>,
  message: string,
): boolean {
  try {
    controller.enqueue(encoder.encode(message));
    return true;
  } catch {
    return false;
  }
}

function addSubscriber(
  marketId: number,
  controller: ReadableStreamDefaultController<Uint8Array>,
) {
  const subscribers = marketSubscribers.get(marketId) ?? new Set();
  subscribers.add(controller);
  marketSubscribers.set(marketId, subscribers);
}

function removeSubscriber(
  marketId: number,
  controller: ReadableStreamDefaultController<Uint8Array>,
) {
  const subscribers = marketSubscribers.get(marketId);
  if (!subscribers) {
    return;
  }

  subscribers.delete(controller);

  if (subscribers.size === 0) {
    marketSubscribers.delete(marketId);
  }
}

function formatMarketMessage(market: EnrichedMarket): string {
  return `data: ${JSON.stringify(market)}\n\n`;
}

export function createMarketStreamResponse({
  marketId,
  initialMarket,
  signal,
}: {
  marketId: number;
  initialMarket: EnrichedMarket;
  signal?: AbortSignal;
}) {
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let isClosed = false;
      let keepAliveTimer: ReturnType<typeof setInterval> | undefined;

      const handleAbort = () => {
        cleanup();
      };

      cleanup = () => {
        if (isClosed) {
          return;
        }

        isClosed = true;

        if (keepAliveTimer) {
          clearInterval(keepAliveTimer);
        }

        signal?.removeEventListener("abort", handleAbort);
        removeSubscriber(marketId, controller);

        try {
          controller.close();
        } catch {
          // Stream is already closed.
        }
      };

      addSubscriber(marketId, controller);
      writeMessage(controller, "retry: 5000\n\n");
      writeMessage(controller, formatMarketMessage(initialMarket));

      keepAliveTimer = setInterval(() => {
        if (!writeMessage(controller, ": keep-alive\n\n")) {
          cleanup();
        }
      }, 15_000);

      signal?.addEventListener("abort", handleAbort, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}

export async function broadcastMarketUpdate(marketId: number) {
  const subscribers = marketSubscribers.get(marketId);
  if (!subscribers || subscribers.size === 0) {
    return;
  }

  const market = await getEnrichedMarket(marketId);
  if (!market) {
    return;
  }

  const message = formatMarketMessage(market);

  for (const controller of Array.from(subscribers)) {
    if (!writeMessage(controller, message)) {
      removeSubscriber(marketId, controller);
    }
  }
}