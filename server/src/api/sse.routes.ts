import { Elysia } from "elysia";
import { subscribe } from "../lib/events";

const encoder = new TextEncoder();

function formatMessage(marketId: number): string {
  return `data: ${JSON.stringify({ marketId })}\n\n`;
}

export const sseRoutes = new Elysia({ prefix: "/api" }).get("/events", () => {
  const stream = new ReadableStream({
    start(controller) {
      const message = formatMessage(-1);
      controller.enqueue(encoder.encode(message));

      const unsubscribe = subscribe((marketId: number) => {
        controller.enqueue(encoder.encode(formatMessage(marketId)));
      });

      return () => {
        unsubscribe();
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
});
