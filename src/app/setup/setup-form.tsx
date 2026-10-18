"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
      <AuthBrandHero
        title="Create admin"
        subtitle="One-time setup · username sign-in"
      />

      <form onSubmit={onSubmit} className="ui-auth-panel ui-stack-sm">
        <label className="ui-field">
          <span className="ui-field-label">Full name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="ui-input"
          />
        </label>
        <label className="ui-field">
          <span className="ui-field-label">Username</span>
          <input
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="ui-input"
            placeholder="fundadmin"
          />
        </label>
        <label className="ui-field">
          <span className="ui-field-label">Password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="ui-input"
          />
        </label>
        <label className="ui-field">
          <span className="ui-field-label">Confirm password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="ui-input"
          />
        </label>

        {error ? (
          <p className="ui-alert ui-alert-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="ui-btn ui-btn-primary ui-btn-block"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Creating…" : "Create admin"}
        </button>
      </form>
    </div>
  );
}
