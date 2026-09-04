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

  constructor() {
    this.vehicles = JSON.parse(JSON.stringify(INITIAL_EVS));
    this.stations = JSON.parse(JSON.stringify(INITIAL_STATIONS));
    this.activeSessions = JSON.parse(JSON.stringify(INITIAL_ACTIVE_SESSIONS));
    this.lastUpdated = Date.now();
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
    let changed = false;
    this.activeSessions = this.activeSessions.map((session) => {
      if (session.status !== 'active') return session;
      changed = true;
      const newProgress = Math.min(100, session.progressPct + deltaPct);
      const transferredKwh = Math.round((session.requestedKwh * (newProgress / 100)) * 10) / 10;

      const donor = this.vehicles.find((v) => v.id === session.donorId);
      const receiver = this.vehicles.find((v) => v.id === session.receiverId);

      if (donor && receiver) {
        const kwhStep = session.requestedKwh * (deltaPct / 100);
        const donorSocDrop = (kwhStep / donor.batteryCapacityKwh) * 100;
        donor.soc = Math.max(donor.minReserveSoc, Math.round((donor.soc - donorSocDrop) * 10) / 10);
        donor.currentKwh = Math.round((donor.soc / 100) * donor.batteryCapacityKwh * 10) / 10;

        const receiverSocGain = ((kwhStep * (session.efficiencyPct / 100)) / receiver.batteryCapacityKwh) * 100;
        receiver.soc = Math.min(95, Math.round((receiver.soc + receiverSocGain) * 10) / 10);
        receiver.currentKwh = Math.round((receiver.soc / 100) * receiver.batteryCapacityKwh * 10) / 10;
        receiver.energyDemandKwh = Math.max(0, Math.round((receiver.energyDemandKwh - kwhStep) * 10) / 10);

        if (newProgress >= 100) {
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

    if (changed) {
      this.notify();
    }
  }

  public requestV2V(receiverId: string, donorId: string, requestedKwh: number = 12) {
    const receiver = this.vehicles.find((v) => v.id === receiverId);
    const donor = this.vehicles.find((v) => v.id === donorId);
    if (!receiver || !donor) return false;

    receiver.assignedToId = donorId;
    receiver.assignedType = 'v2v';
    receiver.assignmentStatus = 'pending';

    donor.assignedToId = receiverId;
    donor.assignedType = 'v2v';
    donor.assignmentStatus = 'pending';

    // Move them towards each other
    donor.targetLat = receiver.lat;
    donor.targetLng = receiver.lng;

    this.notify();
    return true;
  }

  public acceptV2VRequest(donorId: string, receiverId: string) {
    const donor = this.vehicles.find((v) => v.id === donorId);
    const receiver = this.vehicles.find((v) => v.id === receiverId);
    if (!donor || !receiver) return false;

    donor.status = 'v2v_active';
    donor.assignmentStatus = 'active';
    donor.assignedToId = receiverId;
    donor.assignedType = 'v2v';
    donor.speedKmh = 0;

    receiver.status = 'v2v_active';
    receiver.assignmentStatus = 'active';
    receiver.assignedToId = donorId;
    receiver.assignedType = 'v2v';
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
    this.activeSessions = this.activeSessions.filter(
      (s) => !(s.donorId === donorId && s.receiverId === receiverId && s.status === 'active')
    );
    this.activeSessions.unshift(newSession);

    this.notify();
    return true;
  }

  public declineV2VRequest(donorId: string, receiverId: string) {
    const donor = this.vehicles.find((v) => v.id === donorId);
    const receiver = this.vehicles.find((v) => v.id === receiverId);
    if (donor) {
      donor.assignedToId = undefined;
      donor.assignedType = 'none';
      donor.assignmentStatus = undefined;
    }
    if (receiver) {
      receiver.assignedToId = undefined;
      receiver.assignedType = 'none';
      receiver.assignmentStatus = undefined;
    }
    this.notify();
    return true;
  }

  public assignToStation(vehicleId: string, stationId: string) {
    const vehicle = this.vehicles.find((v) => v.id === vehicleId);
    const station = this.stations.find((s) => s.id === stationId);
    if (!vehicle || !station) return false;

    vehicle.status = 'charging_station';
    vehicle.assignedToId = stationId;
    vehicle.assignedType = 'station';
    vehicle.assignmentStatus = 'navigating';
    vehicle.targetLat = station.lat;
    vehicle.targetLng = station.lng;

    this.notify();
    return true;
  }

  public resetScenario1() {
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
      ev14.assignmentStatus = 'pending';
    }

    const ev07 = this.vehicles.find((v) => v.id === 'EV-007');
    if (ev07) {
      ev07.soc = 82;
      ev07.status = 'donor_available';
      ev07.availableEnergyKwh = 20;
      ev07.assignedToId = 'EV-014';
      ev07.assignedType = 'v2v';
      ev07.assignmentStatus = 'pending';
    }

    this.notify();
  }

  public resetScenario2() {
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
      ev21.assignmentStatus = 'navigating';
    }

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
        if (ev.status === 'receiver_needed' || ev.status === 'v2v_active' || ev.assignmentStatus === 'pending' || ev.assignmentStatus === 'active') {
          // Avoid duplicate pairs by checking if partner is already listed as receiver
          const alreadyListed = records.some((r) => r.evId === ev.assignedToId);
          if (!alreadyListed) {
            const distanceKm = partner
              ? calculateDistanceKm(ev.lat, ev.lng, partner.lat, partner.lng)
              : 1.2;
            const energyKwh = ev.energyDemandKwh > 0 ? ev.energyDemandKwh : 12;
            const isV2VActive = ev.status === 'v2v_active' || ev.assignmentStatus === 'active';

            const whySelected = [
              `✓ Donor is ${distanceKm} km away`,
              `✓ Donor has ${partner?.availableEnergyKwh ?? 18} kWh available energy`,
              `✓ Donor remains above minimum SOC (${partner?.minReserveSoc ?? 30}%)`,
              `✓ Communication quality is ${partner?.commQuality ?? 'Good'}`,
              `✓ Transfer power is sufficient (${partner?.maxTransferPowerKw ?? 20} kW)`,
            ];

            const rejectedAlternatives = ev.id === 'EV-014'
              ? [
                  { id: 'EV-003', name: 'EV-003 (Ford Mustang Mach-E)', reason: 'Insufficient available energy' },
                  { id: 'EV-019', name: 'EV-019 (Chevrolet Bolt EV)', reason: 'Too far' },
                  { id: 'ST-008', name: 'Santana Row Supercharger #8', reason: 'V2V transfer preferred over station detour' },
                ]
              : [
                  { id: 'EV-003', name: 'EV-003', reason: 'Insufficient available energy' },
                  { id: 'EV-019', name: 'EV-019', reason: 'Too far away' },
                ];

            records.push({
              evId: ev.id,
              assignedToId: ev.assignedToId,
              assignedToName: partner ? `${partner.id} (${partner.model})` : ev.assignedToId,
              type: 'V2V',
              reason: 'Closest feasible donor with sufficient available energy and active telemetry.',
              status: isV2VActive ? 'Active' : 'Pending',
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
          : 2.1;
        const energyKwh = ev.energyDemandKwh > 0 ? ev.energyDemandKwh : 20;

        const whySelected = [
          `✓ Station is ${distanceKm} km away`,
          `✓ Charger available (${st?.availableChargers ?? 4}/${st?.totalChargers ?? 6} open)`,
          `✓ Required power available (${st?.powerKw ?? 150} kW ${st?.stationType ?? 'Fast DC'})`,
          `✓ No feasible V2V donor`,
        ];

        const rejectedAlternatives = ev.id === 'EV-021'
          ? [
              { id: 'EV-004', name: 'EV-004', reason: 'Too far away' },
              { id: 'EV-011', name: 'EV-011', reason: 'Weak communication / insufficient reserve' },
              { id: 'ST-007', name: 'Station #7 Willow Glen', reason: 'No available charger (queue wait)' },
              { id: 'ST-003', name: 'Station #3 San Pedro Market', reason: 'Longer distance' },
            ]
          : [
              { id: 'Nearby EVs', name: 'Candidate Donors', reason: 'No feasible donors within operational range' },
              { id: 'Alternative Stations', name: 'Other Stations', reason: 'Longer distance / slower charging speed' },
            ];

        records.push({
          evId: ev.id,
          assignedToId: ev.assignedToId,
          assignedToName: st ? st.name : ev.assignedToId,
          type: 'Charging',
          reason: 'Station available with high-speed charging; no feasible donor within range.',
          status: ev.assignmentStatus === 'charging' ? 'Charging' : 'Navigating',
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
