import { EVVehicle, ChargingStation, ActiveV2VSession, AssignmentRecord } from '../types';
import { INITIAL_EVS, INITIAL_STATIONS, INITIAL_ACTIVE_SESSIONS } from '../data/initialData';
import { classifyVehicleStatus } from './classification';
import { calculateDistanceKm } from './decisionEngine';

export class FleetSimulationEngine {
  private vehicles: EVVehicle[];
  private stations: ChargingStation[];
  private activeSessions: ActiveV2VSession[];
  private lastUpdated: number;
  private listeners: ((state: {
    vehicles: EVVehicle[];
    stations: ChargingStation[];
    activeSessions: ActiveV2VSession[];
    lastUpdated: number;
  }) => void)[] = [];
  private intervalId: number | null = null;
  private isRunning: boolean = true;
  private updateRateMs: number = 3500;
  private currentDemoStep: number = 0;
  private lastActionMessage: string = 'System ready.';
  private activeTransferTimer: number | null = null;
  private activeStationTimer: number | null = null;
  private stageTimeoutId: number | null = null;
  private isCommPaused: boolean = false;

  constructor() {
    this.vehicles = JSON.parse(JSON.stringify(INITIAL_EVS));
    this.stations = JSON.parse(JSON.stringify(INITIAL_STATIONS));
    this.activeSessions = JSON.parse(JSON.stringify(INITIAL_ACTIVE_SESSIONS));
    this.lastUpdated = Date.now();
  }

  private clearTimers() {
    if (this.activeTransferTimer !== null) {
      clearInterval(this.activeTransferTimer);
      this.activeTransferTimer = null;
    }
    if (this.activeStationTimer !== null) {
      clearInterval(this.activeStationTimer);
      this.activeStationTimer = null;
    }
    if (this.stageTimeoutId !== null) {
      clearTimeout(this.stageTimeoutId);
      this.stageTimeoutId = null;
    }
    this.isCommPaused = false;
  }

  public getDemoStep() {
    return this.currentDemoStep;
  }

  public getLastActionMessage() {
    return this.lastActionMessage;
  }

  public start() {
    if (this.intervalId !== null) return;
    this.isRunning = true;
    this.intervalId = window.setInterval(() => {
      this.tick();
    }, this.updateRateMs);
  }

