import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { authRoutes } from "./src/api/auth.routes";
import { marketRoutes } from "./src/api/markets.routes";
import { sseRoutes } from "./src/api/sse.routes";
import { jwtPlugin } from "./src/plugins/jwt";

const PORT = process.env.PORT || 4001;

export const app = new Elysia()
  .use(
    cors({
      origin: "*",
      allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    }),
  )
  .use(jwtPlugin)
  .onError(({ code, set }) => {
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "Not found" };
    }
    if (code === "VALIDATION") {
      set.status = 400;
      return { error: "Invalid request" };
    }
  })
  .use(authRoutes)
  .use(marketRoutes)
  .use(sseRoutes);

if (import.meta.main) {
  app.listen(PORT);
  console.log(`🚀 Server running at http://localhost:${PORT}`);
}
