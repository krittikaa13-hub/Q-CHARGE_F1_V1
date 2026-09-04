export type EVStatus = 
  | 'donor_available'      // Green
  | 'receiver_needed'      // Red
  | 'neutral'              // Blue
  | 'charging_station'     // Orange
  | 'v2v_active'           // Purple
  | 'unavailable';         // Grey

export type RoleType = 'admin' | 'donor' | 'receiver';

export type StationType = 'Fast DC' | 'Level 2' | 'Level 1';

export type ConnectorType = 'CCS / NACS' | 'CHAdeMO' | 'J1772' | 'Tesla NACS';

export interface ChargingStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stationType: StationType;
  connectorType: ConnectorType;
  totalChargers: number;
  availableChargers: number;
  powerKw: number;
  costPerKwh: number;
  estWaitMinutes: number;
  status: 'available' | 'busy' | 'offline';
  address: string;
}

export interface EVVehicle {
  id: string;
  model: string;
  lat: number;
  lng: number;
  targetLat?: number;
  targetLng?: number;
  speedKmh: number;
  headingDeg: number;
  soc: number; // 0 - 100
  batteryCapacityKwh: number;
  currentKwh: number;
  energyDemandKwh: number; // Energy required if receiver
  availableEnergyKwh: number; // Energy available for donation
  minReserveSoc: number; // Reserve threshold %
  maxTransferPowerKw: number;
  status: EVStatus;
  commQuality: 'Excellent' | 'Good' | 'Fair' | 'Weak';
  assignedToId?: string; // EV ID or Station ID
  assignedType?: 'v2v' | 'station' | 'none';
  assignmentStatus?: AssignmentStatusType | string;
  declinedDonorIds?: string[];
}

export interface DonorEvaluation {
  donorId: string;
  donorModel: string;
  distanceKm: number;
  donorSoc: number;
  availableEnergyKwh: number;
  deliveredEnergyKwh: number;
  commQuality: 'Excellent' | 'Good' | 'Fair' | 'Weak';
  commStrengthPct: number;
  efficiencyPct: number;
  feasible: boolean;
  score: number;
  selected: boolean;
  positiveReasons: string[];
  rejectionReasons: string[];
}

export interface StationEvaluation {
  stationId: string;
  stationName: string;
  distanceKm: number;
  stationType: StationType;
  powerKw: number;
  availableChargers: number;
  totalChargers: number;
  estWaitMinutes: number;
  estTravelMinutes: number;
  selected: boolean;
  positiveReasons: string[];
  rejectionReasons: string[];
}

export interface RecommendationResult {
  receiverId: string;
  recommendedType: 'v2v' | 'station';
  primaryTargetId: string;
  primaryTargetName: string;
  whyPrimary: string[];
  whyOthersRejected: {
    targetId: string;
    targetName: string;
    type: 'donor' | 'station';
    reasons: string[];
  }[];
  summarySentence: string;
  alternativeSummary: string;
  donorEvaluations: DonorEvaluation[];
  stationEvaluations: StationEvaluation[];
}

export interface ActiveV2VSession {
  sessionId: string;
  donorId: string;
  receiverId: string;
  requestedKwh: number;
  transferredKwh: number;
  powerKw: number;
  efficiencyPct: number;
  progressPct: number; // 0 to 100
  status: 'pending_request' | 'active' | 'completed' | 'declined';
  startTime: number;
  durationSeconds: number;
}

export type AssignmentStatusType =
  | 'V2V_PENDING'
  | 'V2V_REQUESTED'
  | 'V2V_ACCEPTED'
  | 'V2V_CONFIRMED'
  | 'TRANSFER_READY'
  | 'V2V_INITIALIZING'
  | 'V2V_ACTIVE'
  | 'V2V_COMPLETED'
  | 'DONATION_COMPLETED'
  | 'ENERGY_RECEIVED'
  | 'V2V_DECLINED'
  | 'DONOR_UNAVAILABLE'
  | 'TRANSFER_PAUSED'
  | 'TRANSFER_RESUMED'
  | 'V2V_FAILED'
  | 'CANCELLED'
  | 'STATION_RECOMMENDED'
  | 'STATION_ASSIGNED'
  | 'NAVIGATING_TO_STATION'
  | 'ARRIVED_AT_STATION'
  | 'CHARGING'
  | 'CHARGING_COMPLETED'
  | 'UNASSIGNED';

export interface AssignmentRecord {
  evId: string;
  assignedToId: string;
  assignedToName: string;
  type: 'V2V' | 'Charging';
  reason: string;
  status: AssignmentStatusType | string;
  distanceKm: number;
  energyKwh: number;
  whySelected?: string[];
  rejectedAlternatives?: { id: string; name: string; reason: string }[];
  timestamp?: number;
}

export interface FilterOptions {
  vehicleType: 'all' | 'donor' | 'receiver' | 'neutral' | 'charging' | 'v2v_active';
  stationType: 'all' | 'Fast DC' | 'Level 2' | 'Level 1';
  status: 'all' | 'available' | 'busy' | 'offline';
  socLevel: 'all' | 'critical' | 'low' | 'medium' | 'high';
  v2vFilter: 'all' | 'matched' | 'unmatched';
  searchQuery: string;
}