  public stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.notify();
  }

  public togglePlay() {
    if (this.isRunning) {
      this.stop();
    } else {
      this.start();
    }
    return this.isRunning;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public step() {
    this.tick();
  }

  public subscribe(
    callback: (state: {
      vehicles: EVVehicle[];
      stations: ChargingStation[];
      activeSessions: ActiveV2VSession[];
      lastUpdated: number;
    }) => void
  ) {
    this.listeners.push(callback);
    callback({
      vehicles: this.vehicles,
      stations: this.stations,
      activeSessions: this.activeSessions,
      lastUpdated: this.lastUpdated,
    });
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private notify() {
    this.lastUpdated = Date.now();
    const payload = {
      vehicles: [...this.vehicles],
      stations: [...this.stations],
      activeSessions: [...this.activeSessions],
      lastUpdated: this.lastUpdated,
    };
    for (const listener of this.listeners) {
      listener(payload);
    }
  }

  public tick() {
    // 1. Move vehicles along their heading slightly if moving
    this.vehicles = this.vehicles.map((ev) => {
      let { lat, lng, speedKmh, headingDeg, soc, batteryCapacityKwh, status } = ev;

      // Don't move vehicles currently actively in stationary V2V or plugged into station
      const isParked = status === 'charging_station' && ev.assignmentStatus === 'charging';
      const isV2VStationary = status === 'v2v_active';

      if (!isParked && !isV2VStationary && speedKmh > 0) {
        // Compute delta lat/lng based on speed and heading
        // ~1 deg lat is ~111 km; in 3.5s at 30km/h distance is ~0.029 km
        const distKm = (speedKmh / 3600) * (this.updateRateMs / 1000);
        const rad = (headingDeg * Math.PI) / 180;
        const dLat = (distKm * Math.cos(rad)) / 111;
        const dLng = (distKm * Math.sin(rad)) / (111 * Math.cos((lat * Math.PI) / 180));

        lat += dLat;
        lng += dLng;

        // Keep within San Jose bounding box [37.28 to 37.38, -121.96 to -121.86]
        if (lat > 37.385 || lat < 37.28) headingDeg = (headingDeg + 180) % 360;
        if (lng > -121.86 || lng < -121.965) headingDeg = (headingDeg + 180) % 360;

        // Slight micro heading jitter for realistic movement
        headingDeg = (headingDeg + (Math.random() * 8 - 4) + 360) % 360;
      }

      // Micro consumption while driving
      if (speedKmh > 0 && Math.random() > 0.6) {
        soc = Math.max(5, Math.round((soc - 0.05) * 10) / 10);
      }

      // If charging at station
      if (status === 'charging_station' && ev.assignmentStatus === 'charging') {
        soc = Math.min(100, Math.round((soc + 0.35) * 10) / 10);
      }

      const currentKwh = Math.round((soc / 100) * batteryCapacityKwh * 10) / 10;
      const reserveKwh = (ev.minReserveSoc / 100) * batteryCapacityKwh;
      const availableEnergyKwh = Math.max(0, Math.round((currentKwh - reserveKwh) * 10) / 10);

      return {
        ...ev,
        lat: Math.round(lat * 100000) / 100000,
        lng: Math.round(lng * 100000) / 100000,
        headingDeg: Math.round(headingDeg),
        soc,
        currentKwh,
        availableEnergyKwh,
      };
    });

    // 2. Process active V2V sessions
    this.activeSessions = this.activeSessions.map((session) => {
      if (session.status !== 'active') return session;

      const progressStep = 4; // increment 4% per tick
      const newProgress = Math.min(100, session.progressPct + progressStep);
      const transferredKwh = Math.round((session.requestedKwh * (newProgress / 100)) * 10) / 10;

      // Update donor & receiver vehicles
      const donor = this.vehicles.find((v) => v.id === session.donorId);
      const receiver = this.vehicles.find((v) => v.id === session.receiverId);

      if (donor && receiver) {
        // Donor transfers out
        const kwhStep = (session.requestedKwh * (progressStep / 100));
        const donorSocDrop = (kwhStep / donor.batteryCapacityKwh) * 100;
        donor.soc = Math.max(donor.minReserveSoc, Math.round((donor.soc - donorSocDrop) * 10) / 10);
        donor.currentKwh = Math.round((donor.soc / 100) * donor.batteryCapacityKwh * 10) / 10;

        // Receiver receives (with 94% efficiency)
        const receiverSocGain = ((kwhStep * (session.efficiencyPct / 100)) / receiver.batteryCapacityKwh) * 100;
        receiver.soc = Math.min(95, Math.round((receiver.soc + receiverSocGain) * 10) / 10);
        receiver.currentKwh = Math.round((receiver.soc / 100) * receiver.batteryCapacityKwh * 10) / 10;
        receiver.energyDemandKwh = Math.max(0, Math.round((receiver.energyDemandKwh - kwhStep) * 10) / 10);

        if (newProgress >= 100) {
          // Session Completed!
          donor.assignedToId = undefined;
          donor.assignedType = 'none';
          donor.assignmentStatus = 'completed';
          donor.status = classifyVehicleStatus(donor, []);

          receiver.assignedToId = undefined;
          receiver.assignedType = 'none';
          receiver.assignmentStatus = 'completed';
          receiver.status = classifyVehicleStatus(receiver, []);

          return {
            ...session,
            progressPct: 100,
            transferredKwh: session.requestedKwh,
            status: 'completed',
          };
        }
      }

      return {
        ...session,
        progressPct: newProgress,
        transferredKwh,
      };
    });

    this.notify();
  }

  // --- ACTIONS ---

  public createReceiver(evId: string = 'EV-014') {
    const ev = this.vehicles.find((v) => v.id === evId);
    if (ev) {
      ev.soc = 22;
      ev.currentKwh = Math.round((22 / 100) * ev.batteryCapacityKwh * 10) / 10;
      ev.energyDemandKwh = 18;
      ev.availableEnergyKwh = 0;
      ev.assignedToId = undefined;
      ev.assignedType = 'none';
      ev.assignmentStatus = undefined;
      ev.status = 'receiver_needed';
      this.notify();
    }
  }

  public advanceTransfer(deltaPct: number = 20) {
    let session = this.activeSessions.find((s) => s.status === 'active');
    if (!session) {
      const donor =
        this.vehicles.find((v) => v.id === 'EV-007') ||
        this.vehicles.find((v) => v.assignedType === 'v2v' && (v.status === 'donor_available' || v.soc >= 60));
      const receiver =
        this.vehicles.find((v) => v.id === 'EV-014') ||
        this.vehicles.find((v) => v.status === 'receiver_needed');
      if (donor && receiver) {
        this.clearTimers();
        this.startActiveV2VTransfer(donor.id, receiver.id);
        return;
      }
    }

    if (session) {
      this.tickActiveTransfer();
    }
  }

  public requestV2V(receiverId: string, donorId: string, requestedKwh: number = 12) {
    const receiver = this.vehicles.find((v) => v.id === receiverId);
    const donor = this.vehicles.find((v) => v.id === donorId);
    if (!receiver || !donor) return false;

    receiver.assignedToId = donorId;
    receiver.assignedType = 'v2v';
    receiver.assignmentStatus = 'V2V_REQUESTED';

    donor.assignedToId = receiverId;
    donor.assignedType = 'v2v';
    donor.assignmentStatus = 'V2V_REQUESTED';

    // Move them towards each other
    donor.targetLat = receiver.lat;
    donor.targetLng = receiver.lng;

    this.lastActionMessage = `Receiver ${receiverId} requested V2V transfer from Donor ${donorId} (${requestedKwh} kWh). Status: V2V_REQUESTED.`;
    this.notify();
    return true;
  }

  public acceptV2VRequest(donorId: string, receiverId: string) {
    const donor = this.vehicles.find((v) => v.id === donorId);
    const receiver = this.vehicles.find((v) => v.id === receiverId);
    if (!donor || !receiver) return false;

    this.clearTimers();

    // Step 1 Immediately: V2V_ACCEPTED / V2V_CONFIRMED / TRANSFER_READY
    donor.status = 'donor_available';
    donor.assignmentStatus = 'TRANSFER_READY';
    donor.assignedToId = receiverId;
    donor.assignedType = 'v2v';
    donor.speedKmh = 0;

    receiver.status = 'receiver_needed';
    receiver.assignmentStatus = 'V2V_CONFIRMED';
    receiver.assignedToId = donorId;
    receiver.assignedType = 'v2v';
    receiver.speedKmh = 0;

    this.lastActionMessage = `Donor ${donorId} ACCEPTED V2V request from ${receiverId}. Handshake established: V2V CONFIRMED / TRANSFER READY. Initializing session...`;
    this.notify();

    // Step 2 After 1000ms: V2V SESSION INITIALIZING with constraint validation
    this.stageTimeoutId = window.setTimeout(() => {
      const currentDonor = this.vehicles.find((v) => v.id === donorId);
      const currentReceiver = this.vehicles.find((v) => v.id === receiverId);
      if (!currentDonor || !currentReceiver) return;

      currentDonor.assignmentStatus = 'V2V_INITIALIZING';
      currentReceiver.assignmentStatus = 'V2V_INITIALIZING';

      const socVal = Math.round(currentDonor.soc);
      const reqVal = currentReceiver.energyDemandKwh > 0 ? currentReceiver.energyDemandKwh : 12;
      this.lastActionMessage = `V2V SESSION INITIALIZING: Validated donor SOC (${socVal}%), demand (${reqVal} kWh), distance (1.1 km), comm (Excellent -62 dBm), power (20 kW)... ALL CONSTRAINTS PASSED.`;
      this.notify();

      // Step 3 After 1000ms: V2V ACTIVE session start and automatic transfer simulation
      this.stageTimeoutId = window.setTimeout(() => {
        this.startActiveV2VTransfer(donorId, receiverId);
      }, 1000);
    }, 1000);

    return true;
  }

  private startActiveV2VTransfer(donorId: string, receiverId: string) {
    const donor = this.vehicles.find((v) => v.id === donorId);
    const receiver = this.vehicles.find((v) => v.id === receiverId);
    if (!donor || !receiver) return;

    donor.status = 'v2v_active';
    donor.assignmentStatus = 'V2V_ACTIVE';
    donor.speedKmh = 0;

    receiver.status = 'v2v_active';
    receiver.assignmentStatus = 'V2V_ACTIVE';
    receiver.speedKmh = 0;

    const requestedKwh = receiver.energyDemandKwh > 0 ? Math.min(18, receiver.energyDemandKwh) : 12;

    const newSession: ActiveV2VSession = {
      sessionId: `V2V-${donorId}-${receiverId}-${Date.now()}`,
      donorId,
      receiverId,
      requestedKwh,
      transferredKwh: 0,
      powerKw: 20,
      efficiencyPct: 94,
      progressPct: 0,
      status: 'active',
      startTime: Date.now(),
      durationSeconds: 90,
    };

    // Remove any previous active sessions between them
    this.activeSessions = this.activeSessions.filter((s) => s.status !== 'active');
    this.activeSessions.unshift(newSession);

    this.lastActionMessage = `V2V ACTIVE: Power transfer engaged between ${donorId} and ${receiverId} (20 kW, 94% efficiency). Transfer simulation running...`;
    this.notify();

    // Start automatic transfer ticker interval
    this.startActiveTransferTicker();
  }

  private startActiveTransferTicker() {
    if (this.activeTransferTimer !== null) {
      clearInterval(this.activeTransferTimer);
    }

    this.activeTransferTimer = window.setInterval(() => {
      this.tickActiveTransfer();
    }, 1000);
  }

  private tickActiveTransfer() {
    if (this.isCommPaused) {
      return;
    }

    const session = this.activeSessions.find((s) => s.status === 'active');
    if (!session) {
      if (this.activeTransferTimer !== null) {
        clearInterval(this.activeTransferTimer);
        this.activeTransferTimer = null;
      }
      return;
    }

    const donor = this.vehicles.find((v) => v.id === session.donorId);
    const receiver = this.vehicles.find((v) => v.id === session.receiverId);
    if (!donor || !receiver) return;

    const nextProgress = Math.min(100, session.progressPct + 10);
    session.progressPct = nextProgress;

    // Physical energy calculations
    const transferredKwh = Math.round((session.requestedKwh * (nextProgress / 100)) * 10) / 10;
    session.transferredKwh = transferredKwh;

    const stepKwh = session.requestedKwh * 0.10; // 10% chunk
    const donorSocDrop = (stepKwh / donor.batteryCapacityKwh) * 100;
    const receivedKwh = stepKwh * (session.efficiencyPct / 100);
    const receiverSocGain = (receivedKwh / receiver.batteryCapacityKwh) * 100;

    donor.soc = Math.max(donor.minReserveSoc, Math.round((donor.soc - donorSocDrop) * 10) / 10);
    donor.currentKwh = Math.round((donor.soc / 100) * donor.batteryCapacityKwh * 10) / 10;
    const reserveKwh = (donor.minReserveSoc / 100) * donor.batteryCapacityKwh;
    donor.availableEnergyKwh = Math.max(0, Math.round((donor.currentKwh - reserveKwh) * 10) / 10);

    receiver.soc = Math.min(95, Math.round((receiver.soc + receiverSocGain) * 10) / 10);
    receiver.currentKwh = Math.round((receiver.soc / 100) * receiver.batteryCapacityKwh * 10) / 10;
    receiver.energyDemandKwh = Math.max(0, Math.round((receiver.energyDemandKwh - stepKwh) * 10) / 10);

    this.lastActionMessage = `V2V Transfer: ${nextProgress}% (${transferredKwh}/${session.requestedKwh} kWh). Donor ${donor.id}: ${Math.round(donor.soc)}% SOC, Receiver ${receiver.id}: ${Math.round(receiver.soc)}% SOC.`;
    this.notify();

    if (nextProgress >= 100) {
      if (this.activeTransferTimer !== null) {
        clearInterval(this.activeTransferTimer);
        this.activeTransferTimer = null;
      }
      this.completeV2VTransfer(session.sessionId);
    }
  }

  public completeV2VTransfer(sessionId: string) {
    const session = this.activeSessions.find((s) => s.sessionId === sessionId);
    if (!session) return;

    session.status = 'completed';
    session.progressPct = 100;
    session.transferredKwh = session.requestedKwh;

    const donor = this.vehicles.find((v) => v.id === session.donorId);
    const receiver = this.vehicles.find((v) => v.id === session.receiverId);

    if (donor) {
      donor.assignedToId = undefined;
      donor.assignedType = 'none';
      donor.assignmentStatus = 'DONATION_COMPLETED';
      donor.status = classifyVehicleStatus(donor, []);
    }

    if (receiver) {
      receiver.assignedToId = undefined;
      receiver.assignedType = 'none';
      receiver.assignmentStatus = 'ENERGY_RECEIVED';
      receiver.energyDemandKwh = 0;
      receiver.status = classifyVehicleStatus(receiver, []);
    }

    this.lastActionMessage = `V2V Transfer Completed: ${session.requestedKwh} kWh delivered (94% efficiency). Donor: DONATION COMPLETED. Receiver: ENERGY RECEIVED. Fleet auto re-evaluated.`;

    // Automated re-evaluation: check if other vehicles need energy (e.g. EV-021)
    const pendingReceiver = this.vehicles.find(
      (v) => v.id !== session.receiverId && (v.status === 'receiver_needed' || v.soc <= 25)
    );
    if (pendingReceiver) {
      this.lastActionMessage += ` Fleet check: ${pendingReceiver.id} flagged for dispatch evaluation.`;
    }

    this.notify();
  }

  public declineV2VRequest(donorId: string, receiverId: string) {
    const donor = this.vehicles.find((v) => v.id === donorId);
    const receiver = this.vehicles.find((v) => v.id === receiverId);
    if (!donor || !receiver) return false;

    this.clearTimers();

    donor.assignedToId = undefined;
    donor.assignedType = 'none';
    donor.assignmentStatus = 'V2V_DECLINED';
    donor.status = classifyVehicleStatus(donor, this.activeSessions);

    if (!receiver.declinedDonorIds) receiver.declinedDonorIds = [];
    if (!receiver.declinedDonorIds.includes(donorId)) {
      receiver.declinedDonorIds.push(donorId);
    }

    // Scenario 19: Search next feasible donor or select charging station
    const nextDonor = this.vehicles.find(
      (v) =>
        v.id !== donorId &&
        v.id !== receiverId &&
        !receiver.declinedDonorIds?.includes(v.id) &&
        (v.status === 'donor_available' || v.soc >= 60) &&
        calculateDistanceKm(receiver.lat, receiver.lng, v.lat, v.lng) <= 5.0
    );

    if (nextDonor) {
      receiver.assignedToId = nextDonor.id;
      receiver.assignedType = 'v2v';
      receiver.assignmentStatus = 'V2V_REQUESTED';
      nextDonor.assignedToId = receiver.id;
      nextDonor.assignedType = 'v2v';
      nextDonor.assignmentStatus = 'V2V_REQUESTED';
      this.lastActionMessage = `Donor ${donorId} declined request. Next feasible donor ${nextDonor.id} recommended and requested.`;
    } else {
      const nearestStation = this.stations.find((s) => s.availableChargers > 0) || this.stations[0];
      this.assignToStation(receiver.id, nearestStation.id);
      this.lastActionMessage = `Donor ${donorId} declined request. No other feasible donors nearby. Automatically dispatched to Charging Station ${nearestStation.name}.`;
    }

    this.notify();
    return true;
  }

  public donorBecomesUnavailable(donorId: string) {
    const donor = this.vehicles.find((v) => v.id === donorId);
    if (!donor) return false;

    const receiverId = donor.assignedToId;
    donor.status = 'unavailable';
    donor.assignmentStatus = 'DONOR_UNAVAILABLE';
    donor.assignedToId = undefined;
    donor.assignedType = 'none';

    this.clearTimers();

    if (receiverId) {
      const receiver = this.vehicles.find((v) => v.id === receiverId);
      if (receiver) {
        if (!receiver.declinedDonorIds) receiver.declinedDonorIds = [];
        receiver.declinedDonorIds.push(donorId);

        const nextDonor = this.vehicles.find(
          (v) =>
            v.id !== donorId &&
            v.id !== receiverId &&
            !receiver.declinedDonorIds?.includes(v.id) &&
            (v.status === 'donor_available' || v.soc >= 60) &&
            calculateDistanceKm(receiver.lat, receiver.lng, v.lat, v.lng) <= 5.0
        );

        if (nextDonor) {
          receiver.assignedToId = nextDonor.id;
          receiver.assignedType = 'v2v';
          receiver.assignmentStatus = 'V2V_REQUESTED';
          nextDonor.assignedToId = receiver.id;
          nextDonor.assignedType = 'v2v';
          nextDonor.assignmentStatus = 'V2V_REQUESTED';
          this.lastActionMessage = `Donor ${donorId} became unavailable. Re-evaluated: Recommended ${nextDonor.id} as new donor.`;
        } else {
          const station = this.stations.find((s) => s.availableChargers > 0) || this.stations[0];
          this.assignToStation(receiver.id, station.id);
          this.lastActionMessage = `Donor ${donorId} became unavailable. No other donor nearby. Re-evaluated: Rerouted ${receiver.id} to ${station.name}.`;
        }
      }
    } else {
      this.lastActionMessage = `Donor ${donorId} set to UNAVAILABLE. Fleet status updated.`;
    }

    this.notify();
    return true;
  }

  public toggleCommPause() {
    this.isCommPaused = !this.isCommPaused;
    const session = this.activeSessions.find((s) => s.status === 'active');
    if (session) {
      const donor = this.vehicles.find((v) => v.id === session.donorId);
      const receiver = this.vehicles.find((v) => v.id === session.receiverId);

      if (this.isCommPaused) {
        if (donor) donor.assignmentStatus = 'TRANSFER_PAUSED';
        if (receiver) receiver.assignmentStatus = 'TRANSFER_PAUSED';
        this.lastActionMessage = `Communication Link Lost (RSSI < -95 dBm). V2V transfer paused. Handshake retry in progress...`;
      } else {
        if (donor) donor.assignmentStatus = 'V2V_ACTIVE';
        if (receiver) receiver.assignmentStatus = 'V2V_ACTIVE';
        this.lastActionMessage = `Communication link restored. V2V transfer resumed.`;
      }
    }
    this.notify();
    return this.isCommPaused;
  }

  public cancelReceiverRequest(receiverId: string) {
    const receiver = this.vehicles.find((v) => v.id === receiverId);
    if (!receiver) return false;

    const donorId = receiver.assignedToId;
    receiver.assignedToId = undefined;
    receiver.assignedType = 'none';
    receiver.assignmentStatus = 'CANCELLED';
    receiver.status = classifyVehicleStatus(receiver, []);

    if (donorId) {
      const donor = this.vehicles.find((v) => v.id === donorId);
      if (donor && donor.assignedToId === receiverId) {
        donor.assignedToId = undefined;
        donor.assignedType = 'none';
        donor.assignmentStatus = undefined;
        donor.status = classifyVehicleStatus(donor, []);
      }
    }

    this.clearTimers();
    this.activeSessions = this.activeSessions.filter(
      (s) => !(s.receiverId === receiverId && s.status === 'active')
    );

    this.lastActionMessage = `Receiver ${receiverId} cancelled the request. Assignment and map connection cleared.`;
    this.notify();
    return true;
  }

  public simulateTransferFailure(sessionId?: string) {
    const session = sessionId
      ? this.activeSessions.find((s) => s.sessionId === sessionId)
      : this.activeSessions.find((s) => s.status === 'active');

    if (!session) return false;

    this.clearTimers();
    session.status = 'completed';
    const donor = this.vehicles.find((v) => v.id === session.donorId);
    const receiver = this.vehicles.find((v) => v.id === session.receiverId);

    if (donor) {
      donor.assignedToId = undefined;
      donor.assignedType = 'none';
      donor.assignmentStatus = 'V2V_FAILED';
      donor.status = classifyVehicleStatus(donor, []);
    }

    if (receiver) {
      // Auto fallback to charging station so receiver is never left stranded
      const targetStation = this.stations.find((s) => s.availableChargers > 0) || this.stations[0];
      this.assignToStation(receiver.id, targetStation.id);
      this.lastActionMessage = `V2V transfer failed (communication lost). Receiver ${receiver.id} automatically rerouted to ${targetStation.name}.`;
    }

    this.notify();
    return true;
  }

  public assignToStation(vehicleId: string, stationId: string) {
    const vehicle = this.vehicles.find((v) => v.id === vehicleId);
    const station = this.stations.find((s) => s.id === stationId);
    if (!vehicle || !station) return false;

    if (this.activeStationTimer !== null) {
      clearInterval(this.activeStationTimer);
      this.activeStationTimer = null;
    }

    vehicle.status = 'charging_station';
    vehicle.assignedToId = stationId;
    vehicle.assignedType = 'station';
    vehicle.assignmentStatus = 'NAVIGATING_TO_STATION';
    vehicle.targetLat = station.lat;
    vehicle.targetLng = station.lng;
    this.lastActionMessage = `Vehicle ${vehicleId} dispatched to ${station.name}. Status: NAVIGATING_TO_STATION. Route displayed on map.`;
    this.notify();

    // Simulate navigation arrival after 2.5 seconds
    setTimeout(() => {
      const v = this.vehicles.find((veh) => veh.id === vehicleId);
      const st = this.stations.find((s) => s.id === stationId);
      if (!v || !st || v.assignedToId !== stationId) return;

      v.lat = st.lat + 0.0002;
      v.lng = st.lng + 0.0002;
      v.speedKmh = 0;
      v.assignmentStatus = 'CHARGING';
      if (st.availableChargers > 0) st.availableChargers -= 1;
      this.lastActionMessage = `Vehicle ${vehicleId} ARRIVED at ${st.name}. Plugged in: CHARGING active (${st.powerKw} kW Fast DC).`;
      this.notify();

      // Station charging progression
      this.activeStationTimer = window.setInterval(() => {
        const currV = this.vehicles.find((veh) => veh.id === vehicleId);
        if (!currV || currV.assignmentStatus !== 'CHARGING') {
          if (this.activeStationTimer !== null) {
            clearInterval(this.activeStationTimer);
            this.activeStationTimer = null;
          }
          return;
        }

        currV.soc = Math.min(80, Math.round(currV.soc + 10));
        currV.currentKwh = Math.round((currV.soc / 100) * currV.batteryCapacityKwh * 10) / 10;
        this.lastActionMessage = `Charging at ${st.name}: ${Math.round(currV.soc)}% SOC (${currV.currentKwh}/${currV.batteryCapacityKwh} kWh).`;
        this.notify();

        if (currV.soc >= 80) {
          if (this.activeStationTimer !== null) {
            clearInterval(this.activeStationTimer);
            this.activeStationTimer = null;
          }
          currV.assignmentStatus = 'CHARGING_COMPLETED';
          currV.energyDemandKwh = 0;
          currV.assignedToId = undefined;
          currV.assignedType = 'none';
          currV.status = 'neutral';
          if (st.availableChargers < st.totalChargers) st.availableChargers += 1;
          this.lastActionMessage = `Charging completed at ${st.name}! Vehicle ${vehicleId} restored to 80% SOC. Returned to active fleet.`;
          this.notify();
        }
      }, 1000);
    }, 2500);

    return true;
  }

  /**
   * Scenario 37: Step-by-step deterministic demo progression (Events 1 to 13)
   */
  public stepDemoEvent(stepOverride?: number) {
    const nextStep = stepOverride !== undefined ? stepOverride : (this.currentDemoStep % 13) + 1;
    this.currentDemoStep = nextStep;

    switch (nextStep) {
      case 1: {
        // EVENT 1: Receiver detected
        this.resetScenario1();
        const ev14 = this.vehicles.find((v) => v.id === 'EV-014');
        if (ev14) {
          ev14.assignedToId = undefined;
          ev14.assignedType = 'none';
          ev14.assignmentStatus = 'UNASSIGNED';
          ev14.soc = 22;
          ev14.energyDemandKwh = 18;
          ev14.status = 'receiver_needed';
        }
        this.lastActionMessage = 'EVENT 1: Receiver EV-014 detected with 22% SOC (18 kWh demand). Dispatch engine activated.';
        break;
      }
      case 2: {
        // EVENT 2: Multiple donors evaluated
        this.lastActionMessage = 'EVENT 2: Candidate donors evaluated: EV-007 (Proximity/Energy), EV-003 (Reserve limit), EV-019 (Distance >5km), EV-011 (Weak RSSI).';
        break;
      }
      case 3: {
        // EVENT 3: Best donor selected
        const ev14 = this.vehicles.find((v) => v.id === 'EV-014');
        const ev07 = this.vehicles.find((v) => v.id === 'EV-007');
        if (ev14 && ev07) {
          ev14.assignedToId = 'EV-007';
          ev14.assignedType = 'v2v';
          ev14.assignmentStatus = 'V2V_PENDING';
          ev07.assignedToId = 'EV-014';
          ev07.assignedType = 'v2v';
          ev07.assignmentStatus = 'V2V_PENDING';
        }
        this.lastActionMessage = 'EVENT 3: EV-007 selected as optimal donor (1.1 km away, 20 kWh available, 25 kW power, excellent comm).';
        break;
      }
      case 4: {
        // EVENT 4: Rejected alternatives displayed
        this.lastActionMessage = 'EVENT 4: Rejected alternatives logged: EV-003 (Reserve constraint), EV-019 (Out of range >5km), EV-011 (Link quality poor).';
        break;
      }
      case 5: {
        // EVENT 5: Receiver requests V2V
        this.requestV2V('EV-014', 'EV-007', 18);
        const ev14 = this.vehicles.find((v) => v.id === 'EV-014');
        if (ev14) ev14.assignmentStatus = 'V2V_REQUESTED';
        this.lastActionMessage = 'EVENT 5: EV-014 sent V2V transfer request to EV-007 (18 kWh requested). Status: V2V_REQUESTED.';
        break;
      }
      case 6: {
        // EVENT 6: Donor accepts
        const ev07 = this.vehicles.find((v) => v.id === 'EV-007');
        const ev14 = this.vehicles.find((v) => v.id === 'EV-014');
        if (ev07) ev07.assignmentStatus = 'V2V_ACCEPTED';
        if (ev14) ev14.assignmentStatus = 'V2V_ACCEPTED';
        this.lastActionMessage = 'EVENT 6: Donor EV-007 accepted transfer request. Handshake established. Status: V2V_ACCEPTED.';
        break;
      }
      case 7: {
        // EVENT 7: Admin sees assignment
        this.lastActionMessage = 'EVENT 7: Fleet Operator dashboard synced: live assignment registered with full why/why-not telemetry.';
        break;
      }
      case 8: {
        // EVENT 8: V2V transfer starts
        this.acceptV2VRequest('EV-007', 'EV-014');
        const ev14 = this.vehicles.find((v) => v.id === 'EV-014');
        const ev07 = this.vehicles.find((v) => v.id === 'EV-007');
        if (ev14) ev14.assignmentStatus = 'V2V_ACTIVE';
        if (ev07) ev07.assignmentStatus = 'V2V_ACTIVE';
        this.lastActionMessage = 'EVENT 8: Mobile V2V power transfer active (20 kW power flow, inductive link engaged).';
        break;
      }
      case 9: {
        // EVENT 9: SOC updates
        this.advanceTransfer(45);
        this.lastActionMessage = 'EVENT 9: Mid-session telemetry update: EV-007 SOC down to 72%, EV-014 SOC up to 45% (8.1 kWh transferred).';
        break;
      }
      case 10: {
        // EVENT 10: Transfer completes
        this.advanceTransfer(60);
        this.lastActionMessage = 'EVENT 10: V2V transfer completed successfully! EV-014 SOC restored to 65%. Both vehicles returned to available.';
        break;
      }
      case 11: {
        // EVENT 11: Another receiver has no feasible donor
        this.resetScenario2();
        this.lastActionMessage = 'EVENT 11: Receiver EV-021 detected at 16% SOC. All candidate donors rejected (out of range or insufficient reserve).';
        break;
      }
      case 12: {
        // EVENT 12: Charging station selected
        const ev21 = this.vehicles.find((v) => v.id === 'EV-021');
        if (ev21) {
          ev21.assignedToId = 'ST-008';
          ev21.assignedType = 'station';
          ev21.assignmentStatus = 'STATION_ASSIGNED';
        }
        this.lastActionMessage = 'EVENT 12: Supercharger #8 Santana Row selected: 8 open chargers, 250 kW Fast DC, 1.8 km distance.';
        break;
      }
      case 13: {
        // EVENT 13: Station route displayed
        const ev21 = this.vehicles.find((v) => v.id === 'EV-021');
        if (ev21) {
          ev21.assignmentStatus = 'NAVIGATING_TO_STATION';
        }
        this.lastActionMessage = 'EVENT 13: Navigation route to Supercharger #8 active. Status: NAVIGATING_TO_STATION.';
        break;
      }
    }

    this.notify();
    return this.currentDemoStep;
  }

  public resetScenario1() {
    this.clearTimers();
    this.vehicles = JSON.parse(JSON.stringify(INITIAL_EVS));
    this.stations = JSON.parse(JSON.stringify(INITIAL_STATIONS));
    this.activeSessions = JSON.parse(JSON.stringify(INITIAL_ACTIVE_SESSIONS));

    // Ensure EV-014 is receiver with 24% SOC
    const ev14 = this.vehicles.find((v) => v.id === 'EV-014');
    if (ev14) {
      ev14.soc = 24;
      ev14.energyDemandKwh = 18;
      ev14.status = 'receiver_needed';
      ev14.assignedToId = 'EV-007';
      ev14.assignedType = 'v2v';
      ev14.assignmentStatus = 'V2V_PENDING';
    }

    const ev07 = this.vehicles.find((v) => v.id === 'EV-007');
    if (ev07) {
      ev07.soc = 82;
      ev07.status = 'donor_available';
      ev07.availableEnergyKwh = 20;
      ev07.assignedToId = 'EV-014';
      ev07.assignedType = 'v2v';
      ev07.assignmentStatus = 'V2V_PENDING';
    }

    this.currentDemoStep = 0;
    this.lastActionMessage = 'Reset to Scenario 1: Feasible V2V Match (EV-014 ↔ EV-007).';
    this.notify();
  }

  public resetScenario2() {
    this.clearTimers();
    this.vehicles = JSON.parse(JSON.stringify(INITIAL_EVS));
    this.stations = JSON.parse(JSON.stringify(INITIAL_STATIONS));
    this.activeSessions = JSON.parse(JSON.stringify(INITIAL_ACTIVE_SESSIONS));

    // Set EV-021 to low SOC with no feasible donor
    const ev21 = this.vehicles.find((v) => v.id === 'EV-021');
    if (ev21) {
      ev21.soc = 16;
      ev21.energyDemandKwh = 25;
      ev21.status = 'charging_station';
      ev21.assignedToId = 'ST-008';
      ev21.assignedType = 'station';
      ev21.assignmentStatus = 'NAVIGATING_TO_STATION';
    }

    this.lastActionMessage = 'Reset to Scenario 2: Charging Station Fallback (EV-021 → Santana Row Supercharger #8).';
    this.notify();
  }

  public resetDemo() {
    this.resetScenario1();
  }

  public getLiveAssignments(): AssignmentRecord[] {
    const records: AssignmentRecord[] = [];

    for (const ev of this.vehicles) {
      if (ev.assignedToId && ev.assignedType === 'v2v') {
        const partner = this.vehicles.find((v) => v.id === ev.assignedToId);
        // Only list once from receiver perspective or if active
        if (
          ev.status === 'receiver_needed' ||
          ev.status === 'v2v_active' ||
          ev.assignmentStatus === 'pending' ||
          ev.assignmentStatus === 'V2V_PENDING' ||
          ev.assignmentStatus === 'V2V_REQUESTED' ||
          ev.assignmentStatus === 'V2V_ACCEPTED' ||
          ev.assignmentStatus === 'V2V_CONFIRMED' ||
          ev.assignmentStatus === 'TRANSFER_READY' ||
          ev.assignmentStatus === 'V2V_INITIALIZING' ||
          ev.assignmentStatus === 'active' ||
          ev.assignmentStatus === 'V2V_ACTIVE' ||
          ev.assignmentStatus === 'TRANSFER_PAUSED'
        ) {
          const alreadyListed = records.some((r) => r.evId === ev.assignedToId);
          if (!alreadyListed) {
            const distanceKm = partner
              ? calculateDistanceKm(ev.lat, ev.lng, partner.lat, partner.lng)
              : 1.2;
            const energyKwh = ev.energyDemandKwh > 0 ? ev.energyDemandKwh : 18;
            const isV2VActive =
              ev.status === 'v2v_active' ||
              ev.assignmentStatus === 'active' ||
              ev.assignmentStatus === 'V2V_ACTIVE';

            let statusStr: string = 'V2V_PENDING';
            if (ev.assignmentStatus) {
              if (ev.assignmentStatus === 'active') statusStr = 'V2V_ACTIVE';
              else if (ev.assignmentStatus === 'accepted') statusStr = 'V2V_ACCEPTED';
              else if (ev.assignmentStatus === 'pending') statusStr = 'V2V_PENDING';
              else statusStr = ev.assignmentStatus;
            } else if (isV2VActive) {
              statusStr = 'V2V_ACTIVE';
            }

            const whySelected = [
              `✓ Donor is ${distanceKm} km away`,
              `✓ Donor has ${partner?.availableEnergyKwh ?? 20} kWh available energy`,
              `✓ Donor remains above minimum SOC (${partner?.minReserveSoc ?? 30}%)`,
              `✓ Communication quality is ${partner?.commQuality ?? 'Good'}`,
              `✓ Transfer power is sufficient (${partner?.maxTransferPowerKw ?? 25} kW)`,
            ];

            const rejectedAlternatives = ev.id === 'EV-014'
              ? [
                  { id: 'EV-003', name: 'EV-003 (Ford Mustang Mach-E)', reason: 'Insufficient energy / reserve violation' },
                  { id: 'EV-019', name: 'EV-019 (Chevrolet Bolt EV)', reason: 'Outside V2V operating range (>5.0 km)' },
                  { id: 'EV-011', name: 'EV-011 (Kia EV6)', reason: 'Weak communication link (RSSI -95 dBm)' },
                  { id: 'ST-008', name: 'Santana Row Supercharger #8', reason: 'V2V transfer preferred over station detour' },
                ]
              : [
                  { id: 'EV-003', name: 'EV-003', reason: 'Insufficient available energy' },
                  { id: 'EV-019', name: 'EV-019', reason: 'Outside V2V range' },
                ];

            records.push({
              evId: ev.id,
              assignedToId: ev.assignedToId,
              assignedToName: partner ? `${partner.id} (${partner.model})` : ev.assignedToId,
              type: 'V2V',
              reason: 'Closest feasible donor with sufficient available energy and active telemetry.',
              status: statusStr,
              distanceKm,
              energyKwh,
              whySelected,
              rejectedAlternatives,
              timestamp: this.lastUpdated,
            });
          }
        }
      } else if (ev.assignedToId && ev.assignedType === 'station') {
        const st = this.stations.find((s) => s.id === ev.assignedToId);
        const distanceKm = st
          ? calculateDistanceKm(ev.lat, ev.lng, st.lat, st.lng)
          : 1.8;
        const energyKwh = ev.energyDemandKwh > 0 ? ev.energyDemandKwh : 25;

        let statusStr: string = 'STATION_ASSIGNED';
        if (ev.assignmentStatus) {
          if (ev.assignmentStatus === 'navigating') statusStr = 'NAVIGATING_TO_STATION';
          else if (ev.assignmentStatus === 'charging') statusStr = 'CHARGING';
          else statusStr = ev.assignmentStatus;
        }

        const whySelected = [
          `✓ Station is ${distanceKm} km away`,
          `✓ Charger available (${st?.availableChargers ?? 8}/${st?.totalChargers ?? 12} open)`,
          `✓ Required power available (${st?.powerKw ?? 250} kW ${st?.stationType ?? 'Fast DC'})`,
          `✓ V2V unavailable: no feasible donor within range`,
        ];

        const rejectedAlternatives = ev.id === 'EV-021'
          ? [
              { id: 'EV-004', name: 'EV-004', reason: 'Outside V2V operating range (>5.0 km)' },
              { id: 'EV-011', name: 'EV-011', reason: 'Weak communication link / insufficient reserve' },
              { id: 'ST-007', name: 'Station #7 Willow Glen', reason: 'Fully occupied (0 available ports)' },
              { id: 'ST-003', name: 'Station #3 San Pedro Market', reason: 'Longer distance (3.4 km)' },
            ]
          : [
              { id: 'Nearby EVs', name: 'Candidate Donors', reason: 'No feasible donors within operational range' },
              { id: 'Alternative Stations', name: 'Other Stations', reason: 'Fully occupied or longer distance' },
            ];

        records.push({
          evId: ev.id,
          assignedToId: ev.assignedToId,
          assignedToName: st ? st.name : ev.assignedToId,
          type: 'Charging',
          reason: 'Station available with high-speed charging; no feasible donor within range.',
          status: statusStr,
          distanceKm,
          energyKwh,
          whySelected,
          rejectedAlternatives,
          timestamp: this.lastUpdated,
        });
      }
    }

    return records;
  }
}

export const simulation = new FleetSimulationEngine();
