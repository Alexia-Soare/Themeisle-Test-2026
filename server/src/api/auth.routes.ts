import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth.middleware";
import { handleGetActiveBets, handleGetResolvedBets, handleRegister, handleLogin } from "./handlers";

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .use(authMiddleware)
  .post("/register", handleRegister, {
    body: t.Object({
      username: t.String(),
      email: t.String(),
      password: t.String(),
    }),
  })
  .post("/login", handleLogin, {
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
        .get("/me/resolved-bets", handleGetResolvedBets)
        .get("/me/active-bets", handleGetActiveBets),
  );
