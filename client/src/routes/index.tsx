import { useEffect, useEffectEvent, useMemo, useState, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, TrendingUp, Users, Zap, BarChart3, ArrowRight } from "lucide-react";
import type { Market } from "@/lib/api";
import { api, marketStatuses } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { MarketCard } from "@/components/market-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


type SortOption = "newest" | "oldest" | "bet_size";

const MARKETS_PER_PAGE = 20;

const marketStatusLabels: Record<(typeof marketStatuses)[number], string> = {
  active: "Active Markets",
  resolved: "Resolved Markets",
  archived: "Archived Markets",
};

const emptyStateMessages: Record<(typeof marketStatuses)[number], string> = {
  active: "No active markets found. Create one to get started!",
  resolved: "No resolved markets found.",
  archived: "No archived markets found.",
};

function sortMarkets(markets: Array<Market>, sort: SortOption): Array<Market> {
  return [...markets].sort((a, b) => {
    switch (sort) {
      case "newest":
        return b.id - a.id;
      case "oldest":
        return a.id - b.id;
      case "bet_size":
        return b.totalMarketBets - a.totalMarketBets;
      default:
        return 0;
    }
  });
}

function DashboardPage() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [markets, setMarkets] = useState<Array<Market>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<(typeof marketStatuses)[number]>("active");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);

  const sortedMarkets = useMemo(
    () => sortMarkets(markets, sort),
    [markets, sort],
  );
  //const totalPages = 999; // Server doesn't return total yet, use large number
  const paginatedMarkets = sortedMarkets;
  const visibleMarketIds = paginatedMarkets.map((market) => market.id);
  const visibleMarketKey = visibleMarketIds.join(",");

  const handleMarketUpdate = useEffectEvent((updatedMarket: Market) => {
    setMarkets((currentMarkets) =>
      currentMarkets.map((market) => (market.id === updatedMarket.id ? updatedMarket : market)),
    );
  });

  const subscriptionRef = useRef<(() => void)[]>([]);

  const loadMarkets = async (nextStatus = status, nextPage = page) => {
    try {
      setIsLoading(true);
      setError(null);
      const offset = (nextPage - 1) * MARKETS_PER_PAGE;
      const data = await api.listMarkets(nextStatus, MARKETS_PER_PAGE, offset);
      setMarkets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load markets");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMarkets(status, page);
  }, [status, page]);

  useEffect(() => {
    if (visibleMarketIds.length === 0) {
      subscriptionRef.current.forEach((unsubscribe) => unsubscribe());
      subscriptionRef.current = [];
      return;
    }

    const timeoutId = setTimeout(() => {
      subscriptionRef.current.forEach((unsubscribe) => unsubscribe());

      subscriptionRef.current = visibleMarketIds.map((marketId) =>
        api.subscribeToMarketUpdates(marketId, handleMarketUpdate),
      );
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      subscriptionRef.current.forEach((unsubscribe) => unsubscribe());
      subscriptionRef.current = [];
    };
  }, [handleMarketUpdate, visibleMarketKey]);

  const handleStatusChange = (nextStatus: (typeof marketStatuses)[number]) => {
    setStatus(nextStatus);
    setPage(1);
  };

  const handleSortChange = (value: string) => {
    setSort(value as SortOption);
    setPage(1);
  };

  const profileInitial = user?.username.charAt(0).toUpperCase() ?? "U";
  const isAdmin = user?.role === "admin";

  if (!isAuthenticated) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background">
        {/* Global gradient orbs — span full page to avoid section seams */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 left-1/4 h-128 w-lg rounded-full blur-3xl" style={{ background: "oklch(0.6 0.2 295 / 10%)" }} />
          <div className="absolute top-1/3 right-1/4 h-96 w-96 rounded-full blur-3xl" style={{ background: "oklch(0.65 0.18 145 / 8%)" }} />
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 h-64 w-64 rounded-full blur-3xl" style={{ background: "oklch(0.55 0.22 310 / 9%)" }} />
        </div>

        {/* Hero Section */}
        <div className="relative min-h-[70vh] flex items-center justify-center">
          <div className="relative z-10 text-center max-w-3xl mx-auto px-6 animate-fade-in-up">
            <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm">
              Predict the future
            </Badge>
            <h1 className="text-5xl sm:text-6xl font-bold mb-6 text-foreground tracking-tight leading-tight">
              Prediction<br />
              <span className="text-primary">Markets</span>
            </h1>
            <p className="text-muted-foreground mb-10 text-lg sm:text-xl max-w-xl mx-auto leading-relaxed">
              Put your knowledge to the test. Create markets, place bets on outcomes, and compete for the top of the leaderboard.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Button size="lg" className="gap-2 text-base px-8" onClick={() => navigate({ to: "/auth/register" })}>
                Get Started <ArrowRight className="size-4" />
              </Button>
              <Button size="lg" variant="outline" className="text-base px-8" onClick={() => navigate({ to: "/auth/login" })}>
                Login
              </Button>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="max-w-5xl mx-auto px-6 pb-20">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: TrendingUp, title: "Live Odds", desc: "Real-time odds that update as bets come in" },
              { icon: Zap, title: "Instant Payouts", desc: "Winnings distributed automatically on resolution" },
              { icon: Users, title: "Leaderboard", desc: "Compete against others and climb the ranks" },
              { icon: BarChart3, title: "Create Markets", desc: "Start your own market on any topic" },
            ].map((feature, i) => (
              <Card
                key={feature.title}
                className="border-border/50 bg-card/50 backdrop-blur-sm animate-fade-in-up"
                style={{ animationDelay: `${200 + i * 100}ms` }}
              >
                <CardContent className="pt-6">
                  <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="size-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8 animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground">Markets</h1>
            <p className="text-muted-foreground mt-2">Welcome back, {user?.username}!</p>
          </div>
          <div className="flex items-center gap-4">
            <Button onClick={() => navigate({ to: "/markets/new" })}>Create Market</Button>
            <Button variant="outline" onClick={() => navigate({ to: "/leaderboard" })}>
              Leaderboard
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="gap-2 bg-transparent px-1 shadow-none transition-none hover:bg-transparent hover:text-current focus-visible:border-transparent focus-visible:ring-0 data-[state=open]:bg-transparent data-[state=open]:text-current"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {profileInitial}
                  </span>
                  <ChevronDownIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuItem onClick={() => navigate({ to: "/profile", search: { tab: "active" } })}>
                  View Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate({ to: "/auth/logout" })}>
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-4">
          {marketStatuses.filter((s) => isAdmin || s !== "archived").map((marketStatus) => (
            <Button
              key={marketStatus}
              variant={status === marketStatus ? "default" : "outline"}
              onClick={() => handleStatusChange(marketStatus)}
            >
              {marketStatusLabels[marketStatus]}
            </Button>
          ))}
          <Button variant="outline" onClick={() => loadMarkets(status, page)} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh"}
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <span className="text-sm text-foreground">Sort by:</span>
            <Select value={sort} onValueChange={handleSortChange}>
              <SelectTrigger className="w-45 border-border! bg-background! text-foreground! hover:bg-muted!">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="bet_size">Total Bet Size</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isAdmin && (
          <div className="mb-6 rounded-md border border-amber-500/30 dark:border-amber-400/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            Admin mode is enabled. Open any active market to resolve it with a winning outcome, or archive it to cancel and refund all bets.
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-6">
            {error}
          </div>
        )}

        {/* Markets Grid */}
        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading markets...</p>
            </CardContent>
          </Card>
        ) : sortedMarkets.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-muted-foreground text-lg">{emptyStateMessages[status]}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedMarkets.map((market, index) => (
                <div key={`anim-${market.id}`} className="animate-fade-in-up h-full" style={{ animationDelay: `${index * 50}ms` }}>
                  <MarketCard key={market.id} market={market} />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPage((currentPage) => Math.max(currentPage - 1, 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPage((currentPage) => currentPage + 1)}
                  disabled={paginatedMarkets.length < MARKETS_PER_PAGE}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: DashboardPage,
});
