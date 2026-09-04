import React, { useState } from 'react';
import { RoleType, EVVehicle, ChargingStation } from '../types';
import {
  BookOpen,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Zap,
  Play,
  RotateCcw,
  Shield,
  BatteryCharging,
  Radio,
} from 'lucide-react';
import { simulation } from '../services/simulation';

interface GuidedDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRole: (role: RoleType) => void;
  onSelectVehicle: (vehicle: EVVehicle) => void;
  vehicles: EVVehicle[];
  stations: ChargingStation[];
}

export const GuidedDemoModal: React.FC<GuidedDemoModalProps> = ({
  isOpen,
  onClose,
  onSelectRole,
  onSelectVehicle,
  vehicles,
  stations,
}) => {
  const [currentScenario, setCurrentScenario] = useState<1 | 2>(1);
  const [stepIndex, setStepIndex] = useState(0);

  if (!isOpen) return null;

  const SCENARIO_1_STEPS = [
    {
      title: 'Step 1-3: Live Fleet Map Loaded',
      desc: 'OpenStreetMap + Leaflet displays 25 live EVs across San Jose with real-time simulated telemetry and 10 charging hubs.',
      actionLabel: 'Switch to Admin & Recenter',
      action: () => {
        onSelectRole('admin');
      },
    },
    {
      title: 'Step 4-9: Admin Inspects Receiver EV-014',
      desc: 'Select EV-014 (Hyundai Ioniq 5). Deterministic decision engine calculates EV-007 (Tesla Model Y) as optimal donor (1.2 km, 82% SOC, 20 kWh available) with explicit Why/Why Not reasons.',
      actionLabel: 'Select EV-014 in Admin View',
      action: () => {
        onSelectRole('admin');
        const ev14 = vehicles.find((v) => v.id === 'EV-014');
        if (ev14) onSelectVehicle(ev14);
      },
    },
    {
      title: 'Step 10-11: Receiver Cockpit Requests V2V',
      desc: 'Switch to Receiver EV Cockpit. Receiver sees EV-007 recommended over Station #12 and dispatches the V2V transfer request.',
      actionLabel: 'Switch to Receiver & Request V2V',
      action: () => {
        onSelectRole('receiver');
        simulation.requestV2V('EV-014', 'EV-007', 18);
      },
    },
    {
      title: 'Step 12-14: Donor Accepts & Live Transfer Starts',
      desc: 'Switch to Donor EV Cockpit (EV-007). Donor reviews incoming request (12 kWh requested, 94% eff, reserve protected at 30%) and accepts.',
      actionLabel: 'Accept Request in Donor Cockpit',
      action: () => {
        onSelectRole('donor');
        simulation.acceptV2VRequest('EV-007', 'EV-014');
      },
    },
    {
      title: 'Step 15-17: Active V2V & Real-Time Telemetry Transfer',
      desc: 'Purple glowing V2V link pulses on map. Real-time SOC updates dynamically: EV-007 supplies power safely, EV-014 replenishes battery.',
      actionLabel: 'View Active Transfer on Admin Map',
      action: () => {
        onSelectRole('admin');
        const ev14 = vehicles.find((v) => v.id === 'EV-014');
        if (ev14) onSelectVehicle(ev14);
      },
    },
  ];

  const SCENARIO_2_STEPS = [
    {
      title: 'Scenario 2: No Feasible Donor (Station Fallback)',
      desc: 'Select EV-021 (Rivian R1T, SOC 16%, Demand 25 kWh). In this corridor, candidate donors (EV-004, EV-011, EV-009) fail distance or reserve constraints.',
      actionLabel: 'Setup Scenario 2 & Select EV-021',
      action: () => {
        simulation.resetScenario2();
        onSelectRole('admin');
        const ev21 = vehicles.find((v) => v.id === 'EV-021');
        if (ev21) onSelectVehicle(ev21);
      },
    },
    {
      title: 'Deterministic Recommendation: Station #8',
      desc: 'System automatically assigns EV-021 to Santana Row Supercharger #8 (2.1 km away, 250 kW, 8/12 available, 0 min queue) with detailed rejection reasons for V2V candidates.',
      actionLabel: 'Inspect Route to Station #8',
      action: () => {
        onSelectRole('admin');
        const ev21 = vehicles.find((v) => v.id === 'EV-021');
        if (ev21) onSelectVehicle(ev21);
      },
    },
  ];

  const steps = currentScenario === 1 ? SCENARIO_1_STEPS : SCENARIO_2_STEPS;
  const activeStep = steps[stepIndex] || steps[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-950 border border-cyan-700 text-cyan-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-mono">
                Q-FLEET DEMO WALKTHROUGH
              </h2>
              <p className="text-xs text-slate-400">
                Official 17-Step Prototype Evaluation Guide
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {/* Scenario Toggle */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => {
              setCurrentScenario(1);
              setStepIndex(0);
            }}
            className={`flex-1 py-2 rounded-lg font-semibold transition-all ${
              currentScenario === 1
                ? 'bg-cyan-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Scenario 1: EV-014 ↔ EV-007 (V2V Match)
          </button>
          <button
            onClick={() => {
              setCurrentScenario(2);
              setStepIndex(0);
            }}
            className={`flex-1 py-2 rounded-lg font-semibold transition-all ${
              currentScenario === 2
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Scenario 2: EV-021 → Station #8 (No Donor)
          </button>
        </div>

        {/* Step Progress Indicators */}
        <div className="flex gap-1.5">
          {steps.map((s, idx) => (
            <button
              key={idx}
              onClick={() => setStepIndex(idx)}
              className={`h-2 flex-1 rounded-full transition-all ${
                idx === stepIndex
                  ? 'bg-cyan-400 ring-2 ring-cyan-400/40'
                  : idx < stepIndex
                  ? 'bg-cyan-700'
                  : 'bg-slate-800'
              }`}
            />
          ))}
        </div>

        {/* Active Step Content */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-white font-mono">{activeStep.title}</h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
              {stepIndex + 1} of {steps.length}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{activeStep.desc}</p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => {
              if (currentScenario === 1) simulation.resetScenario1();
              else simulation.resetScenario2();
              setStepIndex(0);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo State</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                activeStep.action();
                onClose();
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:brightness-110 text-white text-xs font-bold font-mono tracking-wide shadow-lg active:scale-95 transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{activeStep.actionLabel}</span>
            </button>

            {stepIndex < steps.length - 1 && (
              <button
                onClick={() => setStepIndex(stepIndex + 1)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200"
                title="Next Step"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
