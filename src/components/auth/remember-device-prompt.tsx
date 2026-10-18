"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { getUserPinStatus } from "@/actions/pin";
import { PinInput } from "@/components/auth/pin-input";
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
      <div className="ui-card-lg ui-stack">
        <div>
          <h2 className="type-title">
            Remember {name.split(" ")[0] ?? "this account"}?
          </h2>
          <p className="type-body-sm type-muted mt-2">
            Save on this device for faster unlock. Use your account PIN, or
            create one if you have not set it yet.
          </p>
        </div>

        {error ? <p className="ui-alert ui-alert-error">{error}</p> : null}

        <div className="ui-stack-sm">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              setStep("loading-status");
            }}
            className="ui-btn ui-btn-primary ui-btn-block"
          >
            Remember with PIN
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={rememberWithoutPin}
            className="ui-btn ui-btn-secondary ui-btn-block"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Remember without PIN
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onSkip}
            className="ui-btn ui-btn-ghost ui-btn-block"
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  if (step === "loading-status") {
    return (
      <div className="ui-stack flex w-full flex-col items-center text-center">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--brand)]" />
        <p className="type-body-sm type-muted">Checking PIN…</p>
      </div>
    );
  }

  if (step === "enter-pin") {
    return (
      <div className="w-full">
        <PinInput
          title="Enter your PIN"
          subtitle={`Use your ${PIN_LENGTH}-digit account PIN to unlock on this device`}
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
          className="ui-btn ui-btn-ghost ui-btn-block mt-6"
        >
          Back
        </button>
      </div>
    );
  }

  if (step === "set-pin") {
    return (
      <div className="w-full">
        <PinInput
          title="Create a PIN"
          subtitle={`Set a ${PIN_LENGTH}-digit PIN once — you will reuse it on every device`}
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
          className="ui-btn ui-btn-ghost ui-btn-block mt-6"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <PinInput
        title="Confirm PIN"
        subtitle="Enter the same PIN again"
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
        className="ui-btn ui-btn-ghost ui-btn-block mt-6"
      >
        Back
      </button>
    </div>
  );
}
