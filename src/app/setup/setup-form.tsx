"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { bootstrapAdmin } from "@/actions/users";
import { AuthBrandHero } from "@/components/brand/auth-shell";

export function SetupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    startTransition(async () => {
      const result = await bootstrapAdmin({ name, username, password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <div className="w-full">
      <AuthBrandHero title="Setup admin" />

      <form onSubmit={onSubmit} className="rl-auth-panel rl-stack">
        <label className="rl-field">
          <span className="rl-field-label">Administrator full name</span>
          <input
            required
            placeholder="Juan Dela Cruz"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rl-input"
          />
        </label>
        <label className="rl-field">
          <span className="rl-field-label">Admin username</span>
          <input
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rl-input font-mono"
            placeholder="fundadmin"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="rl-field">
            <span className="rl-field-label">Password</span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rl-input"
            />
          </label>
          <label className="rl-field">
            <span className="rl-field-label">Confirm password</span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="rl-input"
            />
          </label>
        </div>

        {error ? (
          <p className="rl-alert rl-alert-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rl-btn rl-btn-primary rl-btn-lg rl-btn-block mt-1"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ShieldCheck className="h-4 w-4" aria-hidden />
          )}
          {pending ? "Provisioning…" : "Create administrator"}
        </button>
      </form>
    </div>
  );
}
