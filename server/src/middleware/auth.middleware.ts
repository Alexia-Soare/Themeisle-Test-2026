import { Elysia } from "elysia";
import { getUserById, getUserByApiKey } from "../lib/auth";

export const authMiddleware = new Elysia({ name: "auth-middleware" })
  .derive(async ({ headers, jwt }) => {
    const authHeader = headers["authorization"];
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const payload = await jwt.verify(token);
      if (!payload) return { user: null };
      return { user: await getUserById(payload.userId) };
    }

    const apiKey = headers["x-api-key"];
    if (apiKey) return { user: await getUserByApiKey(apiKey) };

    return { user: null };
  })
  .as("plugin");
