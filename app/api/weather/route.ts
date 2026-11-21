import { conditionLabel } from "@/lib/weather";

export const dynamic = "force-dynamic";

type Point = {
  latitude: number;
  longitude: number;
  city: string | null;
  source: "gps" | "ip" | "city" | "vercel";
};

async function geocode(city: string): Promise<Point | null> {
  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as {
    results?: { latitude: number; longitude: number; name: string }[];
  };
  const hit = data.results?.[0];
  if (!hit) return null;
  return {
    latitude: hit.latitude,
    longitude: hit.longitude,
    city: hit.name,
    source: "city",
  };
}

async function fromIp(): Promise<Point | null> {
  const response = await fetch("https://ipwho.is/", {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    success?: boolean;
    latitude?: number;
    longitude?: number;
    city?: string;
  };
  if (!data.success || data.latitude == null || data.longitude == null) return null;
  return {
    latitude: data.latitude,
    longitude: data.longitude,
    city: data.city ?? null,
    source: "ip",
  };
}

async function locate(request: Request): Promise<Point | null> {
  const url = new URL(request.url);
  const city = url.searchParams.get("city")?.trim();
  if (city) return geocode(city);

  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)) {
    return { latitude: lat, longitude: lon, city: null, source: "gps" };
  }

  const headerLat = Number(request.headers.get("x-vercel-ip-latitude"));
  const headerLon = Number(request.headers.get("x-vercel-ip-longitude"));
  if (Number.isFinite(headerLat) && Number.isFinite(headerLon)) {
    return {
      latitude: headerLat,
      longitude: headerLon,
      city: request.headers.get("x-vercel-ip-city"),
      source: "vercel",
    };
  }

  return fromIp();
}

export async function GET(request: Request) {
  try {
    const point = await locate(request);
    if (!point) {
      return Response.json({ error: "location_unavailable" }, { status: 404 });
    }

    const forecast = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${point.latitude}&longitude=${point.longitude}&current=temperature_2m,weather_code&timezone=auto`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!forecast.ok) {
      return Response.json({ error: "forecast_unavailable" }, { status: 502 });
    }

    const data = (await forecast.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const temperature = data.current?.temperature_2m;
    const code = data.current?.weather_code;
    if (temperature == null || code == null) {
      return Response.json({ error: "forecast_unavailable" }, { status: 502 });
    }

    return Response.json({
      celsius: temperature,
      condition: conditionLabel(code),
      city: point.city,
      source: point.source,
    });
  } catch {
    return Response.json({ error: "weather_failed" }, { status: 502 });
  }
}
