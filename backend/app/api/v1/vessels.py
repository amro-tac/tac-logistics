"""
AIS vessel position proxy.
Avoids CORS issues by proxying MarineTraffic requests server-side.
Requires a valid MarineTraffic API key passed by the client.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import httpx

router = APIRouter(prefix="/vessels", tags=["vessels"])


class VesselPosition(BaseModel):
    lat: float
    lng: float
    heading: float
    speed: float
    mmsi: str | None = None
    imo: str | None = None
    source: str = "marinetraffic"


@router.get("/position", response_model=VesselPosition)
async def get_vessel_position(
    name: str = Query(..., description="Vessel name (SHIPNAME)"),
    ais_key: str = Query(..., description="MarineTraffic API key"),
):
    """
    Proxy a vessel position lookup to MarineTraffic's getvessel API (v8).
    Returns current lat/lng/heading/speed for the named vessel.

    MarineTraffic API docs:
      https://www.marinetraffic.com/en/ais-api-services/documentation/api-service:getvessel

    Pricing: starts at ~$50/month for the Extended API tier.
    Free alternative: AISHub (http://www.aishub.net/api) — lower update frequency.
    """
    url = (
        f"https://services.marinetraffic.com/api/getvessel/v:8/{ais_key}"
        f"/timespan:10/protocol:jsono"
    )
    params = {"SHIPNAME": name.upper()}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            raise HTTPException(status_code=401, detail="Invalid AIS API key")
        raise HTTPException(status_code=502, detail="AIS provider error")
    except Exception:
        raise HTTPException(status_code=502, detail="AIS request failed")

    if not data or not isinstance(data, list) or len(data) == 0:
        raise HTTPException(status_code=404, detail=f"Vessel '{name}' not found in AIS data")

    vessel = data[0]
    try:
        return VesselPosition(
            lat=float(vessel["LAT"]),
            lng=float(vessel["LON"]),
            heading=float(vessel.get("HEADING") or vessel.get("COURSE") or 0),
            speed=float(vessel.get("SPEED") or 0),
            mmsi=str(vessel.get("MMSI") or ""),
            imo=str(vessel.get("IMO") or ""),
        )
    except (KeyError, ValueError, TypeError) as e:
        raise HTTPException(status_code=502, detail=f"Unexpected AIS response format: {e}")
