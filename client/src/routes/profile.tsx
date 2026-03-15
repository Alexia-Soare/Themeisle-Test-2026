import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ResolvedBetSummary } from "@/lib/api";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function ProfilePage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [resolvedBets, setResolvedBets] = useState<Array<ResolvedBetSummary>>([]);
  const [isLoadingResolvedBets, setIsLoadingResolvedBets] = useState(true);
  const [resolvedBetsError, setResolvedBetsError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const loadResolvedBets = async () => {
      try {
        setIsLoadingResolvedBets(true);
        setResolvedBetsError(null);
        const data = await api.getResolvedBets();
        setResolvedBets(data);
      } catch (error) {
        setResolvedBetsError(
          error instanceof Error ? error.message : "Failed to load resolved bets",
        );
      } finally {
        setIsLoadingResolvedBets(false);
      }
    };

    loadResolvedBets();
  }, [isAuthenticated]);

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-50 to-indigo-100 p-4">
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
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 py-8">
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        <Button variant="outline" onClick={() => navigate({ to: "/" })}>
          Back to Markets
        </Button>

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
              <div className="space-y-3">
                {resolvedBets.map((bet) => (
                  <div
                    key={bet.id}
                    className="flex flex-col gap-3 rounded-none border border-border bg-background p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-foreground">{bet.marketTitle}</p>
                      <p className="text-sm text-muted-foreground">Outcome: {bet.outcomeTitle}</p>
                    </div>
                    <Badge variant={bet.result === "won" ? "default" : "secondary"}>
                      {bet.result === "won" ? "Won" : "Lost"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-4xl">Your Profile</CardTitle>
            <CardDescription>Account details currently stored in your session.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-none border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs text-muted-foreground">Username</p>
                <p className="text-lg font-semibold text-foreground">{user.username}</p>
              </div>
              <div className="rounded-none border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-lg font-semibold text-foreground break-all">{user.email}</p>
              </div>
              <div className="rounded-none border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs text-muted-foreground">User ID</p>
                <p className="text-lg font-semibold text-foreground">#{user.id}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});