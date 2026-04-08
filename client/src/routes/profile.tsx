import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ActiveBetSummary, ArchivedBetSummary, Market, ResolvedBetSummary } from "@/lib/api";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, Eye, EyeOff, Copy } from "lucide-react";

  const ITEMS_PER_PAGE = 20;

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

    const loadProfileBets = useCallback(async (options?: { background?: boolean }) => {
      const isBackground = options?.background === true;

      if (!isBackground) {
        setIsLoadingActiveBets(true);
        setIsLoadingResolvedBets(true);
        setIsLoadingArchivedBets(true);
      }

      setActiveBetsError(null);
      setResolvedBetsError(null);
      setArchivedBetsError(null);

      const [activeBetsResult, resolvedBetsResult, archivedBetsResult] = await Promise.allSettled([
        api.getActiveBets(ITEMS_PER_PAGE, (activePage - 1) * ITEMS_PER_PAGE),
        api.getResolvedBets(ITEMS_PER_PAGE, (resolvedPage - 1) * ITEMS_PER_PAGE),
        isAdmin ? api.getArchivedBets(ITEMS_PER_PAGE, (archivedPage - 1) * ITEMS_PER_PAGE) : Promise.resolve([]),
      ]);

    if (activeBetsResult.status === "fulfilled") {
      setActiveBets(activeBetsResult.value);
    } else {
      setActiveBetsError(
        activeBetsResult.reason instanceof Error
          ? activeBetsResult.reason.message
          : "Failed to load active bets",
      );
    }

    if (resolvedBetsResult.status === "fulfilled") {
      setResolvedBets(resolvedBetsResult.value);
    } else {
      setResolvedBetsError(
        resolvedBetsResult.reason instanceof Error
          ? resolvedBetsResult.reason.message
          : "Failed to load resolved bets",
      );
    }

    if (archivedBetsResult.status === "fulfilled") {
      setArchivedBets(archivedBetsResult.value);
    } else {
      setArchivedBetsError(
        archivedBetsResult.reason instanceof Error
          ? archivedBetsResult.reason.message
          : "Failed to load archived bets",
      );
    }

    if (!isBackground) {
      setIsLoadingActiveBets(false);
      setIsLoadingResolvedBets(false);
      setIsLoadingArchivedBets(false);
    }
  }, [activePage, resolvedPage, archivedPage, isAdmin]);

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
  }, [isAuthenticated, activePage, resolvedPage, archivedPage, loadProfileBets]);

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

  const activeStartIndex = 0;
  const activeEndIndex = activeBets.length;
  const paginatedActiveBets = activeBets;

  const resolvedStartIndex = 0;
  const resolvedEndIndex = resolvedBets.length;
  const paginatedResolvedBets = resolvedBets;

  const archivedStartIndex = 0;
  const archivedEndIndex = archivedBets.length;
  const paginatedArchivedBets = archivedBets;

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

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-3xl mx-auto px-4 space-y-6 animate-fade-in-up">
        <Button variant="outline" onClick={() => navigate({ to: "/" })}>
          Back to Markets
        </Button>

        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-4xl">Your Profile</CardTitle>
            <CardDescription>Account details currently stored in your session.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs text-muted-foreground">Username</p>
                <p className="text-lg font-semibold text-foreground">{user.username}</p>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-lg font-semibold text-foreground break-all">{user.email}</p>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs text-muted-foreground">User ID</p>
                <p className="text-lg font-semibold text-foreground">#{user.id}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 dark:border-emerald-400/20 bg-emerald-500/5">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Current Balance</p>
                <p className="mt-2 text-6xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">
                  ${(user.balance ?? 0).toFixed(2)}
                </p>
              </div>
              <div className="rounded-full bg-emerald-500/10 dark:bg-emerald-400/10 p-5">
                <Wallet className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-3xl">Active Bets</CardTitle>
            <CardDescription>
              Your open bets with their current live odds. These values update automatically when the market changes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeBetsError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {activeBetsError}
              </div>
            )}

            {isLoadingActiveBets ? (
              <p className="text-sm text-muted-foreground">Loading active bets...</p>
            ) : activeBets.length === 0 ? (
              <p className="text-sm text-muted-foreground">You do not have any active bets yet.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                  <span>
                    Showing {activeBets.length === 0 ? 0 : activeStartIndex + 1}-{activeEndIndex} active bets
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActivePage((currentPage) => Math.max(currentPage - 1, 1))}
                      disabled={activePage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActivePage((currentPage) => currentPage + 1)}
                      disabled={activeBets.length < ITEMS_PER_PAGE}
                    >
                      Next
                    </Button>
                  </div>
                </div>

                {paginatedActiveBets.map((bet) => (
                  <div
                    key={bet.id}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-foreground">{bet.marketTitle}</p>
                      <p className="text-sm text-muted-foreground">Outcome: {bet.outcomeTitle}</p>
                      <p className="text-sm text-muted-foreground">Amount: ${bet.amount.toFixed(2)}</p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Current odds</p>
                      <p className="text-2xl font-semibold text-primary">{bet.currentOdds}%</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-3xl">Resolved Bets</CardTitle>
            <CardDescription>
              Your completed bets, including the market, your picked outcome, and whether you won or lost.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {resolvedBetsError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {resolvedBetsError}
              </div>
            )}

            {isLoadingResolvedBets ? (
              <p className="text-sm text-muted-foreground">Loading resolved bets...</p>
            ) : resolvedBets.length === 0 ? (
              <p className="text-sm text-muted-foreground">You do not have any resolved bets yet.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                  <span>
                    Showing {resolvedBets.length === 0 ? 0 : resolvedStartIndex + 1}-{resolvedEndIndex} resolved bets
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setResolvedPage((currentPage) => Math.max(currentPage - 1, 1))}
                      disabled={resolvedPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setResolvedPage((currentPage) => currentPage + 1)
                      }
                      disabled={resolvedBets.length < ITEMS_PER_PAGE}
                    >
                      Next
                    </Button>
                  </div>
                </div>

                {paginatedResolvedBets.map((bet) => (
                  <div
                    key={bet.id}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-foreground">{bet.marketTitle}</p>
                      <p className="text-sm text-muted-foreground">Outcome: {bet.outcomeTitle}</p>
                    </div>
                    <div className="flex flex-col items-start gap-1 md:items-end">
                      <Badge variant={bet.result === "won" ? "default" : "secondary"}>
                        {bet.result === "won" ? "Won" : "Lost"}
                      </Badge>
                      {bet.result === "won" && bet.payout !== null && (
                        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">+${bet.payout.toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-3xl">Archived Bets</CardTitle>
            <CardDescription>
              Bets on cancelled markets. Your original stake was refunded when these markets were archived.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {archivedBetsError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {archivedBetsError}
              </div>
            )}

            {isLoadingArchivedBets ? (
              <p className="text-sm text-muted-foreground">Loading archived bets...</p>
            ) : archivedBets.length === 0 ? (
              <p className="text-sm text-muted-foreground">You do not have any archived bets.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                  <span>
                    Showing {archivedBets.length === 0 ? 0 : archivedStartIndex + 1}-{archivedEndIndex} archived bets
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setArchivedPage((currentPage) => Math.max(currentPage - 1, 1))}
                      disabled={archivedPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setArchivedPage((currentPage) => currentPage + 1)
                      }
                      disabled={archivedBets.length < ITEMS_PER_PAGE}
                    >
                      Next
                    </Button>
                  </div>
                </div>

                {paginatedArchivedBets.map((bet) => (
                  <div
                    key={bet.id}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-foreground">{bet.marketTitle}</p>
                      <p className="text-sm text-muted-foreground">Outcome: {bet.outcomeTitle}</p>
                      <p className="text-sm text-muted-foreground">Amount: ${bet.amount.toFixed(2)}</p>
                    </div>
                    <Badge variant="outline" className="border-amber-500/30 dark:border-amber-400/30 text-amber-700 dark:text-amber-300">
                      Refunded
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        )}

        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-3xl">API Key</CardTitle>
            <CardDescription>
              Use this key to place bets and interact with the API programmatically.
              Pass it as the <code className="font-mono text-xs">X-Api-Key</code> header.
            </CardDescription>
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
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-mono break-all">
                    {showApiKey ? apiKey : "pm_" + "•".repeat(44)}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => setShowApiKey((v) => !v)}>
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCopyApiKey}>
                    {isCopied ? "Copied!" : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleGenerateApiKey} disabled={isGenerating}>
                    {isGenerating ? "Regenerating..." : "Regenerate"}
                  </Button>
                  <Button variant="destructive" onClick={handleRevokeApiKey}>
                    Revoke
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground break-all">
                  Example: <code className="font-mono">curl -H "X-Api-Key: {"<your-key>"}" {window.location.origin}/api/markets/</code>
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">No API key generated yet.</p>
                <Button onClick={handleGenerateApiKey} disabled={isGenerating}>
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
});