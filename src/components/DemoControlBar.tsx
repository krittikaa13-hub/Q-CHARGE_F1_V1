import React from 'react';
import {
  RotateCcw,
  BatteryWarning,
  Search,
  Send,
  CheckCircle2,
  Zap,
  Navigation,
} from 'lucide-react';
import { EVVehicle, ActiveV2VSession } from '../types';

interface DemoControlBarProps {
  onResetDemo: () => void;
  onCreateReceiver: () => void;
  onFindBestMatch: () => void;
  onRequestV2V: () => void;
  onAcceptV2V: () => void;
  onStartTransfer: () => void;
  onSendToStation: () => void;
  currentReceiver: EVVehicle | null;
  currentDonor: EVVehicle | null;
  activeSession: ActiveV2VSession | null;
  isV2VPending: boolean;
  isStationNavigating: boolean;
}

export const DemoControlBar: React.FC<DemoControlBarProps> = ({
  onResetDemo,
  onCreateReceiver,
  onFindBestMatch,
  onRequestV2V,
  onAcceptV2V,
  onStartTransfer,
  onSendToStation,
  currentReceiver,
  currentDonor,
  activeSession,
  isV2VPending,
  isStationNavigating,
}) => {
  return (
    <div
      id="demo-control-bar"
      className="bg-slate-900 border-b border-slate-800 px-3 py-2 flex flex-wrap items-center justify-between gap-2 z-20"
    >
      {/* Label and Status */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-[11px] font-mono font-bold text-cyan-300">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
          <span>DEMO CONTROLS</span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-400">
          {activeSession ? (
            <span className="text-purple-400 font-semibold flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" />
              <span>V2V Active ({activeSession.progressPct}%)</span>
            </span>
          ) : isV2VPending ? (
            <span className="text-amber-400 font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              <span>V2V Proposed / Pending</span>
            </span>
          ) : isStationNavigating ? (
            <span className="text-orange-400 font-semibold flex items-center gap-1">
              <Navigation className="w-3.5 h-3.5" />
              <span>Station Mapped</span>
            </span>
          ) : currentReceiver ? (
            <span className="text-rose-400">
              Receiver: {currentReceiver.id} ({Math.round(currentReceiver.soc)}% SOC)
            </span>
          ) : (
            <span>Ready</span>
          )}
        </div>
      </div>

      {/* Seven Required Demo Controls (Requirement 14) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* 1. RESET DEMO */}
        <button
          id="btn-demo-reset"
          onClick={onResetDemo}
          title="Reset simulation to initial Scenario (EV-014 receiver, EV-007 donor)"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-semibold border border-slate-700 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
          <span>RESET DEMO</span>
        </button>

        {/* 2. CREATE RECEIVER */}
        <button
          id="btn-demo-create-receiver"
          onClick={onCreateReceiver}
          title="Configure EV-014 with critical 22% SOC and 18 kWh energy demand"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 text-xs font-mono font-semibold border border-rose-800 transition-colors"
        >
          <BatteryWarning className="w-3.5 h-3.5 text-rose-400" />
          <span>CREATE RECEIVER</span>
        </button>

        {/* 3. FIND BEST MATCH */}
        <button
          id="btn-demo-find-match"
          onClick={onFindBestMatch}
          title="Run deterministic decision engine to evaluate donors and stations"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 text-xs font-mono font-semibold border border-cyan-800 transition-colors"
        >
          <Search className="w-3.5 h-3.5 text-cyan-400" />
          <span>FIND BEST MATCH</span>
        </button>

        {/* 4. REQUEST V2V */}
        <button
          id="btn-demo-request-v2v"
          onClick={onRequestV2V}
          title="Create real V2V dispatch request from Receiver EV-014 to Donor EV-007"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 text-xs font-mono font-semibold border border-purple-800 transition-colors"
        >
          <Send className="w-3.5 h-3.5 text-purple-400" />
          <span>REQUEST V2V</span>
        </button>

        {/* 5. ACCEPT V2V */}
        <button
          id="btn-demo-accept-v2v"
          onClick={onAcceptV2V}
          title="Accept the incoming V2V request and activate physical transfer session"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 text-xs font-mono font-semibold border border-emerald-800 transition-colors"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>ACCEPT V2V</span>
        </button>

        {/* 6. START TRANSFER / ADVANCE */}
        <button
          id="btn-demo-start-transfer"
          onClick={onStartTransfer}
          title="Advance the live energy transfer simulation and update SOC"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 text-xs font-mono font-semibold border border-amber-800 transition-colors"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>START TRANSFER</span>
        </button>

        {/* 7. SEND TO STATION */}
        <button
          id="btn-demo-send-station"
          onClick={onSendToStation}
          title="Dispatch receiver EV-021 to Charging Station #8 (Santana Row Supercharger)"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-950/60 hover:bg-orange-900/80 text-orange-300 text-xs font-mono font-semibold border border-orange-800 transition-colors"
        >
          <Navigation className="w-3.5 h-3.5 text-orange-400" />
          <span>SEND TO STATION</span>
        </button>
      </div>
    </div>
  );
};
