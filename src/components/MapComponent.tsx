import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RoutePoint } from '../types';

export type MapLayerType = 'dark' | 'light' | 'terrain' | 'cycling' | 'traffic';

interface MapComponentProps {
  path: RoutePoint[] | null;
  userLocation: RoutePoint | null;
  zoomLevel?: number;
  activeLayers: Set<MapLayerType>;
  recenterTrigger?: number;
}

export default function MapComponent({ path, userLocation, zoomLevel, activeLayers, recenterTrigger }: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const layersRef = useRef<Record<string, L.Layer>>({});

  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: true,
        dragging: true,
      }).setView(userLocation || [34.0522, -118.2437], 13);

      const tomtomKey = import.meta.env.VITE_TOMTOM_API_KEY;

      const darkUrl = tomtomKey 
        ? `https://api.tomtom.com/map/1/tile/basic/night/{z}/{x}/{y}.png?key=${tomtomKey}` 
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      
      const lightUrl = tomtomKey
        ? `https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${tomtomKey}`
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        
      const trafficUrl = tomtomKey
        ? `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${tomtomKey}`
        : 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png';

      layersRef.current.dark = L.tileLayer(darkUrl, {
        maxZoom: 22,
      });

      layersRef.current.light = L.tileLayer(lightUrl, {
        maxZoom: 22,
      });

      layersRef.current.terrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
      });

      layersRef.current.cycling = L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
        maxZoom: 18,
      });

      layersRef.current.traffic = L.tileLayer(trafficUrl, {
        maxZoom: 22,
      });
    }

    // Handle Layer Visibility
    if (mapRef.current) {
      // Base Layers (exclusive)
      if (activeLayers.has('terrain')) {
        layersRef.current.dark?.remove();
        layersRef.current.light?.remove();
        layersRef.current.terrain?.addTo(mapRef.current);
      } else if (activeLayers.has('light')) {
        layersRef.current.dark?.remove();
        layersRef.current.terrain?.remove();
        layersRef.current.light?.addTo(mapRef.current);
      } else {
        layersRef.current.terrain?.remove();
        layersRef.current.light?.remove();
        layersRef.current.dark?.addTo(mapRef.current);
      }

      // Overlays
      if (activeLayers.has('cycling')) {
        layersRef.current.cycling?.addTo(mapRef.current);
      } else {
        layersRef.current.cycling?.remove();
      }

      if (activeLayers.has('traffic')) {
        layersRef.current.traffic?.addTo(mapRef.current);
      } else {
        layersRef.current.traffic?.remove();
      }
    }

    return () => {
      // Don't remove map on every layer change
    };
  }, [activeLayers]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (mapRef.current && userLocation) {
      mapRef.current.panTo([userLocation.lat, userLocation.lng]);
    }
  }, [userLocation]);

  useEffect(() => {
    if (mapRef.current && userLocation && recenterTrigger !== undefined && recenterTrigger > 0) {
      mapRef.current.flyTo([userLocation.lat, userLocation.lng], 15, {
        duration: 1.5,
        easeLinearity: 0.25
      });
    }
  }, [recenterTrigger]);

  useEffect(() => {
    if (mapRef.current && path && path.length > 0) {
      if (polylineRef.current) {
        polylineRef.current.remove();
      }

      const latLngs = path.map(p => [Number(p.lat), Number(p.lng)] as L.LatLngExpression);
      polylineRef.current = L.polyline(latLngs, {
        color: '#ff5722',
        weight: 6,
        opacity: 0.9,
        lineJoin: 'round'
      }).addTo(mapRef.current);

      const bounds = L.latLngBounds(latLngs);
      mapRef.current.flyToBounds(bounds, { 
        padding: [50, 50],
        duration: 2,
        easeLinearity: 0.25
      });
    } else if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }
  }, [path]);

  useEffect(() => {
    if (mapRef.current && zoomLevel !== undefined) {
      mapRef.current.setZoom(zoomLevel);
    }
  }, [zoomLevel]);

  return (
    <div ref={mapContainerRef} className="w-full h-full z-0 pointer-events-auto" />
  );
}
