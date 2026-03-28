import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth.middleware";
import { handleGetActiveBets, handleGetArchivedBets, handleGetResolvedBets, handleRegister, handleLogin } from "./handlers";

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .use(authMiddleware)
  .post("/register", handleRegister as any, {
    body: t.Object({
      username: t.String(),
      email: t.String(),
      password: t.String(),
    }),
  })
  .post("/login", handleLogin as any, {
    body: t.Object({
      email: t.String(),
      password: t.String(),
    }),
  })
  .guard(
    {
      beforeHandle({ user, set }) {
        if (!user) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
      },
    },
    (app) =>
      app
        .get("/me", ({ user }) => ({
          id: user!.id,
          username: user!.username,
          email: user!.email,
          role: user!.role,
          balance: user!.balance,
        }))
        .get("/me/resolved-bets", handleGetResolvedBets as any, {
          query: t.Object({
            limit: t.Optional(t.Numeric({ default: 20 })),
            offset: t.Optional(t.Numeric({ default: 0 })),
          }),
        })
        .get("/me/active-bets", handleGetActiveBets as any, {
          query: t.Object({
            limit: t.Optional(t.Numeric({ default: 20 })),
            offset: t.Optional(t.Numeric({ default: 0 })),
          }),
        })
        .get("/me/archived-bets", handleGetArchivedBets as any, {
          query: t.Object({
            limit: t.Optional(t.Numeric({ default: 20 })),
            offset: t.Optional(t.Numeric({ default: 0 })),
          }),
        }),
  );
