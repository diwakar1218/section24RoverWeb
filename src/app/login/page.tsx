"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Crosshair,
  ArrowRight,
  ShieldCheck,
  MapPinned,
  Radio,
} from "lucide-react";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { DEMO } from "@/services/api";
import { notify, errorMessage } from "@/lib/notifications";
const schema = z.object({
  username: z.string().min(1, "Enter your username").max(128),
  password: z.string().min(1, "Enter your password").max(256),
});
export default function Login() {
  const { signIn, enterDemo } = useAuth(),
    [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  return (
    <main className="login">
      <section className="login-story">
        <div className="brand">
          <Crosshair />
          <span>
            SURVEY<span className="brand-light">COMMAND</span>
          </span>
        </div>
        <span className="eyebrow">CENTRALIZED GNSS OPERATIONS</span>
        <h1>
          Every rover.
          <br />
          Every survey.
          <br />
          <em>One clear view.</em>
        </h1>
        <p>
          A connected view of your field operations. Monitor survey teams,
          receiver precision, and progress across every jurisdiction.
        </p>
        <div className="login-features">
          <span>
            <MapPinned />
            Jurisdiction-aware monitoring
          </span>
          <span>
            <Radio />
            Live field intelligence
          </span>
          <span>
            <ShieldCheck />
            Secure, accountable access
          </span>
        </div>
        <small>Trimble GNSS Rover Survey Monitoring & Management System</small>
      </section>
      <section className="login-form">
        <div className="login-form-inner">
          <span className="eyebrow">SURVEY OPERATIONS PLATFORM</span>
          <h2>Welcome back</h2>
          <p className="muted">Sign in with your organization account.</p>
          <form
            onSubmit={handleSubmit(async (values) => {
              setError("");
              try {
                await signIn(values.username, values.password);
              } catch (e) {
                notify(errorMessage(e));
                setError(
                  e instanceof Error
                    ? e.message
                    : "Unable to sign in. Check your connection.",
                );
              }
            }, (errors) => notify(Object.values(errors).find(error => error?.message)?.message ?? "Enter your username and password.", "warning"))}
          >
            <label htmlFor="username">Username</label>
            <input
              id="username"
              autoComplete="username"
              placeholder="Enter your username"
              {...register("username")}
            />
            {errors.username && (
              <small className="error-text">{errors.username.message}</small>
            )}
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              {...register("password")}
            />
            {errors.password && (
              <small className="error-text">{errors.password.message}</small>
            )}
            {error && (
              <div role="alert" className="error-box">
                {error}
              </div>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in securely"}
              <ArrowRight size={16} />
            </Button>
          </form>
          {DEMO && (
            <div className="demo-login">
              <span>DEVELOPMENT PREVIEW</span>
              <p>
                Explore the dashboard with simulated rovers. No real GNSS data.
              </p>
              <Button variant="outline" onClick={enterDemo}>
                Open demo workspace
                <ArrowRight size={15} />
              </Button>
            </div>
          )}
          <p className="login-note">
            <ShieldCheck size={14} /> Access is limited to your assigned
            permissions and jurisdiction. Contact your administrator for account
            support.
          </p>
        </div>
      </section>
    </main>
  );
}
