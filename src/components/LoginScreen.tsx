import { useState, type FormEvent, type ReactNode } from "react";
import { useStore } from "../store";

/* Brand marks for the social sign-in buttons. Inlined so they carry their own
   colours (Google) or currentColor (GitHub, Apple) and need no extra deps. */
const GoogleMark = (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);
const GithubMark = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.2-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.75.81 1.2 1.84 1.2 3.1 0 4.43-2.7 5.4-5.28 5.69.41.36.78 1.08.78 2.18v3.23c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" />
  </svg>
);
const AppleMark = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.05 12.66c-.03-2.68 2.19-3.97 2.29-4.03-1.25-1.83-3.19-2.08-3.88-2.11-1.65-.17-3.22.97-4.06.97-.83 0-2.12-.95-3.49-.92-1.79.03-3.45 1.04-4.37 2.65-1.86 3.23-.48 8 1.33 10.61.88 1.28 1.94 2.72 3.32 2.67 1.33-.05 1.84-.86 3.45-.86 1.6 0 2.06.86 3.47.83 1.43-.02 2.34-1.31 3.22-2.6 1.01-1.49 1.43-2.94 1.45-3.02-.03-.01-2.78-1.07-2.81-4.26zM14.5 4.87c.73-.89 1.22-2.12 1.09-3.35-1.05.04-2.32.7-3.07 1.58-.67.78-1.26 2.03-1.1 3.23 1.17.09 2.36-.6 3.08-1.46z" />
  </svg>
);

/** Bordered social sign-in button (Google / GitHub / Apple). */
function SocialButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable focusable flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border-border-strong border-[0.5px] text-body-sm font-medium text-primary-foreground transition-colors hover:bg-transparent-hover"
    >
      <span className="flex shrink-0 items-center justify-center">{icon}</span>
      {label}
    </button>
  );
}

/**
 * Temporary auth gate matching the reference sign-in card. Any email (or any
 * provider button) signs the user in — there's no real backend yet; it just
 * flips the persisted `authed` flag in the store so the app is reachable.
 */
export function LoginScreen() {
  const { signIn } = useStore();
  const [email, setEmail] = useState("");
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) signIn();
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center p-6" style={{ zIndex: 1 }}>
      <div
        className="login-card flex w-full max-w-[400px] flex-col rounded-2xl border-border-default border-[0.5px] bg-page px-7 py-9 shadow-default"
        style={{ boxShadow: "0 24px 70px -12px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(0,0,0,0.04)" }}
      >
        {/* Product mark */}
        <span
          className="mx-auto flex size-14 items-center justify-center rounded-full border-border-strong border-[0.5px] text-body-base font-semibold text-primary-foreground"
        >
          CO
        </span>

        <h1 className="mt-5 text-center text-heading-4 font-semibold text-primary-foreground">Sign in to Conduit</h1>
        <p className="mt-1.5 text-center text-body-sm text-tertiary-foreground">Sign in to your workspace.</p>

        {/* Email + primary action */}
        <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@work-email.com"
            autoFocus
            className="focusable h-11 w-full rounded-lg border-border-strong border-[0.5px] bg-card px-3.5 text-body-sm text-primary-foreground outline-none placeholder:text-tertiary-foreground"
          />
          <button
            type="submit"
            disabled={!valid}
            className="pressable focusable flex h-11 w-full items-center justify-center rounded-lg text-body-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
            style={{ background: "var(--color-primary-foreground)", color: "var(--color-page)" }}
          >
            Continue with Email
          </button>
        </form>

        {/* Divider */}
        <div className="my-6 h-px w-full" style={{ background: "var(--color-border-default)" }} />

        {/* Social sign-in */}
        <div className="flex flex-col gap-2.5">
          <SocialButton icon={GoogleMark} label="Continue with Google" onClick={signIn} />
          <SocialButton icon={GithubMark} label="Continue with GitHub" onClick={signIn} />
          <SocialButton icon={AppleMark} label="Continue with Apple" onClick={signIn} />
        </div>

        {/* Sign-up prompt */}
        <p className="mt-7 text-center text-body-sm text-tertiary-foreground">
          Don't have an account?{" "}
          <button
            type="button"
            onClick={signIn}
            className="focusable font-semibold text-primary-foreground hover:underline"
          >
            Sign Up
          </button>
        </p>

        {/* Terms */}
        <p className="mt-4 text-center text-[0.72rem] leading-5 text-tertiary-foreground">
          By proceeding, you agree to creating a Conduit account subject to our{" "}
          <span className="text-secondary-foreground">Terms of Service</span> and{" "}
          <span className="text-secondary-foreground">Privacy Policy</span>.
        </p>
      </div>
    </div>
  );
}
