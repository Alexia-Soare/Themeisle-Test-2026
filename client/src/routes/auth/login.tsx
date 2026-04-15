import { useForm } from "@tanstack/react-form";
import { useNavigate, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async (formData) => {
      const values = formData.value;
      try {
        setIsLoading(true);
        setError(null);
        const user = await api.login(values.email, values.password);
        login(user);
        navigate({ to: "/" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Login failed");
      } finally {
        setIsLoading(false);
      }
    },
  });

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/4 h-128 w-lg rounded-full blur-3xl" style={{ background: "oklch(0.6 0.2 295 / 10%)" }} />
        <div className="absolute top-1/3 right-1/4 h-96 w-96 rounded-full blur-3xl" style={{ background: "oklch(0.65 0.18 145 / 8%)" }} />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 h-64 w-64 rounded-full blur-3xl" style={{ background: "oklch(0.55 0.22 310 / 9%)" }} />
      </div>
      <Card className="relative z-10 w-full max-w-md animate-fade-in-up">
        <CardHeader className="space-y-2">
          <CardTitle className="text-3xl">Login</CardTitle>
          <CardDescription>Enter your credentials to access your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
            className="space-y-6"
          >
            <form.Field name="email">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="you@example.com"
                    disabled={isLoading}
                  />
                  {field.state.meta.errors && (
                    <p className="text-xs text-destructive">{field.state.meta.errors.join(", ")}</p>
                  )}
                </div>
              )}
            </form.Field>

            <form.Field name="password">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="••••••••"
                    disabled={isLoading}
                  />
                  {field.state.meta.errors && (
                    <p className="text-xs text-destructive">{field.state.meta.errors.join(", ")}</p>
                  )}
                </div>
              )}
            </form.Field>

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Logging in..." : "Login"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <a href="/auth/register" className="font-medium text-primary hover:underline">
              Sign up
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/auth/login")({
  component: LoginPage,
});
