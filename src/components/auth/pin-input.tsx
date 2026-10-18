"use client";

import {
  useEffect,
  useId,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { Delete, Loader2 } from "lucide-react";
import { PIN_LENGTH } from "@/lib/auth/pin-constants";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

export type PinInputProps = {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (pin: string) => void;
  disabled?: boolean;
  error?: string | null;
  title: string;
  subtitle?: string;
  variant?: "auto" | "numpad" | "otp";
  autoFocus?: boolean;
};

function DigitsDisplay({ value }: { value: string }) {
  return (
    <div className="mb-6 flex items-center justify-center gap-3.5" aria-hidden>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => {
        const filled = i < value.length;
        return (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border-2 transition-all duration-150 ${
              filled
                ? "scale-110 border-[var(--brand)] bg-[var(--brand)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand)_18%,transparent)]"
                : "border-[var(--border-strong)] bg-[var(--surface-subtle)]"
            }`}
          />
        );
      })}
    </div>
  );
}

function NumpadPad({
  value,
  onChange,
  onComplete,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (pin: string) => void;
  disabled?: boolean;
}) {
  function pushDigit(digit: string) {
    if (disabled || value.length >= PIN_LENGTH) return;
    const next = value + digit;
    onChange(next);
    if (next.length === PIN_LENGTH) onComplete?.(next);
  }

  function backspace() {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  }

  return (
    <div className="grid grid-cols-3 gap-2.5">
      {KEYS.map((key, index) => {
        if (key === "") {
          return <span key={`empty-${index}`} />;
        }
        if (key === "back") {
          return (
            <button
              key="back"
              type="button"
              disabled={disabled}
              onClick={backspace}
              aria-label="Delete digit"
              className="flex h-14 cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-transparent text-[var(--ink-secondary)] transition hover:bg-[var(--surface-hover)] active:scale-95 disabled:opacity-45"
            >
              <Delete className="h-5 w-5" />
            </button>
          );
        }
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => pushDigit(key)}
            className="flex h-14 cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] font-mono text-lg font-semibold text-[var(--ink)] shadow-2xs transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft)] active:scale-95 disabled:opacity-45"
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}

function OtpBoxes({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  labelledBy,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (pin: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  labelledBy: string;
}) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: PIN_LENGTH }, (_, i) => value[i] ?? "");
  const completedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    const mq = window.matchMedia("(min-width: 1280px)");
    if (!mq.matches) return;
    const firstEmpty = Math.min(value.length, PIN_LENGTH - 1);
    inputsRef.current[firstEmpty]?.focus();
  }, [autoFocus, disabled, value.length]);

  function setAt(index: number, char: string) {
    if (disabled) return;
    const nextDigits = [...digits];
    nextDigits[index] = char;
    const next = nextDigits.join("").slice(0, PIN_LENGTH);
    onChange(next);
    if (next.length === PIN_LENGTH) {
      if (completedRef.current !== next) {
        completedRef.current = next;
        onComplete?.(next);
      }
    } else {
      completedRef.current = null;
      if (char && index < PIN_LENGTH - 1) {
        inputsRef.current[index + 1]?.focus();
      }
    }
  }

  function onKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[index]) {
        setAt(index, "");
        return;
      }
      if (index > 0) {
        setAt(index - 1, "");
        inputsRef.current[index - 1]?.focus();
      }
      return;
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
      return;
    }
    if (e.key === "ArrowRight" && index < PIN_LENGTH - 1) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    if (disabled) return;
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, PIN_LENGTH);
    if (!pasted) return;
    onChange(pasted);
    if (pasted.length === PIN_LENGTH) {
      if (completedRef.current !== pasted) {
        completedRef.current = pasted;
        onComplete?.(pasted);
      }
      inputsRef.current[PIN_LENGTH - 1]?.focus();
    } else {
      completedRef.current = null;
      inputsRef.current[pasted.length]?.focus();
    }
  }

  return (
    <div
      className="flex items-center justify-center gap-2.5"
      role="group"
      aria-labelledby={labelledBy}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          type="password"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          pattern="\d*"
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${PIN_LENGTH}`}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "");
            if (!raw) {
              setAt(index, "");
              return;
            }
            setAt(index, raw.slice(-1));
          }}
          onKeyDown={(e) => onKeyDown(index, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          className="h-14 w-11 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-subtle)] text-center font-mono text-xl font-bold text-[var(--ink)] transition focus:border-[var(--brand)] focus:bg-[var(--surface-elevated)] focus:outline-none focus:ring-[3px] focus:ring-[color-mix(in_oklab,var(--brand)_22%,transparent)] disabled:opacity-50"
        />
      ))}
    </div>
  );
}

export function PinInput({
  value,
  onChange,
  onComplete,
  disabled,
  error,
  title,
  subtitle,
  variant = "auto",
  autoFocus = true,
}: PinInputProps) {
  const titleId = useId();
  const showNumpad = variant === "numpad" || variant === "auto";
  const showOtp = variant === "otp" || variant === "auto";

  return (
    <div className="w-full">
      <div className="mb-5 text-center">
        <h2 id={titleId} className="type-title">
          {title}
        </h2>
        {subtitle ? (
          <p className="type-caption mt-1">{subtitle}</p>
        ) : null}
      </div>

      {error ? (
        <p className="rl-alert rl-alert-error mb-4 justify-center text-center">
          {error}
        </p>
      ) : null}

      {disabled ? (
        <div className="mb-4 flex justify-center text-[var(--brand)]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : null}

      {showNumpad ? (
        <div className={variant === "auto" ? "xl:hidden" : undefined}>
          <DigitsDisplay value={value} />
          <NumpadPad
            value={value}
            onChange={onChange}
            onComplete={onComplete}
            disabled={disabled}
          />
        </div>
      ) : null}

      {showOtp ? (
        <div className={variant === "auto" ? "hidden xl:block" : undefined}>
          <OtpBoxes
            value={value}
            onChange={onChange}
            onComplete={onComplete}
            disabled={disabled}
            autoFocus={autoFocus && (variant === "otp" || variant === "auto")}
            labelledBy={titleId}
          />
        </div>
      ) : null}
    </div>
  );
}

export const PinPad = PinInput;
