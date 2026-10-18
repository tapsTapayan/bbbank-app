"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, KeyRound, ArrowLeft } from "lucide-react";
import { getUserPinStatus } from "@/actions/pin";
import { PinInput } from "@/components/auth/pin-input";
import { AuthBrandHero } from "@/components/brand/auth-shell";
import { PIN_LENGTH } from "@/lib/auth/pin-constants";

type Step = "ask" | "enter-pin" | "set-pin" | "confirm-pin" | "loading-status";

export function RememberDevicePrompt({
  name,
  onSkip,
  onRemember,
}: {
  name: string;
  onSkip: () => void;
  onRemember: (pin: string | null) => Promise<string | null>;
}) {
  const [step, setStep] = useState<Step>("ask");
  const [hasAccountPin, setHasAccountPin] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (step !== "loading-status") return;
    let cancelled = false;
    void (async () => {
      const status = await getUserPinStatus();
      if (cancelled) return;
      if (!status.ok) {
        setError(status.error);
        setStep("ask");
        return;
      }
      setHasAccountPin(status.hasPin);
      setPin("");
      setConfirm("");
      setError(null);
      setStep(status.hasPin ? "enter-pin" : "set-pin");
    })();
    return () => {
      cancelled = true;
    };
  }, [step]);

  function rememberWithoutPin() {
    setError(null);
    startTransition(async () => {
      const err = await onRemember(null);
      if (err) setError(err);
    });
  }

  function finishWithPin(confirmed: string) {
    setError(null);
    startTransition(async () => {
      const err = await onRemember(confirmed);
      if (err) {
        setError(err);
        setPin("");
        setConfirm("");
        if (hasAccountPin) {
          setStep("enter-pin");
        } else {
          setStep("set-pin");
        }
      }
    });
  }

  if (step === "ask") {
    return (
      <div className="w-full">
        <AuthBrandHero
          title={`Remember ${name.split(" ")[0] ?? "this account"}?`}
        />
        <div className="rl-auth-panel rl-stack">
          {error ? <p className="rl-alert rl-alert-error">{error}</p> : null}

          <div className="rl-stack-sm">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                setStep("loading-status");
              }}
              className="rl-btn rl-btn-primary rl-btn-lg rl-btn-block"
            >
              <KeyRound className="h-4 w-4" aria-hidden />
              Remember with PIN
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={rememberWithoutPin}
              className="rl-btn rl-btn-secondary rl-btn-block"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Remember without PIN
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onSkip}
              className="rl-btn rl-btn-ghost rl-btn-block"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "loading-status") {
    return (
      <div className="rl-auth-panel flex w-full flex-col items-center gap-3 py-12 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--brand)]" />
        <p className="type-body-sm type-muted">Checking PIN status…</p>
      </div>
    );
  }

  if (step === "enter-pin") {
    return (
      <div className="w-full">
        <AuthBrandHero title="Verify PIN" />
        <div className="rl-auth-panel rl-stack">
          <PinInput
            title="Enter PIN"
            value={pin}
            onChange={setPin}
            error={error}
            disabled={pending}
            onComplete={(next) => {
              setPin(next);
              finishWithPin(next);
            }}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPin("");
              setError(null);
              setStep("ask");
            }}
            className="rl-btn rl-btn-ghost rl-btn-block"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
        </div>
      </div>
    );
  }

  if (step === "set-pin") {
    return (
      <div className="w-full">
        <AuthBrandHero title="Set PIN" />
        <div className="rl-auth-panel rl-stack">
          <PinInput
            title="Create PIN"
            value={pin}
            onChange={setPin}
            error={error}
            disabled={pending}
            onComplete={(next) => {
              setPin(next);
              setConfirm("");
              setError(null);
              setStep("confirm-pin");
            }}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPin("");
              setStep("ask");
            }}
            className="rl-btn rl-btn-ghost rl-btn-block"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <AuthBrandHero title="Confirm PIN" />
      <div className="rl-auth-panel rl-stack">
        <PinInput
          title="Confirm PIN"
          value={confirm}
          onChange={setConfirm}
          error={error}
          disabled={pending}
          onComplete={(next) => {
            if (next !== pin) {
              setError("PINs do not match. Try again.");
              setConfirm("");
              return;
            }
            finishWithPin(next);
          }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setConfirm("");
            setPin("");
            setError(null);
            setStep("set-pin");
          }}
          className="rl-btn rl-btn-ghost rl-btn-block"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </button>
      </div>
    </div>
  );
}
