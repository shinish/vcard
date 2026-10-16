"""Address lookup, with a choice of provider.

Pick one with GEOCODER. The default needs no key; the others need an account
and give materially better coverage, which matters outside Europe and North
America where OpenStreetMap is thin.

    GEOCODER=photon        OSM, keyless, the default
    GEOCODER=nominatim     OSM, keyless, richer detail but fewer hits.
                           Its usage policy forbids per-keystroke queries, so
                           it is only sensible behind a search button.
    GEOCODER=mapbox        needs GEOCODER_KEY. 100k free lookups a month.
    GEOCODER=geoapify      needs GEOCODER_KEY. 3k free lookups a day.
    GEOCODER=locationiq    needs GEOCODER_KEY. 5k free lookups a day.

Every provider is normalised to the same shape, so switching is a config
change and nothing downstream notices.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from functools import lru_cache

from . import settings


def _provider_name() -> str:
    return (settings.get("geocoder", "photon") or "photon").strip().lower()


def _key() -> str:
    return settings.get("geocoder_key", "").strip()
PHOTON_URL = os.environ.get("PHOTON_URL", "https://photon.komoot.io/api")
NOMINATIM_URL = os.environ.get("NOMINATIM_URL", "https://nominatim.openstreetmap.org/search")
USER_AGENT = os.environ.get("GEOCODER_USER_AGENT", "vcard-contact-cards/0.1 (self-hosted)")
TIMEOUT = 8.0


class GeocoderError(RuntimeError):
    """The provider is misconfigured; the UI still lets people type an address."""


def _fetch(url: str) -> object | None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})  # noqa: S310
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:  # noqa: S310
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return None


def _address(
    street: str,
    city: str,
    region: str,
    postal: str,
    country: str,
    lat: float | None = None,
    lon: float | None = None,
) -> dict:
    return {
        "label": ", ".join(p for p in (street, city, region, postal, country) if p),
        "street": street,
        "city": city,
        "region": region,
        "postal": postal,
        "country": country,
        "lat": lat,
        "lon": lon,
    }


def _photon(query: str, country: str | None, limit: int) -> list[dict]:
    params = {"q": query, "limit": limit * 2 if country else limit, "lang": "en"}
    data = _fetch(f"{PHOTON_URL}?{urllib.parse.urlencode(params)}")
    if not isinstance(data, dict):
        return []
    out = []
    for feature in data.get("features", []):
        p = feature.get("properties") or {}
        parts = (p.get("housenumber"), p.get("street"))
        street = " ".join(s for s in parts if s) or p.get("name") or ""
        found = p.get("country") or ""
        # Photon has no country filter, so a search for a Muscat street can
        # come back with one in Dubai. Drop those rather than show them.
        if country and found and found.lower() != country.lower():
            continue
        coords = (feature.get("geometry") or {}).get("coordinates") or []
        row = _address(
            str(street),
            str(p.get("city") or p.get("town") or p.get("village") or p.get("county") or ""),
            str(p.get("state") or ""),
            str(p.get("postcode") or ""),
            str(found),
            lat=float(coords[1]) if len(coords) == 2 else None,
            lon=float(coords[0]) if len(coords) == 2 else None,
        )
        if any((row["street"], row["city"], row["country"])) and row not in out:
            out.append(row)
    return out[:limit]


def _nominatim(query: str, country: str | None, limit: int) -> list[dict]:
    params = {
        "q": query,
        "format": "jsonv2",
        "limit": limit,
        "addressdetails": 1,
        "accept-language": "en",
    }
    data = _fetch(f"{NOMINATIM_URL}?{urllib.parse.urlencode(params)}")
    if not isinstance(data, list):
        return []
    out = []
    for hit in data:
        a = hit.get("address") or {}
        parts = (a.get("house_number"), a.get("road"))
        street = " ".join(s for s in parts if s) or hit.get("name") or ""
        row = _address(
            str(street),
            str(a.get("city") or a.get("town") or a.get("village") or a.get("suburb") or ""),
            str(a.get("state") or a.get("county") or ""),
            str(a.get("postcode") or ""),
            str(a.get("country") or ""),
            lat=float(hit["lat"]) if hit.get("lat") else None,
            lon=float(hit["lon"]) if hit.get("lon") else None,
        )
        if any((row["street"], row["city"], row["country"])) and row not in out:
            out.append(row)
    return out


def _mapbox(query: str, country: str | None, limit: int) -> list[dict]:
    key = _key()
    if not key:
        raise GeocoderError("Mapbox needs an API key")
    params = {"q": query, "limit": limit, "access_token": key, "language": "en"}
    if country:
        params["country"] = country
    query_string = urllib.parse.urlencode(params)
    data = _fetch(f"https://api.mapbox.com/search/geocode/v6/forward?{query_string}")
    if not isinstance(data, dict):
        return []
    out = []
    for feature in data.get("features", []):
        p = feature.get("properties") or {}
        ctx = p.get("context") or {}
        row = _address(
            str(p.get("name") or ctx.get("address", {}).get("name") or ""),
            str(ctx.get("place", {}).get("name") or ""),
            str(ctx.get("region", {}).get("name") or ""),
            str(ctx.get("postcode", {}).get("name") or ""),
            str(ctx.get("country", {}).get("name") or ""),
        )
        if any((row["street"], row["city"], row["country"])) and row not in out:
            out.append(row)
    return out


def _geoapify(query: str, country: str | None, limit: int) -> list[dict]:
    key = _key()
    if not key:
        raise GeocoderError("Geoapify needs an API key")
    params = {"text": query, "limit": limit, "apiKey": key, "lang": "en", "format": "json"}
    if country:
        params["filter"] = f"countrycode:{country.lower()}"
    query_string = urllib.parse.urlencode(params)
    data = _fetch(f"https://api.geoapify.com/v1/geocode/autocomplete?{query_string}")
    if not isinstance(data, dict):
        return []
    out = []
    for r in data.get("results", []):
        parts = (r.get("housenumber"), r.get("street"))
        street = " ".join(s for s in parts if s) or r.get("name") or ""
        row = _address(
            str(street),
            str(r.get("city") or r.get("town") or r.get("village") or ""),
            str(r.get("state") or ""),
            str(r.get("postcode") or ""),
            str(r.get("country") or ""),
        )
        if any((row["street"], row["city"], row["country"])) and row not in out:
            out.append(row)
    return out


def _locationiq(query: str, country: str | None, limit: int) -> list[dict]:
    key = _key()
    if not key:
        raise GeocoderError("LocationIQ needs an API key")
    params = {"key": key, "q": query, "limit": limit, "format": "json",
              "addressdetails": 1, "accept-language": "en"}
    if country:
        params["countrycodes"] = country.lower()
    data = _fetch(f"https://us1.locationiq.com/v1/search?{urllib.parse.urlencode(params)}")
    if not isinstance(data, list):
        return []
    out = []
    for hit in data:
        a = hit.get("address") or {}
        parts = (a.get("house_number"), a.get("road"))
        street = " ".join(s for s in parts if s) or a.get("name") or ""
        row = _address(
            str(street),
            str(a.get("city") or a.get("town") or a.get("village") or ""),
            str(a.get("state") or ""),
            str(a.get("postcode") or ""),
            str(a.get("country") or ""),
        )
        if any((row["street"], row["city"], row["country"])) and row not in out:
            out.append(row)
    return out


PROVIDERS = {
    "photon": _photon,
    "nominatim": _nominatim,
    "mapbox": _mapbox,
    "geoapify": _geoapify,
    "locationiq": _locationiq,
}


@lru_cache(maxsize=512)
def search(query: str, country: str | None = None, limit: int = 6) -> tuple[dict, ...]:
    """Look up an address. An empty result is normal: the form stays typeable.

    The lru_cache above is the whole rate-limiting story, which is enough for
    a handful of admins. Put a real limiter in front if this ever gets busy.
    """
    query = query.strip()
    if len(query) < 3:
        return ()
    provider = PROVIDERS.get(_provider_name())
    if provider is None:
        return ()
    try:
        return tuple(provider(query, country, limit))
    except GeocoderError:
        raise
    except Exception:  # noqa: BLE001 - a lookup must never break the form
        return ()
