import { GoogleGenAI, Type } from "@google/genai";
import { RouteData, BiometricData, RoutePoint } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function snapToRoads(points: RoutePoint[]): Promise<RoutePoint[]> {
  try {
    const coordinates = points.map(p => `${p.lng},${p.lat}`).join(';');
    const response = await fetch(`https://router.project-osrm.org/trip/v1/cycling/${coordinates}?source=first&destination=last&roundtrip=false&geometries=geojson&overview=full`);
    const data = await response.json();
    
    if (data.code === 'Ok' && data.trips?.[0]?.geometry?.coordinates) {
      return data.trips[0].geometry.coordinates.map((coord: [number, number]) => ({
        lat: coord[1],
        lng: coord[0]
      }));
    }
  } catch (error) {
    console.error('OSRM Snap Error:', error);
  }
  return points;
}

export async function generateRoute(
  prompt: string, 
  userLocation: { lat: number, lng: number },
  biometrics?: BiometricData
): Promise<RouteData> {
  const biometricContext = biometrics 
    ? `\nCURRENT BIOMETRICS: Heart Rate: ${biometrics.heartRate} bpm, Cadence: ${biometrics.cadence} rpm, Power: ${biometrics.power} watts. Use this to gauge the intensity of the proposed route.`
    : "";

  const result = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `User preference: ${prompt}. User current location: ${userLocation.lat}, ${userLocation.lng}.${biometricContext}`,
    config: {
      systemInstruction: `You are an elite cycling route engineer. 
    You identify 5-8 STRATEGIC WAYPOINTS for a high-performance cycling route based on user preference.
    PRIORITY: If the user explicitly mentions a city/location, find real cycling waypoints and landmarks in that city. 
    FALLBACK: Use waypoints near ${userLocation.lat}, ${userLocation.lng}.
    The waypoints must be known cycling roads or landmarks.
    Return a valid JSON object matching the RouteData interface.
    The 'path' should contain exactly 5-8 strategic coordinates that a routing engine will then snap to actual roads.
    The 'elevationProfile' should be 10 numbers representing the planned intensity.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          distanceKm: { type: Type.NUMBER },
          elevationGainM: { type: Type.NUMBER },
          description: { type: Type.STRING },
          path: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                lat: { type: Type.NUMBER },
                lng: { type: Type.NUMBER }
              },
              required: ["lat", "lng"]
            }
          },
          elevationProfile: {
            type: Type.ARRAY,
            items: { type: Type.NUMBER }
          }
        },
        required: ["name", "distanceKm", "elevationGainM", "path", "elevationProfile", "description"]
      }
    }
  });

  const rawRouteData = JSON.parse(result.text) as RouteData;
  
  // Snap the waypoints to actual roads using OSRM
  const snappedPath = await snapToRoads(rawRouteData.path);
  
  return {
    ...rawRouteData,
    path: snappedPath
  };
}
