export const UX_AREAS = {
  D: "Data clarity & trust",
  N: "Navigation & filters",
  M: "Mobile usability",
  A: "Accessibility & focus",
  V: "Hierarchy & recovery",
} as const;
export const UX_REQUIRED_CHECKS = ["D1", "D2", "D3", "D4", "N1", "N2", "N4", "A4"] as const;

type Area = keyof typeof UX_AREAS;
export interface UxCheck {
  id: string;
  criterion: string;
  status: "pass" | "fail" | "unverified";
  evidence: string[];
}

/** Twenty independently evidenced checks, half a point each; a weak area cannot hide in the total. */
export function scoreUx(checks: UxCheck[], blockers: string[]) {
  const expected = Object.keys(UX_AREAS).flatMap((area) => [1, 2, 3, 4].map((n) => `${area}${n}`));
  if (checks.length !== 20 || new Set(checks.map((c) => c.id)).size !== 20 || expected.some((id) => !checks.some((c) => c.id === id))) {
    throw new Error("The scorecard must contain each of D1–D4, N1–N4, M1–M4, A1–A4 and V1–V4 exactly once.");
  }
  for (const check of checks) {
    if (!["pass", "fail", "unverified"].includes(check.status)) throw new Error(`Invalid status for ${check.id}.`);
    if (check.status === "pass" && !check.evidence.some((e) => e.trim())) throw new Error(`${check.id} cannot pass without evidence.`);
  }
  const areas = (Object.keys(UX_AREAS) as Area[]).map((id) => ({
    id,
    label: UX_AREAS[id],
    score: checks.filter((c) => c.id.startsWith(id) && c.status === "pass").length * 0.5,
    maximum: 2,
  }));
  const total = areas.reduce((sum, area) => sum + area.score, 0);
  const blockingChecks = UX_REQUIRED_CHECKS.filter((id) => checks.find((c) => c.id === id)?.status !== "pass");
  return {
    total,
    maximum: 10,
    areas,
    unverified: checks.filter((c) => c.status === "unverified").map((c) => c.id),
    failed: checks.filter((c) => c.status === "fail").map((c) => c.id),
    blockingChecks,
    accepted: total >= 9 && areas.every((area) => area.score >= 1.5) && blockingChecks.length === 0 && blockers.length === 0,
  };
}

if (import.meta.main) {
  const card: { checks: UxCheck[]; blockers: string[] } = await Bun.file(new URL("../ux-scorecard.json", import.meta.url)).json();
  const result = scoreUx(card.checks, card.blockers);
  for (const area of result.areas) console.log(`${area.label}: ${area.score.toFixed(1)}/2`);
  console.log(`Overall: ${result.total.toFixed(1)}/10 — ${result.accepted ? "ACCEPTED" : "NEEDS IMPROVEMENT"}`);
  if (result.unverified.length) console.log(`Not awarded (unverified): ${result.unverified.join(", ")}`);
  if (result.failed.length) console.log(`Failed: ${result.failed.join(", ")}`);
  if (result.blockingChecks.length) console.log(`Required checks not passed: ${result.blockingChecks.join(", ")}`);
  if (card.blockers.length) console.log(`Blocking defects: ${card.blockers.join("; ")}`);
  process.exitCode = result.accepted ? 0 : 1;
}
