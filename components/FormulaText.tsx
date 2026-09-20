import { tokenize } from "@/lib/alphas/parser";
import { clsx } from "@/lib/format";

/** Cream-paper formula: forest green, matching the approved mockup. */
const PAPER: Record<string, string> = {
  fn: "text-[#2A6A42]",
  field: "text-[#1F4F32]",
  num: "text-[#3D7A52]",
  op: "text-[#4A6B55]",
  punct: "text-[#5C7463]",
  ws: "",
};

const DARK: Record<string, string> = {
  fn: "text-[#8FBF9A]",
  field: "text-paper",
  num: "text-mute",
  op: "text-faint",
  punct: "text-faint",
  ws: "",
};

export function FormulaText({
  src,
  className,
  surface = "paper",
}: {
  src: string;
  className?: string;
  surface?: "paper" | "dark";
}) {
  const tokens = tokenize(src);
  const map = surface === "paper" ? PAPER : DARK;
  return (
    <span className={clsx("font-formula", className)}>
      {tokens.map((t, i) => (
        <span key={i} className={map[t.kind]}>
          {t.text}
        </span>
      ))}
    </span>
  );
}
