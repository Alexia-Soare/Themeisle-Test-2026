import { Elysia } from "elysia";
import { getUserFromToken } from "../lib/auth";

export const authMiddleware = new Elysia({ name: "auth-middleware" })
  .derive(async ({ headers }) => {
    const authHeader = headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { user: null };
    }
    const token = authHeader.substring(7);
    const user = await getUserFromToken(token);
    return { user };
  })
  .as("plugin");
