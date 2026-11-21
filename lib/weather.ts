const labels: Record<number, string> = {
  0: "Helder",
  1: "Vrij helder",
  2: "Half bewolkt",
  3: "Bewolkt",
  45: "Mistig",
  48: "Mistig",
  51: "Motregen",
  53: "Motregen",
  55: "Motregen",
  61: "Regen",
  63: "Regen",
  65: "Regen",
  71: "Sneeuw",
  73: "Sneeuw",
  75: "Sneeuw",
  80: "Buien",
  81: "Buien",
  82: "Buien",
  95: "Onweer",
  96: "Onweer",
  99: "Onweer",
};

export function conditionLabel(code: number): string {
  return labels[code] ?? "Weer";
}

export function toFahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}
