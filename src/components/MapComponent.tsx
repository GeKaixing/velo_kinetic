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
  routeFocusTrigger?: number;
}

export default function MapComponent({ path, userLocation, zoomLevel, activeLayers, recenterTrigger, routeFocusTrigger }: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
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
        zIndex: 1,
      });

      layersRef.current.light = L.tileLayer(lightUrl, {
        maxZoom: 22,
        zIndex: 1,
      });

      layersRef.current.terrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        zIndex: 1,
      });

      layersRef.current.cycling = L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
        maxZoom: 18,
        zIndex: 10,
      });

      layersRef.current.traffic = L.tileLayer(trafficUrl, {
        maxZoom: 22,
        zIndex: 10,
      });
    }

    // Handle Layer Visibility
    if (mapRef.current) {
      // Base Layers (exclusive)
      if (activeLayers.has('terrain')) {
        layersRef.current.dark?.remove();
        layersRef.current.light?.remove();
        layersRef.current.terrain?.addTo(mapRef.current);
        layersRef.current.terrain?.bringToBack();
      } else if (activeLayers.has('light')) {
        layersRef.current.dark?.remove();
        layersRef.current.terrain?.remove();
        layersRef.current.light?.addTo(mapRef.current);
        layersRef.current.light?.bringToBack();
      } else {
        layersRef.current.terrain?.remove();
        layersRef.current.light?.remove();
        layersRef.current.dark?.addTo(mapRef.current);
        layersRef.current.dark?.bringToBack();
      }

      // Overlays
      if (activeLayers.has('cycling')) {
        layersRef.current.cycling?.addTo(mapRef.current);
        layersRef.current.cycling?.bringToFront();
      } else {
        layersRef.current.cycling?.remove();
      }

      if (activeLayers.has('traffic')) {
        layersRef.current.traffic?.addTo(mapRef.current);
        layersRef.current.traffic?.bringToFront();
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
      if (startMarkerRef.current) {
        startMarkerRef.current.remove();
      }

      const latLngs = path.map(p => [Number(p.lat), Number(p.lng)] as L.LatLngExpression);
      polylineRef.current = L.polyline(latLngs, {
        color: '#ff5722',
        weight: 6,
        opacity: 0.9,
        lineJoin: 'round'
      }).addTo(mapRef.current);

      const bikeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`;
      const bikeIcon = L.divIcon({
        html: `<div style="background: #ff5722; color: white; border-radius: 50%; padding: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); border: 2px solid white; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; box-sizing: border-box;">${bikeIconSvg}</div>`,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      startMarkerRef.current = L.marker(latLngs[0], { icon: bikeIcon }).addTo(mapRef.current);

      const bounds = L.latLngBounds(latLngs);
      mapRef.current.flyToBounds(bounds, { 
        padding: [50, 50],
        duration: 2,
        easeLinearity: 0.25
      });
    } else {
      if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }
      if (startMarkerRef.current) {
        startMarkerRef.current.remove();
        startMarkerRef.current = null;
      }
    }
  }, [path]);

  useEffect(() => {
    if (mapRef.current && path && path.length > 0 && routeFocusTrigger !== undefined && routeFocusTrigger > 0) {
      const latLngs = path.map(p => [Number(p.lat), Number(p.lng)] as L.LatLngExpression);
      const bounds = L.latLngBounds(latLngs);
      mapRef.current.flyToBounds(bounds, { 
        padding: [50, 50],
        duration: 2,
        easeLinearity: 0.25
      });
    }
  }, [routeFocusTrigger]);

  useEffect(() => {
    if (mapRef.current && zoomLevel !== undefined) {
      mapRef.current.setZoom(zoomLevel);
    }
  }, [zoomLevel]);

  return (
    <div ref={mapContainerRef} className="w-full h-full z-0 pointer-events-auto" />
  );
}
