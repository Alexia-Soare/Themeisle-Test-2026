import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { authRoutes } from "./src/api/auth.routes";
import { marketRoutes } from "./src/api/markets.routes";

const PORT = process.env.PORT || 4001;

export const app = new Elysia()
  .use(
    cors({
      origin: "*",
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  )
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
  .use(marketRoutes);

if (import.meta.main) {
  app.listen(PORT);
  console.log(`🚀 Server running at http://localhost:${PORT}`);
}
