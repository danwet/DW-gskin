import { sessionUser, unauthorized } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * Address lookup for the appointment dialog. Photon is free and needs no key,
 * so the call runs on the server and never in the browser.
 */
export async function GET(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 3) return Response.json({ places: [] });

  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  // Photon kent geen Nederlands; zonder lang komen de plaatsnamen lokaal terug.
  url.searchParams.set("limit", "6");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "DW-Dashboard/1.0 (personal calendar assistant)" },
      cache: "no-store",
    });
  } catch {
    return Response.json({ places: [], error: "Adressen konden niet worden opgezocht." }, { status: 502 });
  }
  if (!response.ok) {
    return Response.json({ places: [], error: "Adressen konden niet worden opgezocht." }, { status: 502 });
  }

  const data = (await response.json().catch(() => null)) as {
    features?: {
      geometry?: { coordinates?: [number, number] };
      properties?: {
        name?: string;
        street?: string;
        housenumber?: string;
        postcode?: string;
        city?: string;
        town?: string;
        village?: string;
        country?: string;
      };
    }[];
  } | null;

  // Eindigt de vraag op een huisnummer? Dan eerst de treffers die dat nummer
  // echt hebben; Photon geeft bij twijfel ook straten zonder nummer terug en
  // die stonden dan bovenaan.
  const nummer = /\s(\d+[a-zA-Z]?)\s*$/.exec(query)?.[1] ?? null;
  const features = [...(data?.features ?? [])];
  if (nummer) {
    const rang = (feature: (typeof features)[number]) =>
      String(feature.properties?.housenumber ?? "").startsWith(nummer) ? 0 : 1;
    features.sort((a, b) => rang(a) - rang(b));
  }

  const places = features
    .map((feature) => {
      const p = feature.properties ?? {};
      const [lon, lat] = feature.geometry?.coordinates ?? [];
      const street = p.street ?? p.name ?? "";
      const line = [street, p.housenumber].filter(Boolean).join(" ").trim();
      const city = p.city ?? p.town ?? p.village ?? "";
      const tail = [p.postcode, city].filter(Boolean).join(" ");
      // Eén regel, in de volgorde die calendar-apps als adres herkennen.
      // België komt als "België / Belgique / Belgien" terug; één naam is genoeg.
      const country = p.country?.split("/")[0]?.trim() ?? "";
      const label = [line, tail, country].filter(Boolean).join(", ").trim();
      if (label.length <= 3) return null;
      return { label, lat: typeof lat === "number" ? lat : null, lon: typeof lon === "number" ? lon : null };
    })
    .filter((place): place is { label: string; lat: number | null; lon: number | null } => place !== null)
    .filter((place, index, all) => all.findIndex((other) => other.label === place.label) === index);

  return Response.json({ places });
}
