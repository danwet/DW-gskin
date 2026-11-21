const labels: Record<number, string> = {
  0: "Clear outside",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Foggy",
  51: "Drizzle",
  53: "Drizzle",
  55: "Drizzle",
  61: "Rain outside",
  63: "Rain outside",
  65: "Rain outside",
  71: "Snow outside",
  73: "Snow outside",
  75: "Snow outside",
  80: "Showers",
  81: "Showers",
  82: "Showers",
  95: "Storms",
  96: "Storms",
  99: "Storms",
};

export function conditionLabel(code: number): string {
  return labels[code] ?? "Outside now";
}

export function toFahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}
