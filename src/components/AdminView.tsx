import React, { useState } from 'react';
import {
  EVVehicle,
  ChargingStation,
  ActiveV2VSession,
  FilterOptions,
  AssignmentRecord,
  RecommendationResult,
} from '../types';
import {
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Zap,
  Battery,
  Radio,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  Info,
  Car,
} from 'lucide-react';
import { getRecommendationForEV } from '../services/decisionEngine';

interface AdminViewProps {
  vehicles: EVVehicle[];
  stations: ChargingStation[];
  activeSessions: ActiveV2VSession[];
  assignments: AssignmentRecord[];
  selectedVehicle: EVVehicle | null;
  selectedStation: ChargingStation | null;
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  onSelectVehicle: (vehicle: EVVehicle) => void;
  onSelectStation?: (station: ChargingStation) => void;
  onZoomToVehicle: (vehicle: EVVehicle) => void;
  onZoomToAssignment: (record: AssignmentRecord) => void;
  onCloseInspector: () => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  vehicles,
  stations,
  activeSessions,
  assignments,
  selectedVehicle,
  selectedStation,
  filters,
  onFilterChange,
  onSelectVehicle,
  onSelectStation,
  onZoomToVehicle,
  onZoomToAssignment,
  onCloseInspector,
}) => {
  const [activeTab, setActiveTab] = useState<'assignments' | 'fleet' | 'stations'>('assignments');
  const [showFiltersModal, setShowFiltersModal] = useState(false);

  // Dynamic status counts adhering strictly to the 7 required categories (Requirement 1)
  const totalEVs = vehicles.length;
  const donorsCount = vehicles.filter((v) => v.status === 'donor_available').length;
  const receiversCount = vehicles.filter((v) => v.status === 'receiver_needed').length;
  const neutralCount = vehicles.filter((v) => v.status === 'neutral').length;
  const v2vActiveCount = vehicles.filter((v) => v.status === 'v2v_active').length;
  const chargingCount = vehicles.filter((v) => v.status === 'charging_station').length;
  const unassignedCount = vehicles.filter((v) => !v.assignedToId).length;

  // Selected vehicle decision engine analysis
  const recommendation: RecommendationResult | null = selectedVehicle
    ? getRecommendationForEV(selectedVehicle, vehicles, stations)
    : null;

  // Search matches
  const query = filters.searchQuery.trim().toLowerCase();
  const matchingVehicles = query
    ? vehicles.filter(
        (v) =>
          v.id.toLowerCase().includes(query) ||
          v.model.toLowerCase().includes(query) ||
          (v.assignedToId && v.assignedToId.toLowerCase().includes(query))
      )
    : [];

  const matchingStations = query
    ? stations.filter(
        (s) =>
          s.id.toLowerCase().includes(query) ||
          s.name.toLowerCase().includes(query) ||
          s.address.toLowerCase().includes(query)
      )
    : [];

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden border-r border-slate-800 w-full max-w-md lg:max-w-lg xl:max-w-xl">
      {/* Top Stat Cards Grid — The 7 Core Categories (Requirement 1) */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/60">
        <div className="text-xs uppercase font-mono font-bold tracking-wider text-slate-400 mb-2 flex items-center justify-between">
          <span>Live Fleet Status Overview</span>
          <span className="text-[10px] text-cyan-400 font-mono">Telemetry Active</span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 text-center">
          <div className="p-1 rounded-lg bg-slate-800/80 border border-slate-700/60">
            <div className="text-[9px] text-slate-400 font-medium">Total EVs</div>
            <div className="text-base font-mono font-bold text-white">{totalEVs}</div>
          </div>
          <div className="p-1 rounded-lg bg-emerald-950/40 border border-emerald-800/50">
            <div className="text-[9px] text-emerald-400 font-medium">Donors</div>
            <div className="text-base font-mono font-bold text-emerald-300">{donorsCount}</div>
          </div>
          <div className="p-1 rounded-lg bg-rose-950/40 border border-rose-800/50">
            <div className="text-[9px] text-rose-400 font-medium">Receivers</div>
            <div className="text-base font-mono font-bold text-rose-300">{receiversCount}</div>
          </div>
          <div className="p-1 rounded-lg bg-blue-950/40 border border-blue-800/50">
            <div className="text-[9px] text-blue-400 font-medium">Neutral</div>
            <div className="text-base font-mono font-bold text-blue-300">{neutralCount}</div>
          </div>
          <div className="p-1 rounded-lg bg-purple-950/40 border border-purple-800/50">
            <div className="text-[9px] text-purple-400 font-medium">V2V Active</div>
            <div className="text-base font-mono font-bold text-purple-300">{v2vActiveCount}</div>
          </div>
          <div className="p-1 rounded-lg bg-amber-950/40 border border-amber-800/50">
            <div className="text-[9px] text-amber-400 font-medium">Charging</div>
            <div className="text-base font-mono font-bold text-amber-300">{chargingCount}</div>
          </div>
          <div className="p-1 rounded-lg bg-slate-900 border border-slate-800">
            <div className="text-[9px] text-slate-400 font-medium">Unassigned</div>
            <div className="text-base font-mono font-bold text-slate-300">{unassignedCount}</div>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar (Section 3 & 18) */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/40 relative">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search EV-014, Station, Assignment..."
              value={filters.searchQuery}
              onChange={(e) => onFilterChange({ ...filters, searchQuery: e.target.value })}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            {filters.searchQuery && (
              <button
                onClick={() => onFilterChange({ ...filters, searchQuery: '' })}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                ×
              </button>
            )}
          </div>

          {/* Filters Button */}
          <button
            onClick={() => setShowFiltersModal(!showFiltersModal)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              showFiltersModal ||
              filters.vehicleType !== 'all' ||
              filters.stationType !== 'all' ||
              filters.socLevel !== 'all'
                ? 'bg-cyan-600 text-white border-cyan-500'
                : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters</span>
          </button>
        </div>

        {/* Quick Search Autocomplete Suggestions (Requirement 15) */}
        {query.length > 0 && (matchingVehicles.length > 0 || matchingStations.length > 0) && (
          <div className="mt-2 p-2 rounded-xl bg-slate-900 border border-cyan-700/80 shadow-2xl text-xs space-y-1.5 z-30">
            <div className="text-[10px] uppercase font-mono text-cyan-400 font-bold px-1">
              Search Results (Click to focus map)
            </div>

            {/* EV Matches */}
            {matchingVehicles.slice(0, 4).map((ev) => (
              <button
                key={ev.id}
                onClick={() => {
                  onSelectVehicle(ev);
                  onZoomToVehicle(ev);
                  onFilterChange({ ...filters, searchQuery: '' });
                }}
                className="w-full p-1.5 rounded-lg bg-slate-950 hover:bg-cyan-950/60 border border-slate-800 text-left flex items-center justify-between font-mono text-xs transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Car className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-bold text-white">{ev.id}</span>
                  <span className="text-slate-400 text-[11px] font-sans">{ev.model}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={ev.soc < 30 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                    {Math.round(ev.soc)}% SOC
                  </span>
                  <span className="text-slate-500 capitalize">{ev.status.replace('_', ' ')}</span>
                </div>
              </button>
            ))}

            {/* Station Matches */}
            {matchingStations.slice(0, 3).map((st) => (
              <button
                key={st.id}
                onClick={() => {
                  if (onSelectStation) {
                    onSelectStation(st);
                  }
                  onFilterChange({ ...filters, searchQuery: '' });
                }}
                className="w-full p-1.5 rounded-lg bg-slate-950 hover:bg-amber-950/60 border border-slate-800 text-left flex items-center justify-between font-mono text-xs transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-bold text-amber-300">{st.id}</span>
                  <span className="text-slate-300 text-[11px] font-sans truncate max-w-[150px]">{st.name}</span>
                </div>
                <span className="text-emerald-400 text-[11px]">
                  {st.availableChargers}/{st.totalChargers} open
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Expanded Filter Panel */}
      {showFiltersModal && (
        <div className="p-3 bg-slate-900/90 border-b border-slate-800 text-xs space-y-3">
          <div className="flex items-center justify-between font-semibold text-slate-300">
            <span>Filter Dispatch Options</span>
            <button
              onClick={() =>
                onFilterChange({
                  vehicleType: 'all',
                  stationType: 'all',
                  status: 'all',
                  socLevel: 'all',
                  v2vFilter: 'all',
                  searchQuery: '',
                })
              }
              className="text-[11px] text-cyan-400 hover:underline"
            >
              Reset Filters
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Vehicle Type</label>
              <select
                value={filters.vehicleType}
                onChange={(e) =>
                  onFilterChange({ ...filters, vehicleType: e.target.value as any })
                }
                className="w-full p-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-slate-200"
              >
                <option value="all">All EVs</option>
                <option value="donor">Donors</option>
                <option value="receiver">Receivers</option>
                <option value="neutral">Neutral</option>
                <option value="charging">Charging</option>
                <option value="v2v_active">V2V Active</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Station Type</label>
              <select
                value={filters.stationType}
                onChange={(e) =>
                  onFilterChange({ ...filters, stationType: e.target.value as any })
                }
                className="w-full p-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-slate-200"
              >
                <option value="all">All Stations</option>
                <option value="Fast DC">Fast DC (150-350kW)</option>
                <option value="Level 2">Level 2 (19-22kW)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">SOC Level</label>
              <select
                value={filters.socLevel}
                onChange={(e) =>
                  onFilterChange({ ...filters, socLevel: e.target.value as any })
                }
                className="w-full p-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-slate-200"
              >
                <option value="all">All SOC</option>
                <option value="critical">Critical (&lt;20%)</option>
                <option value="low">Low (20-40%)</option>
                <option value="medium">Medium (40-70%)</option>
                <option value="high">High (&gt;70%)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">V2V Status</label>
              <select
                value={filters.v2vFilter}
                onChange={(e) =>
                  onFilterChange({ ...filters, v2vFilter: e.target.value as any })
                }
                className="w-full p-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-slate-200"
              >
                <option value="all">All Vehicles</option>
                <option value="matched">Matched Only</option>
                <option value="unmatched">Unmatched Only</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Main Content: Vehicle Inspector vs Tables */}
      <div className="flex-1 overflow-y-auto">
        {/* If an EV is selected, display the detailed Inspector with Why / Why Not (Sections 4, 5, 6, 10, 12, 16) */}
        {selectedVehicle ? (
          <div className="p-4 space-y-4">
            {/* Inspector Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    selectedVehicle.status === 'donor_available'
                      ? 'bg-emerald-500'
                      : selectedVehicle.status === 'receiver_needed'
                      ? 'bg-rose-500 animate-pulse'
                      : selectedVehicle.status === 'v2v_active'
                      ? 'bg-purple-500'
                      : selectedVehicle.status === 'charging_station'
                      ? 'bg-amber-500'
                      : 'bg-blue-500'
                  }`}
                />
                <div>
                  <h3 className="font-mono font-bold text-base text-white">
                    {selectedVehicle.id}
                  </h3>
                  <div className="text-xs text-slate-400">{selectedVehicle.model}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onZoomToVehicle(selectedVehicle)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-mono flex items-center gap-1"
                >
                  <span>Zoom Map</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
                <button
                  onClick={onCloseInspector}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* EV Telemetry Card */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-900 p-3 rounded-xl border border-slate-800 text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-400 block font-sans">SOC</span>
                <span className={`text-base font-bold ${selectedVehicle.soc < 25 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {Math.round(selectedVehicle.soc)}%
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-sans">Battery</span>
                <span className="text-base font-bold text-slate-200">
                  {selectedVehicle.batteryCapacityKwh} kWh
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-sans">
                  {selectedVehicle.status === 'receiver_needed' ? 'Energy Needed' : 'Available'}
                </span>
                <span className="text-base font-bold text-cyan-300">
                  {selectedVehicle.status === 'receiver_needed'
                    ? `${selectedVehicle.energyDemandKwh} kWh`
                    : `${selectedVehicle.availableEnergyKwh} kWh`}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-sans">V2X Comm</span>
                <span className="text-base font-bold text-purple-300">
                  {selectedVehicle.commQuality}
                </span>
              </div>
            </div>

            {/* Current Assignment Badge if mapped (Section 10) */}
            {selectedVehicle.assignedToId && (
              <div className="p-3 rounded-xl bg-cyan-950/50 border border-cyan-800/60 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold block">
                    Current Assignment
                  </span>
                  <div className="font-mono font-bold text-sm text-white mt-0.5">
                    Mapped to {selectedVehicle.assignedToId} ({selectedVehicle.assignedType?.toUpperCase()})
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-cyan-900 text-cyan-200 text-[11px] font-mono capitalize">
                  {selectedVehicle.assignmentStatus || 'Active'}
                </span>
              </div>
            )}

            {/* RECOMMENDED ACTION & DETERMINISTIC REASONS (Section 4, 5, 12, 16) */}
            {recommendation && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-700/80">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                      Recommended Action
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 text-[10px] font-mono border border-amber-800">
                      {recommendation.recommendedType === 'v2v' ? 'V2V DISPATCH' : 'CHARGING STATION'}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-2">
                    {recommendation.recommendedType === 'v2v'
                      ? `V2V Transfer from ${recommendation.primaryTargetName}`
                      : `Navigate to ${recommendation.primaryTargetName}`}
                  </h4>
                  <p className="text-xs text-slate-300 italic mb-3">
                    "{recommendation.summarySentence}"
                  </p>

                  {/* WHY THIS WAS SELECTED (Section 5, 16) */}
                  <div className="mt-3 pt-3 border-t border-slate-800">
                    <div className="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Why Selected:</span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-200">
                      {recommendation.whyPrimary.map((reason, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-emerald-400 font-bold">✓</span>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* WHY OTHER OPTIONS WERE NOT SELECTED (Section 6, 12, 16) */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-xs font-bold text-rose-400 mb-2 flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span>Why Alternative Options Were Rejected:</span>
                  </div>
                  <div className="space-y-2.5 mt-2">
                    {recommendation.whyOthersRejected.map((alt, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-xs"
                      >
                        <div className="font-mono font-semibold text-slate-300 mb-1 flex items-center justify-between">
                          <span>{alt.targetName}</span>
                          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            {alt.type}
                          </span>
                        </div>
                        <ul className="space-y-1 text-slate-400 text-[11px]">
                          {alt.reasons.map((r, rIdx) => (
                            <li key={rIdx} className="flex items-start gap-1.5 text-rose-300/90">
                              <span className="text-rose-400 font-bold">✗</span>
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>

                {/* V2V Candidates Comparison Table (Section 6) */}
                {recommendation.donorEvaluations.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-xs font-bold text-slate-300 mb-2 flex items-center justify-between">
                      <span>Evaluated Nearby Donor Candidates</span>
                      <span className="text-[10px] text-slate-400">Ranked by score</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] text-left">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400">
                            <th className="pb-1">Donor</th>
                            <th className="pb-1 text-right">Dist</th>
                            <th className="pb-1 text-right">SOC</th>
                            <th className="pb-1 text-right">Energy</th>
                            <th className="pb-1 text-center">Comm</th>
                            <th className="pb-1 text-right">Result</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {recommendation.donorEvaluations.slice(0, 4).map((d) => (
                            <tr
                              key={d.donorId}
                              className={d.selected ? 'bg-emerald-950/30 text-emerald-200' : 'text-slate-300'}
                            >
                              <td className="py-1.5 font-mono font-semibold">{d.donorId}</td>
                              <td className="py-1.5 text-right font-mono">{d.distanceKm} km</td>
                              <td className="py-1.5 text-right font-mono">{d.donorSoc}%</td>
                              <td className="py-1.5 text-right font-mono">{d.availableEnergyKwh} kWh</td>
                              <td className="py-1.5 text-center">{d.commQuality}</td>
                              <td className="py-1.5 text-right font-semibold">
                                {d.selected ? (
                                  <span className="text-emerald-400">✓ Selected</span>
                                ) : (
                                  <span className="text-slate-500">Not selected</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* When no single EV is selected: Tabs for LIVE ASSIGNMENTS, ALL EVS, STATIONS (Section 11) */
          <div>
            {/* View Switcher Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-900/40 text-xs">
              <button
                onClick={() => setActiveTab('assignments')}
                className={`flex-1 py-2.5 font-semibold text-center transition-colors border-b-2 ${
                  activeTab === 'assignments'
                    ? 'border-cyan-500 text-cyan-400 bg-slate-900/80'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                Live Assignments ({assignments.length})
              </button>
              <button
                onClick={() => setActiveTab('fleet')}
                className={`flex-1 py-2.5 font-semibold text-center transition-colors border-b-2 ${
                  activeTab === 'fleet'
                    ? 'border-cyan-500 text-cyan-400 bg-slate-900/80'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                Fleet EVs ({vehicles.length})
              </button>
              <button
                onClick={() => setActiveTab('stations')}
                className={`flex-1 py-2.5 font-semibold text-center transition-colors border-b-2 ${
                  activeTab === 'stations'
                    ? 'border-cyan-500 text-cyan-400 bg-slate-900/80'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                Stations ({stations.length})
              </button>
            </div>

            {/* TAB 1: LIVE ASSIGNMENTS (Requirement 2, 3, 4, 5) */}
            {activeTab === 'assignments' && (
              <div className="p-3 space-y-3">
                <div className="text-[11px] text-slate-400 flex items-center justify-between mb-1">
                  <span>Click an assignment to select EV, focus map & view full reasons</span>
                  <span className="font-mono text-cyan-400 font-bold">{assignments.length} live assignments</span>
                </div>

                {assignments.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800">
                    No active assignments in simulation. Use Demo Controls above to request V2V or dispatch to station.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {assignments.map((record, index) => (
                      <div
                        key={`${record.evId}-${index}`}
                        onClick={() => onZoomToAssignment(record)}
                        className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-cyan-600/80 cursor-pointer transition-all hover:shadow-lg group"
                      >
                        {/* Header: EV -> Assigned To -> Type -> Status */}
                        <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                          <div className="flex items-center gap-1.5 font-mono text-xs">
                            <span className="font-bold text-cyan-300 group-hover:underline">{record.evId}</span>
                            <span className="text-slate-500">→</span>
                            <span className="font-bold text-white">{record.assignedToName}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                record.type === 'V2V'
                                  ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                  : 'bg-amber-950 text-amber-300 border border-amber-800'
                              }`}
                            >
                              {record.type}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                record.status === 'Active'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 animate-pulse'
                                  : record.status === 'Charging'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : record.status === 'Navigating'
                                  ? 'bg-orange-950 text-orange-300 border border-orange-800'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {record.status}
                            </span>
                          </div>
                        </div>

                        {/* Metric Row */}
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-2">
                          <span>Distance: <strong className="text-slate-200">{record.distanceKm} km</strong></span>
                          <span>Energy: <strong className="text-emerald-400">{record.energyKwh} kWh</strong></span>
                          <span className="text-cyan-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 text-[10px]">
                            <span>View Map</span>
                            <ChevronRight className="w-3 h-3" />
                          </span>
                        </div>

                        {/* Primary Reason */}
                        <div className="mt-2 text-xs text-slate-300 bg-slate-950/60 p-2 rounded-lg border border-slate-800/60 font-sans">
                          <span className="text-[10px] text-slate-400 uppercase font-mono block font-semibold">Reason:</span>
                          {record.reason}
                        </div>

                        {/* SELECTED BECAUSE (Requirement 4) */}
                        {record.whySelected && record.whySelected.length > 0 && (
                          <div className="mt-2 text-[11px] bg-emerald-950/20 border border-emerald-900/40 p-2 rounded-lg space-y-0.5">
                            <span className="text-[10px] font-mono font-bold uppercase text-emerald-400 block">
                              SELECTED BECAUSE:
                            </span>
                            {record.whySelected.map((bullet, bIdx) => (
                              <div key={bIdx} className="text-emerald-300/90 font-mono text-[10.5px]">
                                {bullet}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* NOT SELECTED BECAUSE (Requirement 5) */}
                        {record.rejectedAlternatives && record.rejectedAlternatives.length > 0 && (
                          <div className="mt-1.5 text-[11px] bg-rose-950/20 border border-rose-900/40 p-2 rounded-lg space-y-0.5">
                            <span className="text-[10px] font-mono font-bold uppercase text-rose-400 block">
                              NOT SELECTED BECAUSE:
                            </span>
                            {record.rejectedAlternatives.map((alt, aIdx) => (
                              <div key={aIdx} className="text-rose-300/80 font-mono text-[10px] flex items-center justify-between">
                                <span>{alt.id}</span>
                                <span className="text-slate-400 font-sans">✗ {alt.reason}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: ALL FLEET EVS */}
            {activeTab === 'fleet' && (
              <div className="p-3 divide-y divide-slate-800">
                {vehicles.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => onSelectVehicle(ev)}
                    className="py-2.5 flex items-center justify-between hover:bg-slate-900/60 px-2 rounded-lg cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${
                          ev.status === 'donor_available'
                            ? 'bg-emerald-500'
                            : ev.status === 'receiver_needed'
                            ? 'bg-rose-500 animate-pulse'
                            : ev.status === 'v2v_active'
                            ? 'bg-purple-500'
                            : ev.status === 'charging_station'
                            ? 'bg-amber-500'
                            : 'bg-blue-500'
                        }`}
                      />
                      <div>
                        <div className="font-mono font-bold text-xs text-white flex items-center gap-2">
                          <span>{ev.id}</span>
                          <span className="text-[10px] font-normal text-slate-400">{ev.model}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>SOC: {Math.round(ev.soc)}%</span>
                          <span>·</span>
                          <span className="capitalize">{ev.status.replace('_', ' ')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right font-mono text-xs">
                        {ev.status === 'receiver_needed' ? (
                          <span className="text-rose-400 font-bold">-{ev.energyDemandKwh} kWh</span>
                        ) : ev.status === 'donor_available' ? (
                          <span className="text-emerald-400 font-bold">+{ev.availableEnergyKwh} kWh</span>
                        ) : (
                          <span className="text-slate-500">Neutral</span>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB 3: CHARGING STATIONS */}
            {activeTab === 'stations' && (
              <div className="p-3 space-y-2">
                {stations.map((st) => (
                  <div
                    key={st.id}
                    className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>{st.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {st.powerKw} kW {st.stationType} · {st.connectorType}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{st.address}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-400">
                        {st.availableChargers} / {st.totalChargers} open
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {st.estWaitMinutes === 0 ? 'No wait' : `~${st.estWaitMinutes} min wait`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
