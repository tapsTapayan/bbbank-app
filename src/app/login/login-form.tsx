"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ArrowLeft, KeyRound, Lock } from "lucide-react";
import {
  completeSignIn,
  registerRememberedDevice,
  revokeRememberedDevice,
  touchRememberedDevice,
  unlockWithPin,
} from "@/actions/auth";
import { resolveLoginIdentifier } from "@/actions/users";
import { AccountRoster } from "@/components/auth/account-roster";
import { PinInput } from "@/components/auth/pin-input";
import { RememberDevicePrompt } from "@/components/auth/remember-device-prompt";
import {
  readRememberedAccounts,
  removeRememberedAccount,
  touchRememberedAccount,
  upsertRememberedAccount,
  type RememberedAccount,
} from "@/lib/auth/remembered-accounts";
import { AuthBrandHero } from "@/components/brand/auth-shell";
import { createClient } from "@/lib/supabase/client";

type Step = "loading" | "roster" | "password" | "pin" | "remember";

type PendingRedirect = {
  redirectTo: string;
  synced: boolean;
  userId: string;
  name: string;
  loginId: string;
  role: RememberedAccount["role"];
};

async function finishRedirect(
  router: ReturnType<typeof useRouter>,
  pending: PendingRedirect,
) {
  const supabase = createClient();
  if (pending.synced) {
    await supabase.auth.refreshSession();
  }
  router.replace(pending.redirectTo);
  router.refresh();
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [step, setStep] = useState<Step>("loading");
  const [accounts, setAccounts] = useState<RememberedAccount[]>([]);
  const [selected, setSelected] = useState<RememberedAccount | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [identifierLocked, setIdentifierLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingRedirect, setPendingRedirect] =
    useState<PendingRedirect | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function showSavedOrPassword() {
      const saved = readRememberedAccounts();
      if (cancelled) return;
      setAccounts(saved);
      setStep(saved.length > 0 ? "roster" : "password");
    }

    async function boot() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        if (!data.session) {
          await showSavedOrPassword();
          return;
        }

        const result = await completeSignIn(next);
        if (cancelled) return;

        if (!result.ok) {
          if (result.redirectTo) {
            router.replace(result.redirectTo);
            router.refresh();
            return;
          }
          setError(result.error);
          await showSavedOrPassword();
          return;
        }

        const saved = readRememberedAccounts();
        const alreadyRemembered = saved.some((a) => a.userId === result.userId);
        if (alreadyRemembered) {
          touchRememberedAccount(result.userId);
          await finishRedirect(router, result);
          return;
        }

        setPendingRedirect(result);
        setStep("remember");
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not check session.",
        );
        await showSavedOrPassword();
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  function goPassword(prefill?: RememberedAccount | null) {
    setError(null);
    setPassword("");
    setPin("");
    if (prefill) {
      setSelected(prefill);
      setIdentifier(prefill.loginId.replace(/^@/, ""));
      setIdentifierLocked(true);
    } else {
      setSelected(null);
      setIdentifier("");
      setIdentifierLocked(false);
    }
    setStep("password");
  }

  function onSelectAccount(account: RememberedAccount) {
    setError(null);
    setSelected(account);
    if (account.hasPin) {
      setPin("");
      setStep("pin");
      return;
    }
    goPassword(account);
  }

  function onRemoveAccount(account: RememberedAccount) {
    setError(null);
    startTransition(async () => {
      const result = await revokeRememberedDevice({
        deviceCredentialId: account.deviceCredentialId,
        deviceToken: account.deviceToken,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const nextAccounts = removeRememberedAccount(account.userId);
      setAccounts(nextAccounts);
      if (selected?.userId === account.userId) {
        setSelected(null);
      }
      if (nextAccounts.length === 0) {
        goPassword(null);
      }
    });
  }

  function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const resolved = await resolveLoginIdentifier(identifier);
      if (!resolved.ok) {
        setError(resolved.error);
        return;
      }

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: resolved.authEmail,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }

      const result = await completeSignIn(next);
      if (!result.ok) {
        if (result.redirectTo) {
          router.replace(result.redirectTo);
          router.refresh();
          return;
        }
        setError(result.error);
        return;
      }

      if (selected) {
        await touchRememberedDevice({
          deviceCredentialId: selected.deviceCredentialId,
          deviceToken: selected.deviceToken,
        });
        touchRememberedAccount(selected.userId);
        await finishRedirect(router, result);
        return;
      }

      const saved = readRememberedAccounts();
      if (saved.some((a) => a.userId === result.userId)) {
        touchRememberedAccount(result.userId);
        await finishRedirect(router, result);
        return;
      }

      setPendingRedirect(result);
      setStep("remember");
    });
  }

  function onPinComplete(nextPin: string) {
    if (!selected) return;
    setError(null);
    setPin(nextPin);
    startTransition(async () => {
      const result = await unlockWithPin({
        deviceCredentialId: selected.deviceCredentialId,
        deviceToken: selected.deviceToken,
        pin: nextPin,
        next,
      });
      if (!result.ok) {
        setError(result.error);
        setPin("");
        return;
      }
      touchRememberedAccount(selected.userId);
      await finishRedirect(router, result);
    });
  }

  async function onRemember(pinValue: string | null): Promise<string | null> {
    if (!pendingRedirect) return "Session expired. Sign in again.";

    const registered = await registerRememberedDevice({
      pin: pinValue,
      label:
        typeof navigator !== "undefined"
          ? navigator.userAgent.slice(0, 120)
          : null,
    });
    if (!registered.ok) return registered.error;

    upsertRememberedAccount({
      userId: registered.userId,
      name: registered.name,
      loginId: registered.loginId,
      role: registered.role,
      deviceCredentialId: registered.deviceCredentialId,
      deviceToken: registered.deviceToken,
      hasPin: registered.hasPin,
      lastUsedAt: new Date().toISOString(),
    });

    await finishRedirect(router, pendingRedirect);
    return null;
  }

  function onSkipRemember() {
    if (!pendingRedirect) return;
    startTransition(async () => {
      await finishRedirect(router, pendingRedirect);
    });
  }

  if (step === "loading") {
    return (
      <div className="rl-auth-panel flex w-full flex-col items-center gap-3 py-12 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--brand)]" />
        <p className="type-body-sm type-muted">Verifying session…</p>
      </div>
    );
  }

  if (step === "remember" && pendingRedirect) {
    return (
      <RememberDevicePrompt
        name={pendingRedirect.name}
        onSkip={onSkipRemember}
        onRemember={onRemember}
      />
    );
  }

  if (step === "roster") {
    return (
      <div className="w-full">
        <AccountRoster
          accounts={accounts}
          onSelect={onSelectAccount}
          onRemove={onRemoveAccount}
          onAddAnother={() => goPassword(null)}
        />
        {error ? (
          <p className="rl-alert rl-alert-error mt-4" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (step === "pin" && selected) {
    return (
      <div className="w-full">
        <AuthBrandHero
          title={`Hi, ${selected.name.split(" ")[0] ?? selected.name}`}
          subtitle={selected.loginId}
        />
        <div className="rl-auth-panel rl-stack">
          <PinInput
            title="Enter 6-digit PIN"
            subtitle="Unlock your account on this device"
            value={pin}
            onChange={setPin}
            onComplete={onPinComplete}
            disabled={pending}
            error={error}
          />
          <div className="flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-4">
            <button
              type="button"
              disabled={pending}
              onClick={() => goPassword(selected)}
              className="rl-btn rl-btn-secondary rl-btn-block"
            >
              <KeyRound className="h-4 w-4" aria-hidden />
              Sign in with password instead
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                setSelected(null);
                setPin("");
                setStep(accounts.length > 0 ? "roster" : "password");
              }}
              className="rl-btn rl-btn-ghost rl-btn-block"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Switch account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <AuthBrandHero
        title="Sign in to BBB"
        subtitle="Enter your member email or staff username"
      />

      <form onSubmit={onPasswordSubmit} className="rl-auth-panel rl-stack">
        <label className="rl-field">
          <span className="rl-field-label">Email or username</span>
          <input
            type="text"
            autoComplete="username"
            required
            placeholder="you@example.com or staff username"
            value={identifier}
            readOnly={identifierLocked}
            onChange={(e) => setIdentifier(e.target.value)}
            className="rl-input"
          />
        </label>
        <label className="rl-field">
          <span className="rl-field-label">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rl-input"
          />
        </label>

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
            <Lock className="h-4 w-4" aria-hidden />
          )}
          {pending ? "Signing in…" : "Sign in"}
        </button>

        {accounts.length > 0 ? (
          <div className="border-t border-[var(--border-subtle)] pt-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep("roster");
              }}
              className="rl-btn rl-btn-ghost rl-btn-block"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to saved accounts ({accounts.length})
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
