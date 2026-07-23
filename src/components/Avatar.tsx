import type { Member } from "../data/types";

/** Small square avatar with the member's initials, tinted by their accent. */
export function Avatar({ member, size = 24 }: { member: Member; size?: number }) {
  return (
    <div
      title={member.name}
      className="flex shrink-0 items-center justify-center rounded-md font-medium"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: `var(--${member.accent}-a3)`,
        color: `var(--${member.accent}-a11)`,
      }}
    >
      {member.initials}
    </div>
  );
}
