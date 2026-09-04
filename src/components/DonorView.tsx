import React, { useState } from 'react';
import { EVVehicle, ActiveV2VSession } from '../types';
import {
  BatteryCharging,
  Zap,
  Radio,
  Check,
  X,
  MapPin,
  Clock,
  ArrowRight,
  ShieldCheck,
  TrendingDown,
  Navigation,
} from 'lucide-react';
import { simulation } from '../services/simulation';

interface DonorViewProps {
  vehicles: EVVehicle[];
  activeSessions: ActiveV2VSession[];
  selectedDonorId: string;
  onSelectDonorId: (id: string) => void;
  onViewOnMap: (vehicle: EVVehicle) => void;
}

export const DonorView: React.FC<DonorViewProps> = ({
  vehicles,
  activeSessions,
  selectedDonorId,
  onSelectDonorId,
  onViewOnMap,
}) => {
  // Available donors in fleet
  const donors = vehicles.filter(
    (v) => v.status === 'donor_available' || v.status === 'v2v_active' || v.soc >= 60
  );

  const currentDonor = vehicles.find((v) => v.id === selectedDonorId) || donors[0] || vehicles[0];

  // Check if donor has an active V2V session
  const activeSession = activeSessions.find(
    (s) => s.donorId === currentDonor?.id && s.status === 'active'
  );

  // Check if donor has a pending request or assignment
  const receiverPartner = currentDonor?.assignedToId
    ? vehicles.find((v) => v.id === currentDonor.assignedToId)
    : vehicles.find((v) => v.id === 'EV-014'); // Default potential requester if unassigned

  const isPendingRequest =
    currentDonor?.assignmentStatus === 'pending' ||
    currentDonor?.assignmentStatus === 'V2V_REQUESTED' ||
    currentDonor?.assignmentStatus === 'V2V_PENDING' ||
    (!activeSession &&
      currentDonor?.id === 'EV-007' &&
      !currentDonor?.assignmentStatus &&
      currentDonor?.assignedToId === 'EV-014');

  const isInitializing =
    currentDonor?.assignmentStatus === 'TRANSFER_READY' ||
    currentDonor?.assignmentStatus === 'V2V_INITIALIZING';

  const isCompleted = currentDonor?.assignmentStatus === 'DONATION_COMPLETED';

  const handleAccept = () => {
    if (!currentDonor || !receiverPartner) return;
    simulation.acceptV2VRequest(currentDonor.id, receiverPartner.id);
  };

  const handleDecline = () => {
    if (!currentDonor || !receiverPartner) return;
    simulation.declineV2VRequest(currentDonor.id, receiverPartner.id);
  };

  if (!currentDonor) {
    return <div className="p-6 text-slate-400">No donor EV found.</div>;
  }

  const minReserveKwh = Math.round(
    (currentDonor.minReserveSoc / 100) * currentDonor.batteryCapacityKwh * 10
  ) / 10;

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-y-auto border-r border-slate-800 w-full max-w-md lg:max-w-lg">
      {/* Donor Header & Vehicle Selector */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/60">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-950 border border-emerald-600 text-emerald-400">
              <BatteryCharging className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-wide text-white uppercase font-mono">
                Donor EV Cockpit
              </h2>
              <p className="text-[11px] text-slate-400">Vehicle-to-Vehicle Energy Sharing</p>
            </div>
          </div>

          {/* Donor EV Switcher */}
          <select
            value={currentDonor.id}
            onChange={(e) => onSelectDonorId(e.target.value)}
            className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-emerald-300 font-mono font-bold focus:outline-none focus:border-emerald-500"
          >
            {donors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.id} ({Math.round(d.soc)}% SOC)
              </option>
            ))}
          </select>
        </div>

        {/* Status Tag */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">{currentDonor.model}</span>
          </div>
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider ${
              activeSession
                ? 'bg-purple-950 text-purple-300 border border-purple-600 animate-pulse'
                : 'bg-emerald-950 text-emerald-400 border border-emerald-700'
            }`}
          >
            {activeSession ? 'TRANSFER ACTIVE' : 'AVAILABLE TO DONATE'}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Core Telemetry Display (Section 7) */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-slate-400 font-mono font-semibold">
              Battery Energy Buffer
            </span>
            <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Reserve Protected</span>
            </span>
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <div>
              <div className="text-4xl font-mono font-black text-white tracking-tight">
                {Math.round(currentDonor.soc)}%
              </div>
              <div className="text-xs text-slate-400 mt-0.5 font-mono">
                {currentDonor.currentKwh} / {currentDonor.batteryCapacityKwh} kWh Total
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-mono font-bold text-emerald-400">
                {currentDonor.availableEnergyKwh} kWh
              </div>
              <div className="text-[11px] text-emerald-300/80 uppercase font-semibold">
                Available to Share
              </div>
            </div>
          </div>

          {/* Visual SOC Progress Bar with Reserve Line */}
          <div className="relative w-full h-3.5 rounded-full bg-slate-800 overflow-hidden mb-2">
            {/* Reserve Threshold Background */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-slate-700/60 border-r-2 border-amber-500 z-0"
              style={{ width: `${currentDonor.minReserveSoc}%` }}
              title={`Reserve limit: ${currentDonor.minReserveSoc}%`}
            />
            {/* Active Battery Fill */}
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500 relative z-10"
              style={{ width: `${Math.min(100, currentDonor.soc)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>0%</span>
            <span className="text-amber-400 font-medium">
              Min Reserve: {currentDonor.minReserveSoc}% ({minReserveKwh} kWh)
            </span>
            <span>100%</span>
          </div>

          {/* Current GPS Position */}
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {currentDonor.lat.toFixed(4)}°N, {Math.abs(currentDonor.lng).toFixed(4)}°W
              </span>
            </span>
            <button
              onClick={() => onViewOnMap(currentDonor)}
              className="text-cyan-400 hover:underline flex items-center gap-1 font-sans text-xs"
            >
              <span>Locate on Map</span>
              <Navigation className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* ACTIVE V2V SESSION MONITOR (Section 13) */}
        {activeSession && receiverPartner && (
          <div className="p-4 rounded-2xl bg-purple-950/40 border-2 border-purple-500/80 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-ping"></span>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-purple-300">
                  Active V2V Energy Transfer
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-purple-200">
                {activeSession.progressPct}%
              </span>
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-slate-200">
              <div className="text-center">
                <div className="text-base font-bold text-purple-300">{currentDonor.id}</div>
                <div className="text-[10px] text-slate-400">Donor</div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-purple-400 font-bold">20 kW Inductive/DC</span>
                <div className="w-24 h-1 bg-purple-500/30 rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-purple-400 animate-pulse"
                    style={{ width: `${activeSession.progressPct}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-400">94% Efficiency</span>
              </div>
              <div className="text-center">
                <div className="text-base font-bold text-rose-300">{receiverPartner.id}</div>
                <div className="text-[10px] text-slate-400">Receiver</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-purple-950/60 p-2.5 rounded-xl border border-purple-800/50 text-center font-mono text-xs">
              <div>
                <span className="text-[10px] text-purple-400 block font-sans">Transferred</span>
                <span className="font-bold text-white">
                  {activeSession.transferredKwh} / {activeSession.requestedKwh} kWh
                </span>
              </div>
              <div>
                <span className="text-[10px] text-purple-400 block font-sans">Power Rate</span>
                <span className="font-bold text-purple-300">{activeSession.powerKw} kW</span>
              </div>
              <div>
                <span className="text-[10px] text-purple-400 block font-sans">Transfer Loss</span>
                <span className="font-bold text-slate-300">
                  {Math.round(activeSession.transferredKwh * 0.06 * 10) / 10} kWh (6%)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* V2V INITIALIZING / TRANSFER READY STATE */}
        {!activeSession && isInitializing && (
          <div className="p-4 rounded-2xl bg-indigo-950/50 border border-indigo-500/50 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-mono font-bold tracking-wider text-indigo-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span>
                <span>V2V Session Initializing</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-900/80 text-indigo-200 border border-indigo-600">
                {currentDonor.assignmentStatus === 'TRANSFER_READY' ? 'TRANSFER READY' : 'VALIDATING'}
              </span>
            </div>
            <div className="space-y-1.5 text-xs text-slate-300 bg-slate-950/70 p-3 rounded-xl border border-indigo-900/40 font-mono">
              <div className="text-emerald-400">✓ Handshake established with {receiverPartner?.id || 'EV-014'}</div>
              <div className="text-emerald-400">✓ Donor SOC ({Math.round(currentDonor.soc)}%) verified above 30% reserve</div>
              <div className="text-emerald-400">✓ Link calibrated (20 kW, 94% efficiency)</div>
              <div className="text-cyan-300 animate-pulse">⟳ Engaging power transfer relays...</div>
            </div>
          </div>
        )}

        {/* DONATION COMPLETED BANNER */}
        {isCompleted && (
          <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 shadow-xl space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold font-mono text-xs">
              <Check className="w-4 h-4" />
              <span>DONATION COMPLETED</span>
            </div>
            <p className="text-xs text-slate-300 font-sans">
              12.0 kWh successfully transferred. Donor battery safely preserved at {Math.round(currentDonor.soc)}% SOC (above 30% minimum reserve).
            </p>
          </div>
        )}

        {/* INCOMING V2V REQUEST CARD (Section 7) */}
        {!activeSession && !isInitializing && !isCompleted && receiverPartner && isPendingRequest && (
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-mono font-bold tracking-wider text-cyan-400 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" />
                <span>Incoming V2V Energy Request</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                Feasible Match
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-mono font-bold text-sm text-white">
                    {receiverPartner.id}
                  </h4>
                  <div className="text-xs text-slate-400">{receiverPartner.model}</div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-xs font-bold text-rose-400">
                    SOC {Math.round(receiverPartner.soc)}%
                  </div>
                  <div className="text-[10px] text-slate-400">1.2 km away</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans">Requested</span>
                  <span className="font-bold text-white">12.0 kWh</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans">Expected Recv</span>
                  <span className="font-bold text-emerald-400">11.28 kWh</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans">Efficiency</span>
                  <span className="font-bold text-purple-300">94%</span>
                </div>
              </div>
            </div>

            {/* Donor Safety Guarantee */}
            <div className="text-xs text-slate-300 space-y-1 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
                <Check className="w-3.5 h-3.5" />
                <span>Reserve Constraint Verified</span>
              </div>
              <p className="text-[11px] text-slate-400">
                After supplying 12 kWh, your battery will remain at ~66% SOC (comfortably above
                your 30% reserve threshold).
              </p>
            </div>

            {/* Action Buttons (Section 7) */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleAccept}
                className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono tracking-wider shadow-lg flex items-center justify-center gap-1.5 transition-all active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>ACCEPT REQUEST</span>
              </button>
              <button
                onClick={handleDecline}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold font-mono tracking-wider border border-slate-700 flex items-center justify-center gap-1.5 transition-all active:scale-95"
              >
                <X className="w-4 h-4" />
                <span>DECLINE</span>
              </button>
            </div>

            <button
              onClick={() => onViewOnMap(receiverPartner)}
              className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-400 text-xs font-medium border border-slate-800 flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>VIEW REQUEST ON MAP</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
