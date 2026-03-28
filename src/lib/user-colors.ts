// Friendly color palette for user avatars on shared carts/lists
// Colors are assigned sequentially per cart/list to guarantee each user gets a unique color.
const USER_COLORS = [
  { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-200" },
  { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-200" },
  { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  { bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-200" },
  { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  { bg: "bg-cyan-100", text: "text-cyan-700", border: "border-cyan-200" },
  { bg: "bg-fuchsia-100", text: "text-fuchsia-700", border: "border-fuchsia-200" },
  { bg: "bg-lime-100", text: "text-lime-700", border: "border-lime-200" },
  { bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-200" },
] as const;

export type UserColor = (typeof USER_COLORS)[number];

/**
 * Creates a color map that assigns a unique color to each user (by email).
 * Colors are assigned in order of first appearance — no two users share a color
 * (up to 10 users; beyond that it wraps).
 *
 * Call once per cart/list load, then use the returned `getColor` function.
 */
export function createUserColorMap() {
  const map = new Map<string, UserColor>();
  let nextIndex = 0;

  return {
    /** Get the color for a user email, assigning a new one if first seen */
    getColor(email: string): UserColor {
      let color = map.get(email);
      if (!color) {
        color = USER_COLORS[nextIndex % USER_COLORS.length];
        nextIndex++;
        map.set(email, color);
      }
      return color;
    },
  };
}

/** Get the initial letter for an email (first char before @) */
export function getUserInitial(email: string): string {
  return (email.split("@")[0]?.[0] ?? "?").toUpperCase();
}
