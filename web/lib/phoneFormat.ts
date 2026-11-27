// US-style phone mask for the business info form (H-053): "(754) 800-5084", progressive while typing.
// International numbers ("+44 ...", "+52 ...") are left as typed apart from trimming.

export function formatPhone(raw: string | null | undefined): string {
  const input = (raw ?? "").trim();
  if (!input) return "";
  const digitsAll = input.replace(/\D/g, "");
  if (input.startsWith("+") && !digitsAll.startsWith("1")) return input.slice(0, 20);
  // "+1 ..." or "1 ..." country prefix: drop it, the mask is the 10-digit national number.
  const national = digitsAll.startsWith("1") && (input.startsWith("+") || digitsAll.length > 10) ? digitsAll.slice(1) : digitsAll;
  const d = national.slice(0, 10);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
