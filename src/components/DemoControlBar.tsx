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
  onDeclineV2V?: () => void;
  onSimulateFailure?: () => void;
  onStepDemoEvent?: () => void;
  currentDemoStep?: number;
  lastActionMessage?: string;
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
  onDeclineV2V,
  onSimulateFailure,
  onStepDemoEvent,
  currentDemoStep = 0,
  lastActionMessage = 'System ready.',
  currentReceiver,
  currentDonor,
  activeSession,
  isV2VPending,
  isStationNavigating,
}) => {
  return (
    <div
      id="demo-control-bar"
      className="bg-slate-900 border-b border-slate-800 px-3 py-2 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 z-20"
    >
      {/* Label, Status, and Action Narrative */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-[11px] font-mono font-bold text-cyan-300 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
          <span>DEMO CONTROLS</span>
        </div>

        {/* Narrative / Last Action Message */}
        <div className="text-xs font-mono text-slate-300 max-w-xl truncate">
          <span className="text-slate-500 mr-1.5 font-bold">STATUS:</span>
          <span className="text-emerald-300">{lastActionMessage}</span>
        </div>
      </div>

      {/* Control Buttons (Scenarios 1-37) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* STEP STORY EVENT (Scenario 37) */}
        {onStepDemoEvent && (
          <button
            id="btn-demo-step-event"
            onClick={onStepDemoEvent}
            title="Step sequentially through the 13 events of Scenario 37"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 text-xs font-mono font-bold border border-indigo-700 transition-colors shadow"
          >
            <span>▶ EVENT {currentDemoStep > 0 ? `${currentDemoStep}/13` : '1-13'}</span>
          </button>
        )}

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

        {/* DECLINE V2V (Scenario 19) */}
        {onDeclineV2V && (
          <button
            id="btn-demo-decline-v2v"
            onClick={onDeclineV2V}
            title="Donor declines request; system automatically re-evaluates or reroutes to station (Scenario 19)"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-950/60 hover:bg-red-900/80 text-red-300 text-xs font-mono font-semibold border border-red-800 transition-colors"
          >
            <span>DECLINE</span>
          </button>
        )}

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

        {/* FAIL TRANSFER (Scenario 22) */}
        {onSimulateFailure && activeSession && (
          <button
            id="btn-demo-fail-transfer"
            onClick={onSimulateFailure}
            title="Simulate mid-transfer failure (comm lost); system auto-reroutes receiver to station (Scenario 22)"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 text-xs font-mono font-semibold border border-rose-700 transition-colors"
          >
            <span>FAIL TRANSFER</span>
          </button>
        )}

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
