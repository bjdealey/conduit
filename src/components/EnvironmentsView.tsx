import type { ReactNode } from "react";
import { GitBranch, Globe } from "lucide-react";
import { environments, type Environment } from "../data/environments";

const TONE_SOLID: Record<Environment["statusTone"], string> = {
  ok: "var(--grass-9)",
  warn: "var(--amber-9)",
  error: "var(--tomato-9)",
};
const TONE_PREFIX: Record<Environment["statusTone"], string> = {
  ok: "grass",
  warn: "amber",
  error: "tomato",
};

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[0.72rem] text-tertiary-foreground">{label}</span>
      <span className="truncate text-body-sm text-primary-foreground">{children}</span>
    </div>
  );
}

function EnvironmentCard({ env }: { env: Environment }) {
  const accent = TONE_PREFIX[env.statusTone];
  return (
    <div className="flex flex-col gap-3 rounded-xl border-border-default border-[0.5px] bg-page p-4 shadow-default">
      <div className="flex items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: TONE_SOLID[env.statusTone] }} />
        <span className="text-body-base font-medium text-primary-foreground">{env.name}</span>
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-[0.72rem] font-medium"
          style={{ background: `var(--${accent}-a3)`, color: `var(--${accent}-a11)` }}
        >
          {env.status}
        </span>
      </div>

      <span className="inline-flex items-center gap-1.5 truncate font-departure-mono text-[0.72rem] text-tertiary-foreground">
        <Globe size={13} strokeWidth={1.8} className="shrink-0" />
        {env.url}
      </span>

      <div className="h-px w-full" style={{ background: "var(--color-border-default)" }} />

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Meta label="Region">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>{env.regionFlag}</span>
            {env.region}
          </span>
        </Meta>
        <Meta label="Branch">
          <span className="inline-flex items-center gap-1.5 font-departure-mono text-[0.72rem]">
            <GitBranch size={13} strokeWidth={1.8} className="text-tertiary-foreground" />
            {env.branch}
          </span>
        </Meta>
        <Meta label="Latest release">
          <span className="font-departure-mono text-[0.72rem]">{env.release}</span>
        </Meta>
        <Meta label="Deployed">{env.deployedAgo}</Meta>
      </div>

      <div className="flex items-center gap-4 border-border-default border-t-[0.5px] pt-3 text-body-sm text-tertiary-foreground">
        <span>
          <span className="text-secondary-foreground">{env.surfaces}</span> surfaces
        </span>
        <span>
          <span className="text-secondary-foreground">{env.eventsPerMin}</span>/min
        </span>
      </div>
    </div>
  );
}

/** Environments — deployment targets shown as status cards. */
export function EnvironmentsView() {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="scrollbar-none flex-1 overflow-y-auto p-6">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4">
          {environments.map((env) => (
            <EnvironmentCard key={env.id} env={env} />
          ))}
        </div>
      </div>
    </div>
  );
}
