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
  /**
   * Force layout. Default (`auto`): mobile/tablet numpad; desktop OTP boxes
   * from the `xl` breakpoint (1280px) so iPads keep the phone-style pad.
   */
  variant?: "auto" | "numpad" | "otp";
  autoFocus?: boolean;
};

function DigitsDisplay({ value }: { value: string }) {
  return (
    <div className="mb-6 flex items-center justify-center gap-3" aria-hidden>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <span
          key={i}
          className={`h-3 w-3 rounded-full border transition ${
            i < value.length
              ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]"
              : "border-[var(--border)] bg-transparent"
          }`}
        />
      ))}
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
    <div className="grid grid-cols-3 gap-2">
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
              aria-label="Delete"
              className="flex h-14 items-center justify-center rounded-[var(--radius)] text-[var(--ink)] hover:bg-[var(--surface)] disabled:opacity-50"
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
            className="flex h-14 items-center justify-center rounded-[var(--radius)] type-title text-[var(--ink)] hover:bg-[var(--surface)] disabled:opacity-50"
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
    // Match Tailwind `xl` — tablets stay on the numpad path.
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
      className="flex items-center justify-center gap-2 sm:gap-3"
      role="group"
      aria-labelledby={labelledBy}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          type="text"
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
          className="h-12 w-10 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-elevated)] text-center type-title text-[var(--ink)] shadow-none transition focus:border-[var(--brand-accent)] focus:outline-none focus:ring-[3px] focus:ring-[color-mix(in_oklab,var(--brand-accent)_22%,transparent)] disabled:opacity-50 sm:h-14 sm:w-12"
        />
      ))}
    </div>
  );
}

/**
 * Responsive PIN entry: mobile numpad + dots; desktop 6-box OTP (no numpad).
 */
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
      <div className="mb-6 text-center">
        <h2 id={titleId} className="type-heading">
          {title}
        </h2>
        {subtitle ? (
          <p className="type-body-sm type-muted mt-2">{subtitle}</p>
        ) : null}
      </div>

      {error ? (
        <p className="ui-alert ui-alert-error mb-4 text-center">{error}</p>
      ) : null}

      {disabled ? (
        <div className="mb-4 flex justify-center text-[var(--ink-muted)]">
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

/** @deprecated Use PinInput — kept as alias for existing imports. */
export const PinPad = PinInput;
