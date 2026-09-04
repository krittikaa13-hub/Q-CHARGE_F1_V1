import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { EVVehicle, ChargingStation, ActiveV2VSession, FilterOptions } from '../types';
import { Layers, Crosshair, Zap, BatteryCharging, Radio } from 'lucide-react';

interface FleetMapProps {
  vehicles: EVVehicle[];
  stations: ChargingStation[];
  activeSessions: ActiveV2VSession[];
  selectedVehicleId: string | null;
  selectedStationId: string | null;
  filters: FilterOptions;
  focusTarget: { lat: number; lng: number; zoom?: number } | null;
  onSelectVehicle: (vehicle: EVVehicle) => void;
  onSelectStation: (station: ChargingStation) => void;
  className?: string;
}

export const FleetMap: React.FC<FleetMapProps> = ({
  vehicles,
  stations,
  activeSessions,
  selectedVehicleId,
  selectedStationId,
  filters,
  focusTarget,
  onSelectVehicle,
  onSelectStation,
  className = 'h-full w-full',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const linesLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [mapStyle, setMapStyle] = useState<'maptiler' | 'dark' | 'osm'>('maptiler');
  const [showLegend, setShowLegend] = useState(true);

  // Default San Jose Center
  const SAN_JOSE_CENTER: [number, number] = [37.3382, -121.8863];

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: SAN_JOSE_CENTER,
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
    });

    // Custom zoom control position
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapInstanceRef.current = map;
    markersLayerRef.current = L.layerGroup().addTo(map);
    linesLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle Tile Layer Changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }

    let url = '';
    let attribution = '';
    const maxZoom = 19;

    if (mapStyle === 'maptiler') {
      // MapTiler Hybrid satellite requested in prompt
      url = 'https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=GLVcmKEPkR6ghOtrx0te';
      attribution = '&copy; MapTiler &copy; OpenStreetMap contributors';
    } else if (mapStyle === 'dark') {
      url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      attribution = '&copy; OpenStreetMap contributors &copy; CARTO';
    } else {
      url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      attribution = '&copy; OpenStreetMap contributors';
    }

    const tileLayer = L.tileLayer(url, {
      attribution,
      maxZoom,
      subdomains: 'abcd',
    }).addTo(mapInstanceRef.current);

    tileLayerRef.current = tileLayer;
  }, [mapStyle]);

  // Focus Target when requested (e.g. clicking assignments table or search)
  useEffect(() => {
    if (!mapInstanceRef.current || !focusTarget) return;
    mapInstanceRef.current.flyTo(
      [focusTarget.lat, focusTarget.lng],
      focusTarget.zoom || 15,
      { duration: 1.2 }
    );
  }, [focusTarget]);

  // Update Markers, V2V Lines, and Station Routes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    const linesLayer = linesLayerRef.current;
    if (!map || !markersLayer || !linesLayer) return;

    markersLayer.clearLayers();
    linesLayer.clearLayers();

    // 1. FILTERING LOGIC
    const filteredVehicles = vehicles.filter((ev) => {
      // Vehicle type filter
      if (filters.vehicleType === 'donor' && ev.status !== 'donor_available') return false;
      if (filters.vehicleType === 'receiver' && ev.status !== 'receiver_needed') return false;
      if (filters.vehicleType === 'neutral' && ev.status !== 'neutral') return false;
      if (filters.vehicleType === 'charging' && ev.status !== 'charging_station') return false;
      if (filters.vehicleType === 'v2v_active' && ev.status !== 'v2v_active') return false;

      // SOC level filter
      if (filters.socLevel === 'critical' && ev.soc >= 20) return false;
      if (filters.socLevel === 'low' && (ev.soc < 20 || ev.soc >= 40)) return false;
      if (filters.socLevel === 'medium' && (ev.soc < 40 || ev.soc >= 70)) return false;
      if (filters.socLevel === 'high' && ev.soc < 70) return false;

      // V2V filter
      if (filters.v2vFilter === 'matched' && !ev.assignedToId) return false;
      if (filters.v2vFilter === 'unmatched' && ev.assignedToId) return false;

      // Search query
      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase();
        const matchesId = ev.id.toLowerCase().includes(q);
        const matchesModel = ev.model.toLowerCase().includes(q);
        const matchesAssignment = ev.assignedToId?.toLowerCase().includes(q);
        if (!matchesId && !matchesModel && !matchesAssignment) return false;
      }

      return true;
    });

    const filteredStations = stations.filter((st) => {
      if (filters.stationType !== 'all' && st.stationType !== filters.stationType) return false;
      if (filters.status !== 'all' && st.status !== filters.status) return false;
      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase();
        if (!st.name.toLowerCase().includes(q) && !st.id.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    // 2. RENDER CHARGING STATIONS
    filteredStations.forEach((station) => {
      const isSelected = selectedStationId === station.id;
      const isFast = station.stationType === 'Fast DC';
      const availableRatio = `${station.availableChargers}/${station.totalChargers}`;

      const stationHtml = `
        <div class="relative group cursor-pointer transition-transform hover:scale-110">
          <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg shadow-xl backdrop-blur-md ${
            isSelected
              ? 'bg-amber-500 text-slate-950 ring-4 ring-amber-400/50 scale-105 font-bold'
              : 'bg-slate-900/90 text-amber-400 border border-amber-500/40'
          }">
            <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            <div class="flex flex-col text-[10px] leading-tight">
              <span class="font-bold tracking-tight">${station.name.split(' ')[0]} #${station.id.replace('ST-', '')}</span>
              <span class="text-[9px] opacity-90">${station.powerKw}kW · ${availableRatio}</span>
            </div>
          </div>
          <div class="w-2 h-2 bg-amber-400 rotate-45 mx-auto -mt-1 shadow"></div>
        </div>
      `;

      const icon = L.divIcon({
        className: 'custom-station-marker',
        html: stationHtml,
        iconSize: [110, 36],
        iconAnchor: [55, 34],
      });

      const marker = L.marker([station.lat, station.lng], { icon });
      marker.on('click', () => onSelectStation(station));
      markersLayer.addLayer(marker);
    });

    // 3. RENDER V2V LINKS & STATION ROUTES
    vehicles.forEach((ev) => {
      // V2V Connection Line
      if (ev.assignedToId && ev.assignedType === 'v2v') {
        const partner = vehicles.find((v) => v.id === ev.assignedToId);
        // Draw line once from receiver to donor to avoid double draw
        if (
          partner &&
          (ev.status === 'receiver_needed' ||
            ev.status === 'v2v_active' ||
            ev.assignmentStatus === 'V2V_REQUESTED' ||
            ev.assignmentStatus === 'V2V_CONFIRMED' ||
            ev.assignmentStatus === 'V2V_INITIALIZING' ||
            ev.assignmentStatus === 'TRANSFER_READY' ||
            ev.assignmentStatus === 'TRANSFER_PAUSED')
        ) {
          const isActive =
            ev.status === 'v2v_active' ||
            partner.status === 'v2v_active' ||
            ev.assignmentStatus === 'V2V_ACTIVE' ||
            partner.assignmentStatus === 'V2V_ACTIVE';
          const isInitializing =
            ev.assignmentStatus === 'V2V_INITIALIZING' ||
            partner.assignmentStatus === 'V2V_INITIALIZING';
          const isConfirmed =
            ev.assignmentStatus === 'V2V_CONFIRMED' ||
            partner.assignmentStatus === 'V2V_CONFIRMED' ||
            ev.assignmentStatus === 'TRANSFER_READY' ||
            partner.assignmentStatus === 'TRANSFER_READY';
          const isPaused =
            ev.assignmentStatus === 'TRANSFER_PAUSED' ||
            partner.assignmentStatus === 'TRANSFER_PAUSED';

          const session = activeSessions.find(
            (s) =>
              (s.donorId === ev.id && s.receiverId === partner.id) ||
              (s.donorId === partner.id && s.receiverId === ev.id)
          );

          // Animated polyline
          const polyline = L.polyline(
            [
              [partner.lat, partner.lng],
              [ev.lat, ev.lng],
            ],
            {
              color: isActive ? '#c084fc' : isConfirmed ? '#10b981' : '#a855f7',
              weight: isActive ? 4 : 2.5,
              opacity: 0.9,
              dashArray: isActive ? '8, 8' : '4, 6',
              className: isActive ? 'v2v-flow-line' : '',
            }
          );

          // Midpoint marker with live transfer badge
          const midLat = (partner.lat + ev.lat) / 2;
          const midLng = (partner.lng + ev.lng) / 2;

          let badgeHtml = '';
          if (isActive) {
            badgeHtml = `
              <div class="px-2 py-0.5 rounded-full bg-purple-950/95 border border-purple-400 text-purple-200 text-[10px] font-mono shadow-xl whitespace-nowrap flex items-center gap-1.5 backdrop-blur-sm -translate-x-1/2 -translate-y-1/2 animate-pulse">
                <span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping"></span>
                <span>${partner.id} ➔ ${ev.id}</span>
                <span class="text-purple-300 font-bold">${session ? `${session.progressPct}%` : 'ACTIVE'}</span>
                <span class="text-[9px] text-purple-400">20kW · 94%</span>
              </div>
            `;
          } else if (isPaused) {
            badgeHtml = `
              <div class="px-2 py-0.5 rounded bg-amber-950/95 border border-amber-400 text-amber-200 text-[9px] font-mono shadow whitespace-nowrap -translate-x-1/2 -translate-y-1/2 flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                <span>${partner.id} ↔ ${ev.id}</span>
                <span class="font-bold text-amber-300">PAUSED (RECONNECTING)</span>
              </div>
            `;
          } else if (isInitializing) {
            badgeHtml = `
              <div class="px-2 py-0.5 rounded bg-indigo-950/95 border border-indigo-400 text-indigo-200 text-[9px] font-mono shadow whitespace-nowrap -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 animate-pulse">
                <span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                <span>${partner.id} ➔ ${ev.id}</span>
                <span class="font-bold text-indigo-300">INITIALIZING (CHECKING)</span>
              </div>
            `;
          } else if (isConfirmed) {
            badgeHtml = `
              <div class="px-2 py-0.5 rounded bg-emerald-950/95 border border-emerald-400 text-emerald-200 text-[9px] font-mono shadow whitespace-nowrap -translate-x-1/2 -translate-y-1/2 flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>${partner.id} ➔ ${ev.id}</span>
                <span class="font-bold text-emerald-300">V2V CONFIRMED</span>
              </div>
            `;
          } else {
            badgeHtml = `
              <div class="px-1.5 py-0.5 rounded bg-slate-900/90 border border-purple-500/50 text-purple-300 text-[9px] font-mono shadow whitespace-nowrap -translate-x-1/2 -translate-y-1/2">
                ${partner.id} ↔ ${ev.id} (V2V REQUESTED)
              </div>
            `;
          }

          const midIcon = L.divIcon({
            className: 'v2v-badge',
            html: badgeHtml,
            iconSize: [130, 20],
            iconAnchor: [65, 10],
          });

          linesLayer.addLayer(polyline);
          linesLayer.addLayer(L.marker([midLat, midLng], { icon: midIcon }));
        }
      }

      // EV → Charging Station Route Line
      if (ev.assignedToId && ev.assignedType === 'station') {
        const station = stations.find((s) => s.id === ev.assignedToId);
        if (station) {
          const isStationCharging = ev.assignmentStatus === 'CHARGING';
          const routeLine = L.polyline(
            [
              [ev.lat, ev.lng],
              [station.lat, station.lng],
            ],
            {
              color: isStationCharging ? '#10b981' : '#f97316',
              weight: 3,
              opacity: 0.85,
              dashArray: isStationCharging ? undefined : '6, 6',
              className: isStationCharging ? '' : 'station-route-line',
            }
          );

          const midLat = (ev.lat + station.lat) / 2;
          const midLng = (ev.lng + station.lng) / 2;

          const routeBadge = L.divIcon({
            className: 'station-route-badge',
            html: `
              <div class="px-2 py-0.5 rounded ${
                isStationCharging
                  ? 'bg-emerald-950/90 border border-emerald-500 text-emerald-200'
                  : 'bg-orange-950/90 border border-orange-500 text-orange-200'
              } text-[9px] font-mono shadow whitespace-nowrap -translate-x-1/2 -translate-y-1/2 flex items-center gap-1">
                <span>➔ ${station.id.replace('ST-', 'Station #')}</span>
                <span class="${isStationCharging ? 'text-emerald-400 font-bold' : 'text-orange-400'}">
                  ${isStationCharging ? `Charging (${Math.round(ev.soc)}%)` : 'En Route'}
                </span>
              </div>
            `,
            iconSize: [120, 18],
            iconAnchor: [60, 9],
          });

          linesLayer.addLayer(routeLine);
          linesLayer.addLayer(L.marker([midLat, midLng], { icon: routeBadge }));
        }
      }
    });

    // 4. RENDER EV VEHICLES
    filteredVehicles.forEach((ev) => {
      const isSelected = selectedVehicleId === ev.id;

      // Status color matching exact prompt specs:
      // Green = Available donor
      // Red = Receiver
      // Blue = Neutral EV
      // Orange = EV going to charging station
      // Purple = Active V2V
      // Grey = unavailable/inactive
      let colorClass = 'bg-blue-600 border-blue-400 text-blue-100';
      let ringColor = 'rgba(59, 130, 246, 0.4)';
      let label = 'NEUTRAL';

      if (ev.status === 'donor_available') {
        colorClass = 'bg-emerald-600 border-emerald-400 text-white';
        ringColor = 'rgba(16, 185, 129, 0.6)';
        label = 'DONOR';
      } else if (ev.status === 'receiver_needed') {
        colorClass = 'bg-rose-600 border-rose-400 text-white animate-pulse';
        ringColor = 'rgba(239, 68, 68, 0.7)';
        label = 'RECEIVER';
      } else if (ev.status === 'v2v_active') {
        colorClass = 'bg-purple-600 border-purple-300 text-white';
        ringColor = 'rgba(168, 85, 247, 0.8)';
        label = 'V2V ACTIVE';
      } else if (ev.status === 'charging_station') {
        colorClass = 'bg-amber-600 border-amber-400 text-white';
        ringColor = 'rgba(249, 115, 22, 0.6)';
        label = 'STATION';
      } else if (ev.status === 'unavailable') {
        colorClass = 'bg-slate-600 border-slate-400 text-slate-200';
        ringColor = 'rgba(100, 116, 139, 0.3)';
        label = 'OFFLINE';
      }

      // Selected glow
      const selectedBorder = isSelected
        ? 'ring-4 ring-cyan-400 scale-110 shadow-2xl z-50'
        : 'hover:scale-105';

      const evHtml = `
        <div class="relative cursor-pointer transition-transform ${selectedBorder}">
          ${
            ev.status === 'receiver_needed' || ev.status === 'v2v_active' || isSelected
              ? `<div class="absolute -inset-2 rounded-full animate-pulse-ring pointer-events-none" style="background-color: ${ringColor};"></div>`
              : ''
          }
          <div class="relative flex flex-col items-center">
            <div class="px-2 py-0.5 rounded-md border shadow-lg flex items-center gap-1.5 ${colorClass}">
              <span class="font-mono font-bold text-[11px]">${ev.id}</span>
              <span class="text-[10px] font-semibold">${Math.round(ev.soc)}%</span>
            </div>
            <div class="w-1.5 h-1.5 bg-slate-900 border border-white rotate-45 -mt-0.5 shadow"></div>
          </div>
        </div>
      `;

      const icon = L.divIcon({
        className: 'custom-ev-marker',
        html: evHtml,
        iconSize: [68, 30],
        iconAnchor: [34, 28],
      });

      const marker = L.marker([ev.lat, ev.lng], { icon });
      marker.on('click', () => onSelectVehicle(ev));
      markersLayer.addLayer(marker);
    });
  }, [
    vehicles,
    stations,
    activeSessions,
    selectedVehicleId,
    selectedStationId,
    filters,
    onSelectVehicle,
    onSelectStation,
  ]);

  const recenterFleet = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(SAN_JOSE_CENTER, 13, { duration: 1 });
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Map Container */}
      <div ref={mapContainerRef} className="h-full w-full z-0" />

      {/* Top Floating Controls */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2">
        {/* Recenter Fleet */}
        <button
          onClick={recenterFleet}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 text-xs font-medium shadow-xl backdrop-blur-md transition-all active:scale-95"
          title="Recenter Map on San Jose Fleet"
        >
          <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
          <span>Recenter Fleet</span>
        </button>

        {/* Map Layer Switcher */}
        <div className="flex items-center bg-slate-900/90 border border-slate-700/80 rounded-lg p-0.5 backdrop-blur-md shadow-xl text-xs">
          <button
            onClick={() => setMapStyle('maptiler')}
            className={`px-2.5 py-1 rounded-md transition-all ${
              mapStyle === 'maptiler'
                ? 'bg-cyan-600 text-white font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Satellite Hybrid
          </button>
          <button
            onClick={() => setMapStyle('dark')}
            className={`px-2.5 py-1 rounded-md transition-all ${
              mapStyle === 'dark'
                ? 'bg-cyan-600 text-white font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Dark Cyber
          </button>
          <button
            onClick={() => setMapStyle('osm')}
            className={`px-2.5 py-1 rounded-md transition-all ${
              mapStyle === 'osm'
                ? 'bg-cyan-600 text-white font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            OSM Street
          </button>
        </div>

        {/* Toggle Legend Button */}
        <button
          onClick={() => setShowLegend(!showLegend)}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium shadow-xl backdrop-blur-md transition-all ${
            showLegend
              ? 'bg-slate-800 text-cyan-400 border-cyan-500/50'
              : 'bg-slate-900/90 text-slate-400 border-slate-700'
          }`}
        >
          Legend
        </button>
      </div>

      {/* Floating Map Legend */}
      {showLegend && (
        <div className="absolute bottom-5 left-3 z-10 p-3 rounded-xl bg-slate-950/90 border border-slate-800 shadow-2xl backdrop-blur-md text-xs text-slate-300 max-w-xs">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
            Map Visual States
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span>Available Donor</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
              <span>Receiver Needed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
              <span>Active V2V</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span>Charging Station EV</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <span>Neutral Fleet EV</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span>
              <span>Inactive / Offline</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Charging Stations (10)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-0.5 bg-purple-400 inline-block border-t border-dashed"></span>
              <span>V2V Link</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
