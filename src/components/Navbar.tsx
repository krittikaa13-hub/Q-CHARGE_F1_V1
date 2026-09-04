import React, { useEffect, useState } from 'react';
import { RoleType } from '../types';
import { Play, Pause, RotateCcw, StepForward, Shield, Radio, BatteryCharging, Sparkles, BookOpen } from 'lucide-react';
import { simulation } from '../services/simulation';

interface NavbarProps {
  currentRole: RoleType;
  onSelectRole: (role: RoleType) => void;
  lastUpdated: number;
  onOpenDemoGuide: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRole,
  onSelectRole,
  lastUpdated,
  onOpenDemoGuide,
}) => {
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [isPlaying, setIsPlaying] = useState(simulation.getIsRunning());

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = Math.floor((Date.now() - lastUpdated) / 1000);
      setSecondsAgo(Math.max(0, diff));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  const handleTogglePlay = () => {
    const running = simulation.togglePlay();
    setIsPlaying(running);
  };

  const handleStep = () => {
    simulation.step();
  };

  const handleResetScenario1 = () => {
    simulation.resetScenario1();
  };

  const handleResetScenario2 = () => {
    simulation.resetScenario2();
  };

  return (
    <header className="h-16 bg-slate-950 border-b border-slate-800 px-4 flex items-center justify-between gap-4 select-none z-20">
      {/* Brand & Telemetry Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-900/30">
            <Radio className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-lg tracking-wider text-white">Q-FLEET</span>
              <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                V2V DISPATCH
              </span>
            </div>
            <div className="text-[11px] text-slate-400 hidden sm:block">San Jose Metro EV Grid</div>
          </div>
        </div>

        {/* Telemetry Indicator - clearly marked as simulated */}
        <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-slate-800">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="font-semibold">LIVE DATA</span>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-amber-300 font-medium">
            SIMULATED LIVE VEHICLE DATA
          </span>
          <span className="text-xs text-slate-400 font-mono">
            Updated {secondsAgo}s ago
          </span>
        </div>
      </div>

      {/* Center: Role Switcher */}
      <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 shadow-inner">
        <button
          onClick={() => onSelectRole('admin')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            currentRole === 'admin'
              ? 'bg-cyan-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>ADMIN FLEET</span>
        </button>
        <button
          onClick={() => onSelectRole('donor')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            currentRole === 'donor'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <BatteryCharging className="w-3.5 h-3.5" />
          <span>DONOR EV</span>
        </button>
        <button
          onClick={() => onSelectRole('receiver')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            currentRole === 'receiver'
              ? 'bg-rose-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>RECEIVER EV</span>
        </button>
      </div>

      {/* Right: Simulation Controls & Guided Tour */}
      <div className="flex items-center gap-2">
        {/* Scenario Presets */}
        <div className="hidden md:flex items-center gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-xs">
          <button
            onClick={handleResetScenario1}
            title="Reset to Scenario 1: EV-014 (Receiver) matched with EV-007 (Donor)"
            className="px-2 py-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 font-mono text-[11px]"
          >
            Scenario 1 (V2V)
          </button>
          <button
            onClick={handleResetScenario2}
            title="Reset to Scenario 2: EV-021 (Receiver) mapped to Station #8"
            className="px-2 py-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 font-mono text-[11px]"
          >
            Scenario 2 (Station)
          </button>
        </div>

        {/* Play/Pause & Step Controls */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
          <button
            onClick={handleTogglePlay}
            className={`p-1.5 rounded hover:bg-slate-800 transition-colors ${
              isPlaying ? 'text-emerald-400' : 'text-amber-400'
            }`}
            title={isPlaying ? 'Pause Simulation' : 'Resume Simulation'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
          </button>
          <button
            onClick={handleStep}
            className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            title="Step Simulation 1 Tick"
          >
            <StepForward className="w-4 h-4" />
          </button>
        </div>

        {/* Demo Walkthrough Guide Modal Button */}
        <button
          onClick={onOpenDemoGuide}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-semibold shadow hover:brightness-110 active:scale-95 transition-all"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Demo Flow</span>
        </button>
      </div>
    </header>
  );
};
