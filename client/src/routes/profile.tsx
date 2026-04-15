import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import type { ActiveBetSummary, ArchivedBetSummary, Market, ResolvedBetSummary } from "@/lib/api";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Wallet, Eye, EyeOff, Copy,
  ArrowLeft, ArrowRight, Check,
  Clock, CheckCircle2, Archive,
  CircleDot, TrendingUp, Trophy,
  Key, Terminal, Inbox,
} from "lucide-react";

const ITEMS_PER_PAGE = 20;

type BetTab = "active" | "resolved" | "archived";

function ProfilePage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [activeBets, setActiveBets] = useState<Array<ActiveBetSummary>>([]);
  const [isLoadingActiveBets, setIsLoadingActiveBets] = useState(true);
  const [activeBetsError, setActiveBetsError] = useState<string | null>(null);
  const [resolvedBets, setResolvedBets] = useState<Array<ResolvedBetSummary>>([]);
  const [isLoadingResolvedBets, setIsLoadingResolvedBets] = useState(true);
  const [resolvedBetsError, setResolvedBetsError] = useState<string | null>(null);
  const [archivedBets, setArchivedBets] = useState<Array<ArchivedBetSummary>>([]);
  const [isLoadingArchivedBets, setIsLoadingArchivedBets] = useState(true);
  const [archivedBetsError, setArchivedBetsError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [resolvedPage, setResolvedPage] = useState(1);
  const [archivedPage, setArchivedPage] = useState(1);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoadingApiKey, setIsLoadingApiKey] = useState(true);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const { tab: activeTab } = useSearch({ from: "/profile" });

  const setActiveTab = (tab: BetTab) => {
    navigate({ to: "/profile", search: { tab }, replace: true, resetScroll: false });
  };

  // Computed stats
  const totalWon = resolvedBets.filter((b) => b.result === "won").length;
  const totalLost = resolvedBets.filter((b) => b.result === "lost").length;
  const totalPayout = resolvedBets
    .filter((b) => b.result === "won" && b.payout !== null)
    .reduce((sum, b) => sum + (b.payout ?? 0), 0);

  const loadProfileBets = useCallback(async (options?: { background?: boolean }) => {
    const isBackground = options?.background === true;

    // Only fetch the active tab's data
    if (activeTab === "active") {
      if (!isBackground) setIsLoadingActiveBets(true);
      setActiveBetsError(null);
      try {
        const data = await api.getActiveBets(ITEMS_PER_PAGE, (activePage - 1) * ITEMS_PER_PAGE);
        setActiveBets(data);
      } catch (err) {
        setActiveBetsError(err instanceof Error ? err.message : "Failed to load active bets");
      } finally {
        if (!isBackground) setIsLoadingActiveBets(false);
      }
    } else if (activeTab === "resolved") {
      if (!isBackground) setIsLoadingResolvedBets(true);
      setResolvedBetsError(null);
      try {
        const data = await api.getResolvedBets(ITEMS_PER_PAGE, (resolvedPage - 1) * ITEMS_PER_PAGE);
        setResolvedBets(data);
      } catch (err) {
        setResolvedBetsError(err instanceof Error ? err.message : "Failed to load resolved bets");
      } finally {
        if (!isBackground) setIsLoadingResolvedBets(false);
      }
    } else if (activeTab === "archived" && isAdmin) {
      if (!isBackground) setIsLoadingArchivedBets(true);
      setArchivedBetsError(null);
      try {
        const data = await api.getArchivedBets(ITEMS_PER_PAGE, (archivedPage - 1) * ITEMS_PER_PAGE);
        setArchivedBets(data);
      } catch (err) {
        setArchivedBetsError(err instanceof Error ? err.message : "Failed to load archived bets");
      } finally {
        if (!isBackground) setIsLoadingArchivedBets(false);
      }
    }
  }, [activeTab, activePage, resolvedPage, archivedPage, isAdmin]);

  const handleMarketUpdate = useCallback((updatedMarket: Market) => {
    if (updatedMarket.status !== "active") {
      void loadProfileBets({ background: true });
      return;
    }

    setActiveBets((currentBets) => {
      const nextBets = [...currentBets];
      let changedCount = 0;

      for (const [index, bet] of currentBets.entries()) {
        if (bet.marketId !== updatedMarket.id) {
          continue;
        }

        const matchingOutcome = updatedMarket.outcomes.find((outcome) => outcome.id === bet.outcomeId);
        const nextOdds = matchingOutcome?.odds ?? bet.currentOdds;

        if (nextOdds === bet.currentOdds) {
          continue;
        }

        changedCount += 1;
        nextBets[index] = {
          ...bet,
          currentOdds: nextOdds,
        };
      }

      return changedCount === 0 ? currentBets : nextBets;
    });
  }, [loadProfileBets]);

  const activeMarketIds = useMemo(
    () => [...new Set(activeBets.map((bet) => bet.marketId))].sort((left, right) => left - right),
    [activeBets],
  );
  const activeMarketIdsKey = activeMarketIds.join(",");

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveBets([]);
      setResolvedBets([]);
      setArchivedBets([]);
      setActiveBetsError(null);
      setResolvedBetsError(null);
      setArchivedBetsError(null);
      setIsLoadingActiveBets(false);
      setIsLoadingResolvedBets(false);
      setIsLoadingArchivedBets(false);
      setActivePage(1);
      setResolvedPage(1);
      setArchivedPage(1);
      return;
    }

    void loadProfileBets();
  }, [isAuthenticated, activeTab, activePage, resolvedPage, archivedPage, loadProfileBets]);

  useEffect(() => {
    if (!isAuthenticated || activeMarketIds.length === 0) {
      return;
    }

    const unsubscribeHandlers = activeMarketIds.map((marketId) =>
      api.subscribeToMarketUpdates(marketId, handleMarketUpdate),
    );

    return () => {
      unsubscribeHandlers.forEach((unsubscribe) => unsubscribe());
    };
  }, [activeMarketIdsKey, activeMarketIds, handleMarketUpdate, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setApiKey(null);
      setIsLoadingApiKey(false);
      return;
    }
    setIsLoadingApiKey(true);
    api.getApiKey()
      .then(({ apiKey }) => setApiKey(apiKey))
      .catch(() => setApiKeyError("Failed to load API key"))
      .finally(() => setIsLoadingApiKey(false));
  }, [isAuthenticated]);

  const handleGenerateApiKey = async () => {
    setIsGenerating(true);
    setApiKeyError(null);
    try {
      const { apiKey: newKey } = await api.generateApiKey();
      setApiKey(newKey);
      setShowApiKey(true);
    } catch {
      setApiKeyError("Failed to generate API key");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevokeApiKey = async () => {
    try {
      await api.revokeApiKey();
      setApiKey(null);
      setShowApiKey(false);
    } catch {
      setApiKeyError("Failed to revoke API key");
    }
  };

  const handleCopyApiKey = async () => {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const navigateToMarket = (marketId: number) => {
    navigate({ to: `/markets/${marketId}` });
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-3xl">Profile</CardTitle>
            <CardDescription>Please log in to view your profile.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => navigate({ to: "/auth/login" })}>Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Current tab data
  const currentError = activeTab === "active" ? activeBetsError : activeTab === "resolved" ? resolvedBetsError : archivedBetsError;
  const currentLoading = activeTab === "active" ? isLoadingActiveBets : activeTab === "resolved" ? isLoadingResolvedBets : isLoadingArchivedBets;
  const currentPage = activeTab === "active" ? activePage : activeTab === "resolved" ? resolvedPage : archivedPage;
  const setCurrentPage = activeTab === "active" ? setActivePage : activeTab === "resolved" ? setResolvedPage : setArchivedPage;
  const currentBets = activeTab === "active" ? activeBets : activeTab === "resolved" ? resolvedBets : archivedBets;

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-4xl mx-auto px-4 space-y-6 animate-fade-in-up">
        {/* Back button */}
        <Button
          variant="outline"
          className="gap-1.5"
          onClick={() => navigate({ to: "/" })}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Markets
        </Button>

        {/* Profile Header — Identity + Balance */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              {/* Left: Identity */}
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-foreground">{user.username}</h1>
                    {isAdmin && (
                      <Badge variant="secondary" className="text-xs">Admin</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <p className="text-xs text-muted-foreground">ID #{user.id}</p>
                </div>
              </div>

              {/* Right: Balance */}
              <div className="flex items-center gap-4 rounded-xl border border-emerald-500/20 dark:border-emerald-400/20 bg-emerald-500/5 px-6 py-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    Balance
                  </p>
                  <p className="text-3xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">
                    ${(user.balance ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-full bg-emerald-500/10 dark:bg-emerald-400/10 p-3">
                  <Wallet className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-primary/10 p-2.5">
                <CircleDot className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Bets</p>
                <p className="text-2xl font-bold text-foreground">{activeBets.length}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-primary/10 p-2.5">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Win / Loss</p>
                <p className="text-2xl font-bold text-foreground">
                  <span className="text-emerald-600 dark:text-emerald-400">{totalWon}</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  <span className="text-destructive">{totalLost}</span>
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-emerald-500/10 p-2.5">
                <Trophy className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Won</p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                  ${totalPayout.toFixed(2)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Betting History */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-xl">Betting History</CardTitle>
            {/* Tab bar */}
            <div className="flex gap-1 border-b border-border mt-3">
              <button
                type="button"
                onClick={() => setActiveTab("active")}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === "active"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <Clock className="h-4 w-4" />
                Active
                {activeBets.length > 0 && (
                  <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                    {activeBets.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("resolved")}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === "resolved"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
                Resolved
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveTab("archived")}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                    activeTab === "archived"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  <Archive className="h-4 w-4" />
                  Archived
                </button>
              )}
            </div>
          </CardHeader>

          <CardContent className="pt-4">
            {/* Error */}
            {currentError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4">
                {currentError}
              </div>
            )}

            {/* Loading */}
            {currentLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
            ) : currentBets.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted p-3 mb-3">
                  <Inbox className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {activeTab === "active" && "No active bets yet."}
                  {activeTab === "resolved" && "No resolved bets yet."}
                  {activeTab === "archived" && "No archived bets."}
                </p>
                {activeTab === "active" && (
                  <Button
                    variant="link"
                    className="mt-1 text-sm"
                    onClick={() => navigate({ to: "/" })}
                  >
                    Browse markets
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Bet rows */}
                {activeTab === "active" && activeBets.map((bet) => (
                  <div
                    key={bet.id}
                    className="group flex flex-col gap-3 rounded-lg border border-border bg-background p-4 transition-colors duration-150 hover:bg-muted/50 cursor-pointer md:flex-row md:items-center md:justify-between"
                    onClick={() => navigateToMarket(bet.marketId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigateToMarket(bet.marketId);
                      }
                    }}
                  >
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{bet.marketTitle}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">{bet.outcomeTitle}</Badge>
                        <span className="text-muted-foreground">·</span>
                        <span>${bet.amount.toFixed(2)} staked</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-left md:text-right">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Odds</p>
                        <p className="text-xl font-bold text-primary">{bet.currentOdds}%</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </div>
                ))}

                {activeTab === "resolved" && resolvedBets.map((bet) => (
                  <div
                    key={bet.id}
                    className="group flex flex-col gap-3 rounded-lg border border-border bg-background p-4 transition-colors duration-150 hover:bg-muted/50 cursor-pointer md:flex-row md:items-center md:justify-between"
                    onClick={() => navigateToMarket(bet.marketId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigateToMarket(bet.marketId);
                      }
                    }}
                  >
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{bet.marketTitle}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">{bet.outcomeTitle}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {bet.result === "won" && bet.payout !== null && (
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          +${bet.payout.toFixed(2)}
                        </span>
                      )}
                      <Badge
                        variant={bet.result === "won" ? "default" : "secondary"}
                        className={bet.result === "won" ? "bg-emerald-600 dark:bg-emerald-500 text-white" : ""}
                      >
                        {bet.result === "won" ? "Won" : "Lost"}
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </div>
                ))}

                {activeTab === "archived" && isAdmin && archivedBets.map((bet) => (
                  <div
                    key={bet.id}
                    className="group flex flex-col gap-3 rounded-lg border border-border bg-background p-4 transition-colors duration-150 hover:bg-muted/50 cursor-pointer md:flex-row md:items-center md:justify-between"
                    onClick={() => navigateToMarket(bet.marketId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigateToMarket(bet.marketId);
                      }
                    }}
                  >
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{bet.marketTitle}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">{bet.outcomeTitle}</Badge>
                        <span className="text-muted-foreground">·</span>
                        <span>${bet.amount.toFixed(2)} staked</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="border-amber-500/30 dark:border-amber-400/30 text-amber-700 dark:text-amber-300">
                      Refunded
                    </Badge>
                  </div>
                ))}

                {/* Pagination */}
                <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between border-t border-border pt-4 mt-4">
                  <span>
                    Showing {currentBets.length === 0 ? 0 : 1}-{currentBets.length} bets
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground px-2">Page {currentPage}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => p + 1)}
                      disabled={currentBets.length < ITEMS_PER_PAGE}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* API Key */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Key className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">API Key</CardTitle>
                <CardDescription>
                  Authenticate via the <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">X-Api-Key</code> header.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {apiKeyError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {apiKeyError}
              </div>
            )}

            {isLoadingApiKey ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : apiKey ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-1">
                  <code className="flex-1 px-3 py-2 text-sm font-mono text-foreground break-all select-all">
                    {showApiKey ? apiKey : "pm_" + "\u2022".repeat(32)}
                  </code>
                  <div className="flex shrink-0 gap-1 pr-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setShowApiKey((v) => !v)}>
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={handleCopyApiKey}>
                      {isCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <code className="text-xs text-muted-foreground font-mono break-all">
                    curl -H "X-Api-Key: {"<your-key>"}" {window.location.origin}/api/markets/
                  </code>
                </div>

                <div className="border-t border-border pt-4 flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleGenerateApiKey} disabled={isGenerating}>
                    {isGenerating ? "Regenerating..." : "Regenerate"}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleRevokeApiKey}>
                    Revoke
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8">
                <div className="rounded-full bg-muted p-3 mb-3">
                  <Key className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground mb-3">No API key generated yet.</p>
                <Button size="sm" onClick={handleGenerateApiKey} disabled={isGenerating}>
                  {isGenerating ? "Generating..." : "Generate API Key"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (["active", "resolved", "archived"].includes(search.tab as string) ? search.tab : "active") as BetTab,
  }),
});
