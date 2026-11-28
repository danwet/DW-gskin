/**
 * Landen die uit een adres mogen verdwijnen: in de app is de plaats genoeg, en
 * een locatieveld dat eindigt op ", Nederland" leest rommelig.
 */
const LANDEN = new Set([
  "nederland",
  "netherlands",
  "holland",
  "belgië",
  "belgie",
  "belgium",
  "duitsland",
  "germany",
  "deutschland",
  "frankrijk",
  "france",
  "luxemburg",
  "luxembourg",
  "verenigd koninkrijk",
  "united kingdom",
  "engeland",
  "great britain",
]);

/** "Kerkstraat 5, 9890 Dikkelvenne, België" → "Kerkstraat 5, 9890 Dikkelvenne". */
export function zonderLand(adres: string): string {
  const delen = adres.split(",").map((deel) => deel.trim());
  while (delen.length > 1) {
    const laatste = delen[delen.length - 1] ?? "";
    if (!LANDEN.has(laatste.toLowerCase())) break;
    delen.pop();
  }
  return delen.filter(Boolean).join(", ");
}

/**
 * Haalt de postcode uit een adres: "5481 AL Schijndel" → "Schijndel".
 * Alleen in de delen ná de straat, want "Dorpsstraat 1234" is een huisnummer.
 */
export function zonderPostcode(adres: string): string {
  const delen = adres.split(",").map((deel) => deel.trim());
  return delen
    .map((deel, index) => {
      if (index === 0) return deel;
      return deel
        .replace(/\b\d{4}\s?[A-Za-z]{2}\b/g, " ")
        .replace(/\b\d{4}\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    })
    .filter(Boolean)
    .join(", ");
}
