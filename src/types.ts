export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteData {
  name: string;
  distanceKm: number;
  elevationGainM: number;
  path: RoutePoint[];
  elevationProfile: number[]; // Array of elevation values
  description: string;
}

export interface BiometricData {
  heartRate: number;
  cadence: number;
  power: number;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  route?: RouteData;
}
