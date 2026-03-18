import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { LeaderboardEntry } from "@/lib/api";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function LeaderboardPage() {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState<Array<LeaderboardEntry>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLeaderboard() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await api.getLeaderboard();
        setLeaderboard(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load leaderboard");
      } finally {
        setIsLoading(false);
      }
    }

    void loadLeaderboard();
  }, []);

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 py-8">
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4">
        <Button variant="outline" onClick={() => navigate({ to: "/" })}>
          Back to Markets
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Leaderboard</CardTitle>
            <CardDescription>
              Ranked by total winnings in descending order.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading leaderboard...</p>
            ) : leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users available for leaderboard ranking.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-[80px_1fr_160px] gap-3 border-b border-border px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Rank</span>
                  <span>User</span>
                  <span className="text-right">Total Winnings</span>
                </div>

                {leaderboard.map((entry, index) => (
                  <div
                    key={entry.userId}
                    className="grid grid-cols-[80px_1fr_160px] items-center gap-3 border border-border bg-background px-4 py-3"
                  >
                    <span className="text-sm font-semibold text-foreground">#{index + 1}</span>
                    <span className="text-sm text-foreground">{entry.username}</span>
                    <span className="text-right text-sm font-semibold text-primary">
                      ${entry.totalWinnings.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
});
