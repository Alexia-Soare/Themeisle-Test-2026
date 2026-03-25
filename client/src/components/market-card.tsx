import { Market } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "@tanstack/react-router";

interface MarketCardProps {
  market: Market;
}

export function MarketCard({ market }: MarketCardProps) {
  const navigate = useNavigate();

  const handleCardClick = () => {
    navigate({ to: `/markets/${market.id}` });
  };

  return (
    <Card
      className="cursor-pointer rounded-xl transition-all hover:shadow-lg"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl">{market.title}</CardTitle>
            <CardDescription>By: {market.creator || "Unknown"}</CardDescription>
          </div>
          <Badge
            variant={
              market.status === "active"
                ? "default"
                : market.status === "archived"
                  ? "outline"
                  : "secondary"
            }
          >
            {market.status === "active"
              ? "Active"
              : market.status === "archived"
                ? "Archived"
                : "Resolved"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {/* Outcomes */}
        <div className="space-y-2">
          {market.outcomes.map((outcome) => (
            <div
              key={outcome.id}
              className="flex items-center justify-between rounded-md bg-secondary/20 p-3"
            >
              <div>
                <p className="text-sm font-medium">{outcome.title}</p>
                <p className="text-xs text-muted-foreground">
                  ${outcome.totalBets.toFixed(2)} total
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">{outcome.odds}%</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto space-y-4">
          {/* Total Market Value */}
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">Total Market Value</p>
            <p className="text-2xl font-bold text-primary">
              ${market.totalMarketBets.toFixed(2)}
            </p>
          </div>

          {/* Action Button */}
          <Button className="w-full" onClick={(e) => e.stopPropagation()}>
            {market.status === "active"
              ? "Place Bet"
              : market.status === "archived"
                ? "View Market"
                : "View Results"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
