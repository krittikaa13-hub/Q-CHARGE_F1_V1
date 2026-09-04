import React, { useEffect, useState } from 'react';
import {
  RoleType,
  EVVehicle,
  ChargingStation,
  ActiveV2VSession,
  FilterOptions,
  AssignmentRecord,
} from './types';
import { simulation } from './services/simulation';
import { Navbar } from './components/Navbar';
import { DemoControlBar } from './components/DemoControlBar';
import { FleetMap } from './components/FleetMap';
import { AdminView } from './components/AdminView';
import { DonorView } from './components/DonorView';
import { ReceiverView } from './components/ReceiverView';
import { GuidedDemoModal } from './components/GuidedDemoModal';

export default function App() {
  const [vehicles, setVehicles] = useState<EVVehicle[]>([]);
  const [stations, setStations] = useState<ChargingStation[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveV2VSession[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());

  // Role and Selection States
  const [currentRole, setCurrentRole] = useState<RoleType>('admin');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>('EV-014');
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

  const [selectedDonorId, setSelectedDonorId] = useState<string>('EV-007');
  const [selectedReceiverId, setSelectedReceiverId] = useState<string>('EV-014');

  const [focusTarget, setFocusTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(
    null
  );

  const [isDemoGuideOpen, setIsDemoGuideOpen] = useState<boolean>(false);

  // Filters State
  const [filters, setFilters] = useState<FilterOptions>({
    vehicleType: 'all',
    stationType: 'all',
    status: 'all',
    socLevel: 'all',
    v2vFilter: 'all',
    searchQuery: '',
  });

  // Subscribe to real-time simulation updates
  useEffect(() => {
    simulation.start();
    const unsubscribe = simulation.subscribe((state) => {
      setVehicles(state.vehicles);
      setStations(state.stations);
      setActiveSessions(state.activeSessions);
      setLastUpdated(state.lastUpdated);
    });

    return () => {
      unsubscribe();
      simulation.stop();
    };
  }, []);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) || null;
  const selectedStation = stations.find((s) => s.id === selectedStationId) || null;
  const liveAssignments = simulation.getLiveAssignments();

  // Handlers
  const handleSelectVehicle = (vehicle: EVVehicle) => {
    setSelectedVehicleId(vehicle.id);
    setSelectedStationId(null);
    setFocusTarget({ lat: vehicle.lat, lng: vehicle.lng, zoom: 15 });

    if (vehicle.status === 'donor_available' || vehicle.soc >= 60) {
      setSelectedDonorId(vehicle.id);
    } else if (vehicle.status === 'receiver_needed' || vehicle.soc < 35) {
      setSelectedReceiverId(vehicle.id);
    }
  };

  const handleSelectStation = (station: ChargingStation) => {
    setSelectedStationId(station.id);
    setSelectedVehicleId(null);
    setFocusTarget({ lat: station.lat, lng: station.lng, zoom: 15 });
  };

  const handleZoomToAssignment = (record: AssignmentRecord) => {
    const ev = vehicles.find((v) => v.id === record.evId);
    if (ev) {
      setSelectedVehicleId(ev.id);
      setFocusTarget({ lat: ev.lat, lng: ev.lng, zoom: 15 });
    }
  };

  const handleDemoReset = () => {
    simulation.resetDemo();
    setSelectedVehicleId('EV-014');
    setSelectedDonorId('EV-007');
    setSelectedReceiverId('EV-014');
    setFocusTarget({ lat: 37.3365, lng: -121.8900, zoom: 15 });
  };

  const handleDemoCreateReceiver = () => {
    simulation.createReceiver('EV-014');
    setSelectedVehicleId('EV-014');
    setSelectedReceiverId('EV-014');
    setFocusTarget({ lat: 37.3365, lng: -121.8900, zoom: 16 });
  };

  const handleDemoFindMatch = () => {
    const receiver = vehicles.find((v) => v.id === 'EV-014') || selectedVehicle;
    if (receiver) {
      setSelectedVehicleId(receiver.id);
      setFocusTarget({ lat: receiver.lat, lng: receiver.lng, zoom: 16 });
    }
  };

  const handleDemoRequestV2V = () => {
    simulation.requestV2V('EV-014', 'EV-007', 18);
    setSelectedVehicleId('EV-014');
    setFocusTarget({ lat: 37.3365, lng: -121.8900, zoom: 15 });
  };

  const handleDemoAcceptV2V = () => {
    simulation.acceptV2VRequest('EV-007', 'EV-014');
    setSelectedVehicleId('EV-014');
    setFocusTarget({ lat: 37.3365, lng: -121.8900, zoom: 15 });
  };

  const handleDemoStartTransfer = () => {
    simulation.advanceTransfer(25);
  };

  const handleDemoSendToStation = () => {
    simulation.assignToStation('EV-021', 'ST-008');
    const ev21 = vehicles.find((v) => v.id === 'EV-021');
    if (ev21) {
      setSelectedVehicleId('EV-021');
      setFocusTarget({ lat: ev21.lat, lng: ev21.lng, zoom: 15 });
    }
  };

  const handleDemoDecline = () => {
    simulation.declineV2VRequest('EV-007', 'EV-014');
  };

  const handleDemoFailure = () => {
    simulation.simulateTransferFailure();
  };

  const handleDemoStepEvent = () => {
    const step = simulation.stepDemoEvent();
    if (step <= 10) {
      setSelectedVehicleId('EV-014');
      setFocusTarget({ lat: 37.3365, lng: -121.8900, zoom: 15 });
    } else {
      setSelectedVehicleId('EV-021');
      setFocusTarget({ lat: 37.3225, lng: -121.9475, zoom: 15 });
    }
  };

  const currentReceiver = vehicles.find((v) => v.id === 'EV-014') || null;
  const currentDonor = vehicles.find((v) => v.id === 'EV-007') || null;
  const activeV2VSession = activeSessions.find((s) => s.status === 'active') || null;
  const isV2VPending = vehicles.some((v) => v.assignedType === 'v2v' && (v.assignmentStatus === 'pending' || v.assignmentStatus === 'V2V_PENDING' || v.assignmentStatus === 'V2V_REQUESTED'));
  const isStationNavigating = vehicles.some((v) => v.assignedType === 'station');

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans">
      {/* Top Navbar */}
      <Navbar
        currentRole={currentRole}
        onSelectRole={(role) => setCurrentRole(role)}
        lastUpdated={lastUpdated}
        onOpenDemoGuide={() => setIsDemoGuideOpen(true)}
      />

      {/* Demo Controls Toolbar (Requirement 14 & Scenarios 1-37) */}
      <DemoControlBar
        onResetDemo={handleDemoReset}
        onCreateReceiver={handleDemoCreateReceiver}
        onFindBestMatch={handleDemoFindMatch}
        onRequestV2V={handleDemoRequestV2V}
        onAcceptV2V={handleDemoAcceptV2V}
        onStartTransfer={handleDemoStartTransfer}
        onSendToStation={handleDemoSendToStation}
        onDeclineV2V={handleDemoDecline}
        onSimulateFailure={handleDemoFailure}
        onStepDemoEvent={handleDemoStepEvent}
        currentDemoStep={simulation.getDemoStep()}
        lastActionMessage={simulation.getLastActionMessage()}
        currentReceiver={currentReceiver}
        currentDonor={currentDonor}
        activeSession={activeV2VSession}
        isV2VPending={isV2VPending}
        isStationNavigating={isStationNavigating}
      />

      {/* Main Content Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Left Side: Specific Role Interface */}
        <div className="w-full md:w-auto z-10 shrink-0 h-1/2 md:h-full">
          {currentRole === 'admin' && (
            <AdminView
              vehicles={vehicles}
              stations={stations}
              activeSessions={activeSessions}
              assignments={liveAssignments}
              selectedVehicle={selectedVehicle}
              selectedStation={selectedStation}
              filters={filters}
              onFilterChange={(f) => setFilters(f)}
              onSelectVehicle={handleSelectVehicle}
              onSelectStation={handleSelectStation}
              onZoomToVehicle={(ev) => setFocusTarget({ lat: ev.lat, lng: ev.lng, zoom: 16 })}
              onZoomToAssignment={handleZoomToAssignment}
              onCloseInspector={() => setSelectedVehicleId(null)}
            />
          )}

          {currentRole === 'donor' && (
            <DonorView
              vehicles={vehicles}
              activeSessions={activeSessions}
              selectedDonorId={selectedDonorId}
              onSelectDonorId={(id) => setSelectedDonorId(id)}
              onViewOnMap={(ev) => {
                setSelectedVehicleId(ev.id);
                setFocusTarget({ lat: ev.lat, lng: ev.lng, zoom: 16 });
              }}
            />
          )}

          {currentRole === 'receiver' && (
            <ReceiverView
              vehicles={vehicles}
              stations={stations}
              activeSessions={activeSessions}
              selectedReceiverId={selectedReceiverId}
              onSelectReceiverId={(id) => setSelectedReceiverId(id)}
              onViewOnMap={(ev) => {
                setSelectedVehicleId(ev.id);
                setFocusTarget({ lat: ev.lat, lng: ev.lng, zoom: 16 });
              }}
            />
          )}
        </div>

        {/* Right Side: Real-Time Fleet Map */}
        <div className="flex-1 h-1/2 md:h-full relative overflow-hidden">
          <FleetMap
            vehicles={vehicles}
            stations={stations}
            activeSessions={activeSessions}
            selectedVehicleId={selectedVehicleId}
            selectedStationId={selectedStationId}
            filters={filters}
            focusTarget={focusTarget}
            onSelectVehicle={handleSelectVehicle}
            onSelectStation={handleSelectStation}
          />
        </div>
      </div>

      {/* Interactive Guided Demo Tour Modal */}
      <GuidedDemoModal
        isOpen={isDemoGuideOpen}
        onClose={() => setIsDemoGuideOpen(false)}
        onSelectRole={(role) => setCurrentRole(role)}
        onSelectVehicle={handleSelectVehicle}
        vehicles={vehicles}
        stations={stations}
      />
    </div>
  );
}
