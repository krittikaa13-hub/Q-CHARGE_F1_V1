import React, { useState } from 'react';
import { EVVehicle, ChargingStation, ActiveV2VSession } from '../types';
import {
  Battery,
  Zap,
  Radio,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Sparkles,
  MapPin,
  Clock,
  Car,
  AlertTriangle,
  Navigation,
} from 'lucide-react';
import { getRecommendationForEV } from '../services/decisionEngine';
import { simulation } from '../services/simulation';

interface ReceiverViewProps {
  vehicles: EVVehicle[];
  stations: ChargingStation[];
  activeSessions: ActiveV2VSession[];
  selectedReceiverId: string;
  onSelectReceiverId: (id: string) => void;
  onViewOnMap: (vehicle: EVVehicle) => void;
}

export const ReceiverView: React.FC<ReceiverViewProps> = ({
  vehicles,
  stations,
  activeSessions,
  selectedReceiverId,
  onSelectReceiverId,
  onViewOnMap,
}) => {
  // Available receivers in fleet
  const receivers = vehicles.filter(
    (v) => v.status === 'receiver_needed' || v.status === 'v2v_active' || v.soc <= 30
  );

  const currentReceiver =
    vehicles.find((v) => v.id === selectedReceiverId) || receivers[0] || vehicles[0];

  const recommendation = currentReceiver
    ? getRecommendationForEV(currentReceiver, vehicles, stations)
    : null;

  // Active V2V Session if any
  const activeSession = activeSessions.find(
    (s) => s.receiverId === currentReceiver?.id && s.status === 'active'
  );

  const isPendingRequest =
    currentReceiver?.assignedType === 'v2v' &&
    currentReceiver?.assignmentStatus === 'pending' &&
    !activeSession;

  const isStationAssigned =
    currentReceiver?.assignedType === 'station' ||
    currentReceiver?.status === 'charging_station';

  const handleRequestV2V = () => {
    if (!currentReceiver || !recommendation) return;
    simulation.requestV2V(
      currentReceiver.id,
      recommendation.primaryTargetId,
      currentReceiver.energyDemandKwh || 12
    );
  };

  const handleNavigateToStation = (stationId: string) => {
    if (!currentReceiver) return;
    simulation.assignToStation(currentReceiver.id, stationId);
  };

  if (!currentReceiver) {
    return <div className="p-6 text-slate-400">No receiver EV found.</div>;
  }

  // Top Donor candidate
  const topDonor = recommendation?.donorEvaluations.find((d) => d.feasible) || recommendation?.donorEvaluations[0];
  // Top Station candidate
  const topStation = recommendation?.stationEvaluations[0] || stations[0];

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-y-auto border-r border-slate-800 w-full max-w-md lg:max-w-lg">
      {/* Receiver Header & Switcher */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/60">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-rose-950 border border-rose-600 text-rose-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-wide text-white uppercase font-mono">
                Receiver EV Cockpit
              </h2>
              <p className="text-[11px] text-slate-400">Automated Energy Dispatch Request</p>
            </div>
          </div>

          {/* Receiver Selector */}
          <select
            value={currentReceiver.id}
            onChange={(e) => onSelectReceiverId(e.target.value)}
            className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-rose-300 font-mono font-bold focus:outline-none focus:border-rose-500"
          >
            {receivers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} ({Math.round(r.soc)}% SOC)
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-300">{currentReceiver.model}</div>
          <span className="px-2.5 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-700 text-xs font-mono font-bold uppercase tracking-wider">
            {activeSession
              ? 'RECEIVING ENERGY'
              : isStationAssigned
              ? 'STATION CHARGING'
              : 'ENERGY REQUIRED'}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Core State Display (Section 8) */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 shadow-xl">
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <div className="text-4xl font-mono font-black text-rose-400 tracking-tight flex items-center gap-2">
                <span>{Math.round(currentReceiver.soc)}%</span>
                <span className="text-xs font-sans font-semibold px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 uppercase">
                  {currentReceiver.soc < 20 ? 'Critical' : 'Low'}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5 font-mono">
                {currentReceiver.currentKwh} / {currentReceiver.batteryCapacityKwh} kWh Capacity
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-mono font-bold text-amber-400">
                {currentReceiver.energyDemandKwh || 18} kWh
              </div>
              <div className="text-[11px] text-amber-300/80 uppercase font-semibold">
                Required Energy
              </div>
            </div>
          </div>

          {/* Battery level bar */}
          <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden my-3">
            <div
              className="h-full bg-gradient-to-r from-red-600 to-rose-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, currentReceiver.soc)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 font-mono pt-2 border-t border-slate-800">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {currentReceiver.lat.toFixed(4)}°N, {Math.abs(currentReceiver.lng).toFixed(4)}°W
              </span>
            </span>
            <button
              onClick={() => onViewOnMap(currentReceiver)}
              className="text-cyan-400 hover:underline flex items-center gap-1 font-sans text-xs"
            >
              <span>Locate</span>
              <Navigation className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* ACTIVE SESSION MONITOR IF IN PROGRESS */}
        {activeSession && (
          <div className="p-4 rounded-2xl bg-purple-950/40 border-2 border-purple-500/80 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-ping"></span>
                <span className="text-xs font-mono font-bold uppercase text-purple-300">
                  V2V Transfer Active From {activeSession.donorId}
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-purple-200">
                {activeSession.progressPct}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-purple-950 rounded-full overflow-hidden border border-purple-800">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-400 transition-all duration-300"
                style={{ width: `${activeSession.progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-300">
              <span>Transferred: {activeSession.transferredKwh} kWh</span>
              <span>Power: {activeSession.powerKw} kW</span>
              <span>94% Efficiency</span>
            </div>
          </div>
        )}

        {/* PENDING REQUEST STATE */}
        {isPendingRequest && !activeSession && (
          <div className="p-4 rounded-xl bg-cyan-950/60 border border-cyan-700 text-xs space-y-2">
            <div className="flex items-center gap-2 text-cyan-300 font-bold font-mono">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
              <span>V2V REQUEST DISPATCHED</span>
            </div>
            <p className="text-slate-300">
              Request sent to donor <strong className="text-white">{currentReceiver.assignedToId}</strong>.
              Waiting for donor acceptance to start high-speed inductive energy transfer.
            </p>
          </div>
        )}

        {/* SYSTEM RECOMMENDATION BANNER (Section 8 & 16) */}
        {recommendation && (
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-mono font-bold text-cyan-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Q-Fleet Dispatch Recommendation</span>
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                  recommendation.recommendedType === 'v2v'
                    ? 'bg-purple-950 text-purple-300 border border-purple-800'
                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                }`}
              >
                {recommendation.recommendedType === 'v2v' ? 'RECOMMENDED: V2V' : 'RECOMMENDED: CHARGING STATION'}
              </span>
            </div>

            <p className="text-xs text-slate-200 font-medium bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              "{recommendation.summarySentence}"
            </p>

            {/* NEARBY EVALUATED OPTIONS (Section 8) */}
            <div className="space-y-2 pt-1">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono font-semibold">
                Evaluated Dispatch Options
              </div>

              {/* OPTION 1: V2V */}
              {topDonor && (
                <div
                  className={`p-3 rounded-xl border transition-all ${
                    recommendation.recommendedType === 'v2v'
                      ? 'bg-purple-950/30 border-purple-500/80 ring-1 ring-purple-500/50'
                      : 'bg-slate-950 border-slate-800 opacity-80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5 font-mono">
                      <Car className="w-3.5 h-3.5 text-purple-400" />
                      <span>OPTION 1 — V2V ({topDonor.donorId})</span>
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        recommendation.recommendedType === 'v2v'
                          ? 'bg-purple-900 text-purple-200'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {recommendation.recommendedType === 'v2v' ? 'RECOMMENDED' : 'FEASIBILITY LOW'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-xs font-mono text-slate-300 mt-2">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Distance</span>
                      <span className="font-semibold">{topDonor.distanceKm} km</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Available</span>
                      <span className="font-semibold">{topDonor.availableEnergyKwh} kWh</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Expected Recv</span>
                      <span className="font-semibold text-emerald-400">
                        {topDonor.deliveredEnergyKwh} kWh
                      </span>
                    </div>
                  </div>

                  {recommendation.recommendedType === 'v2v' && !isPendingRequest && !activeSession && (
                    <button
                      onClick={handleRequestV2V}
                      className="w-full mt-3 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold tracking-wider shadow-lg flex items-center justify-center gap-1.5 transition-all active:scale-95"
                    >
                      <Zap className="w-4 h-4" />
                      <span>REQUEST V2V TRANSFER</span>
                    </button>
                  )}
                </div>
              )}

              {/* OPTION 2: CHARGING STATION */}
              {topStation && (
                <div
                  className={`p-3 rounded-xl border transition-all ${
                    recommendation.recommendedType === 'station'
                      ? 'bg-amber-950/30 border-amber-500/80 ring-1 ring-amber-500/50'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5 font-mono">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>OPTION 2 — Charging Station</span>
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        recommendation.recommendedType === 'station'
                          ? 'bg-amber-900 text-amber-200'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {recommendation.recommendedType === 'station'
                        ? 'RECOMMENDED'
                        : 'SECONDARY CHOICE'}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-slate-200 mt-1">
                    {topStation.stationName}
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-xs font-mono text-slate-300 mt-2">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Distance</span>
                      <span className="font-semibold">{topStation.distanceKm} km</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Power</span>
                      <span className="font-semibold text-amber-300">{topStation.powerKw} kW</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Available</span>
                      <span className="font-semibold text-emerald-400">
                        {topStation.availableChargers}/{topStation.totalChargers}
                      </span>
                    </div>
                  </div>

                  {recommendation.recommendedType === 'station' && (
                    <button
                      onClick={() => handleNavigateToStation(topStation.stationId)}
                      className="w-full mt-3 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-mono text-xs font-bold tracking-wider shadow-lg flex items-center justify-center gap-1.5 transition-all active:scale-95"
                    >
                      <Navigation className="w-4 h-4" />
                      <span>NAVIGATE TO STATION ROUTE</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
