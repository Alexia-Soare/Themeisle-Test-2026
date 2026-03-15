import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function ProfilePage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

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