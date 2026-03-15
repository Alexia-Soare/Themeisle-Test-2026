import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import type { Market, MarketStatus } from "@/lib/api";
import { api, marketStatuses } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { MarketCard } from "@/components/market-card";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


type SortOption = "newest" | "oldest" | "bet_size";

const MARKETS_PER_PAGE = 20;

const marketStatusLabels: Record<MarketStatus, string> = {
  active: "Active Markets",
  resolved: "Resolved Markets",
};

const emptyStateMessages: Record<MarketStatus, string> = {
  active: "No active markets found. Create one to get started!",
  resolved: "No resolved markets found.",
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
  const [status, setStatus] = useState<MarketStatus>("active");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);

  const sortedMarkets = useMemo(
    () => sortMarkets(markets, sort),
    [markets, sort],
  );
  const totalMarkets = sortedMarkets.length;
  const totalPages = Math.max(1, Math.ceil(totalMarkets / MARKETS_PER_PAGE));
  const startIndex = totalMarkets === 0 ? 0 : (page - 1) * MARKETS_PER_PAGE;
  const endIndex = Math.min(startIndex + MARKETS_PER_PAGE, totalMarkets);
  const paginatedMarkets = sortedMarkets.slice(startIndex, endIndex);
  const visibleMarketIds = paginatedMarkets.map((market) => market.id);
  const visibleMarketKey = visibleMarketIds.join(",");

  const handleMarketUpdate = useEffectEvent((updatedMarket: Market) => {
    setMarkets((currentMarkets) =>
      currentMarkets.map((market) => (market.id === updatedMarket.id ? updatedMarket : market)),
    );
  });

  const loadMarkets = async (nextStatus = status) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.listMarkets(nextStatus);
      setMarkets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load markets");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMarkets();
  }, [status]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (visibleMarketIds.length === 0) {
      return;
    }

    const unsubscribeHandlers = visibleMarketIds.map((marketId) =>
      api.subscribeToMarketUpdates(marketId, handleMarketUpdate),
    );

    return () => {
      unsubscribeHandlers.forEach((unsubscribe) => unsubscribe());
    };
  }, [handleMarketUpdate, visibleMarketKey]);

  const handleStatusChange = (nextStatus: MarketStatus) => {
    setStatus(nextStatus);
    setPage(1);
  };

  const handleSortChange = (value: string) => {
    setSort(value as SortOption);
    setPage(1);
  };

  const profileInitial = user?.username.charAt(0).toUpperCase() ?? "U";

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-gray-900">Prediction Markets</h1>
          <p className="text-gray-600 mb-8 text-lg">Create and participate in prediction markets</p>
          <div className="space-x-4">
            <Button onClick={() => navigate({ to: "/auth/login" })}>Login</Button>
            <Button variant="outline" onClick={() => navigate({ to: "/auth/register" })}>
              Sign Up
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Markets</h1>
            <p className="text-gray-600 mt-2">Welcome back, {user?.username}!</p>
          </div>
          <div className="flex items-center gap-4">
            <Button onClick={() => navigate({ to: "/markets/new" })}>Create Market</Button>
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
                <DropdownMenuItem onClick={() => navigate({ to: "/profile" })}>
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
          {marketStatuses.map((marketStatus) => (
            <Button
              key={marketStatus}
              variant={status === marketStatus ? "default" : "outline"}
              onClick={() => handleStatusChange(marketStatus)}
            >
              {marketStatusLabels[marketStatus]}
            </Button>
          ))}
          <Button variant="outline" onClick={() => loadMarkets()} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh"}
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Showing {totalMarkets === 0 ? 0 : startIndex + 1}-{endIndex} of {totalMarkets} markets
            </span>
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
              {paginatedMarkets.map((market) => (
                <MarketCard key={market.id} market={market} />
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
                  onClick={() => setPage((currentPage) => Math.min(currentPage + 1, totalPages))}
                  disabled={page === totalPages}
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
