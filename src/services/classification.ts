import { EVVehicle, EVStatus, ActiveV2VSession } from '../types';

/**
 * Authoritative vehicle classification function.
 * Ensures consistent classification across all interfaces:
 *
 * If active V2V:
 *     V2V_ACTIVE
 * Else if charging or navigating to station:
 *     CHARGING (charging_station)
 * Else if SOC >= donor threshold AND available energy > minimum:
 *     DONOR (donor_available)
 * Else if SOC <= receiver threshold OR energy demand > 0:
 *     RECEIVER (receiver_needed)
 * Else:
 *     NEUTRAL
 */
export function classifyVehicleStatus(
  ev: {
    id: string;
    soc: number;
    currentKwh: number;
    batteryCapacityKwh: number;
    availableEnergyKwh: number;
    energyDemandKwh: number;
    minReserveSoc: number;
    assignedType?: 'v2v' | 'station' | 'none';
    assignmentStatus?: 'pending' | 'accepted' | 'navigating' | 'charging' | 'active' | 'completed';
    status?: EVStatus;
  },
  activeSessions: ActiveV2VSession[] = []
): EVStatus {
  // 1. If active V2V transfer session
  const isV2VActive =
    ev.assignmentStatus === 'active' ||
    ev.status === 'v2v_active' ||
    activeSessions.some(
      (s) => s.status === 'active' && (s.donorId === ev.id || s.receiverId === ev.id)
    );

  if (isV2VActive) {
    return 'v2v_active';
  }

  // 2. Else if assigned to station or actively charging
  if (
    ev.assignedType === 'station' ||
    ev.status === 'charging_station' ||
    ev.assignmentStatus === 'charging' ||
    ev.assignmentStatus === 'navigating'
  ) {
    return 'charging_station';
  }

  // 3. Else if SOC >= donor threshold (60%) AND available energy > minimum (8 kWh)
  const reserveKwh = (ev.minReserveSoc / 100) * ev.batteryCapacityKwh;
  const usableEnergy = Math.max(0, ev.currentKwh - reserveKwh);

  if (ev.soc >= 60 && usableEnergy >= 8) {
    return 'donor_available';
  }

  // 4. Else if SOC <= receiver threshold (35%) OR energy demand > 0
  if (ev.soc <= 35 || ev.energyDemandKwh > 0) {
    return 'receiver_needed';
  }

  // 5. Else: NEUTRAL
  return 'neutral';
}
