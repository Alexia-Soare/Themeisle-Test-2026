import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  handleCreateMarket,
  handleListMarkets,
  handleGetLeaderboard,
  handleGetMarket,
  handleMarketStream,
  handlePlaceBet,
  handleResolveMarket,
  handleArchiveMarket,
} from "./handlers";

export const marketRoutes = new Elysia({ prefix: "/api/markets" })
  .use(authMiddleware)
  .get("/", handleListMarkets, {
    query: t.Object({
      status: t.Optional(
        t.Union([t.Literal("active"), t.Literal("resolved"), t.Literal("archived")]),
      ),
      limit: t.Optional(t.Numeric({ default: 20 })),
      offset: t.Optional(t.Numeric({ default: 0 })),
    }),
  })
  .get("/leaderboard", handleGetLeaderboard)
  .get("/:id/stream", handleMarketStream, {
    params: t.Object({
      id: t.Numeric(),
    }),
  })
  .get("/:id", handleGetMarket, {
    params: t.Object({
      id: t.Numeric(),
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
        .post("/", handleCreateMarket, {
          body: t.Object({
            title: t.String(),
            description: t.Optional(t.String()),
            outcomes: t.Array(t.String()),
          }),
        })
        .post("/:id/bets", handlePlaceBet, {
          params: t.Object({
            id: t.Numeric(),
          }),
          body: t.Object({
            outcomeId: t.Number(),
            amount: t.Number(),
          }),
        }),
  )
  .guard(
    {
      beforeHandle({ user, set }) {
        if (!user) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
        if (user.role !== "admin") {
          set.status = 403;
          return { error: "Admin access required" };
        }
      },
    },
    (app) =>
      app
        .post("/:id/resolve", handleResolveMarket, {
          params: t.Object({
            id: t.Numeric(),
          }),
          body: t.Object({
            outcomeId: t.Number(),
          }),
        })
        .post("/:id/archive", handleArchiveMarket, {
          params: t.Object({
            id: t.Numeric(),
          }),
        }),
  );
