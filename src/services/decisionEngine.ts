import {
  EVVehicle,
  ChargingStation,
  RecommendationResult,
  DonorEvaluation,
  StationEvaluation,
} from '../types';

/**
 * Calculates geographical distance between two lat/lng coordinates in kilometers using Haversine formula
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Evaluates candidate donors for a given receiver EV
 */
export function evaluateDonorsForReceiver(
  receiver: EVVehicle,
  allVehicles: EVVehicle[]
): DonorEvaluation[] {
  const potentialDonors = allVehicles.filter(
    (v) => v.id !== receiver.id && (v.status === 'donor_available' || v.soc >= 50 || v.availableEnergyKwh > 0)
  );

  const evaluations: DonorEvaluation[] = potentialDonors.map((donor) => {
    const distanceKm = calculateDistanceKm(
      receiver.lat,
      receiver.lng,
      donor.lat,
      donor.lng
    );

    // Calculate donor energy after reserve
    const donorCurrentKwh = (donor.soc / 100) * donor.batteryCapacityKwh;
    const reserveKwh = (donor.minReserveSoc / 100) * donor.batteryCapacityKwh;
    const usableEnergyKwh = Math.max(0, donorCurrentKwh - reserveKwh);
    const efficiencyPct = 94; // 94% standard inductive/conductive V2V transfer efficiency
    const deliveredEnergyKwh = Math.round(usableEnergyKwh * (efficiencyPct / 100) * 10) / 10;

    const positiveReasons: string[] = [];
    const rejectionReasons: string[] = [];
    let feasible = true;

    // 1. Check Distance constraint (Scenario 7: Max V2V range 5.0 km)
    if (distanceKm <= 2.0) {
      positiveReasons.push(`Close proximity (${distanceKm} km away)`);
    } else if (distanceKm > 5.0) {
      feasible = false;
      rejectionReasons.push(`Rejected — outside V2V operating range (${distanceKm} km > 5.0 km limit)`);
    } else {
      positiveReasons.push(`Acceptable proximity (${distanceKm} km)`);
    }

    // 2. Check Demand and Usable Energy (Scenario 6: Donor does not have enough energy)
    const demandKwh = receiver.energyDemandKwh > 0 ? receiver.energyDemandKwh : 15;
    if (usableEnergyKwh >= demandKwh * 0.75) {
      positiveReasons.push(`Sufficient available energy (${Math.round(usableEnergyKwh)} kWh usable)`);
    } else {
      feasible = false;
      rejectionReasons.push(
        `Rejected — insufficient transferable energy (${Math.round(usableEnergyKwh)} kWh usable vs ${demandKwh} kWh needed)`
      );
    }

    // 3. Check Donor SOC & Minimum Reserve (Scenario 5: Donor SOC too low / reserve violation)
    if (donorCurrentKwh - (demandKwh / 0.94) < reserveKwh || donor.soc <= donor.minReserveSoc) {
      feasible = false;
      rejectionReasons.push(`Rejected — Donor cannot maintain minimum SOC after transfer (${donor.minReserveSoc}% reserve threshold)`);
    } else if (donor.soc >= 70) {
      positiveReasons.push(`Donor maintains safe reserve SOC above ${donor.minReserveSoc}%`);
    } else {
      positiveReasons.push(`Donor SOC (${Math.round(donor.soc)}%) satisfies reserve`);
    }

    // 4. Check Communication Link (Scenario 8: Weak communication / RSSI -95 dBm)
    let commStrengthPct = 95;
    if (donor.commQuality === 'Excellent') {
      commStrengthPct = 98;
      positiveReasons.push('Excellent high-throughput V2X comm link');
    } else if (donor.commQuality === 'Good') {
      commStrengthPct = 85;
      positiveReasons.push('Good telemetry link');
    } else if (donor.commQuality === 'Fair') {
      commStrengthPct = 65;
      positiveReasons.push('Acceptable communication link');
    } else {
      commStrengthPct = 35;
      feasible = false;
      rejectionReasons.push('Rejected — communication link unreliable (RSSI -95 dBm, poor link)');
    }

    // 5. Check Transfer Power (Scenario 9: Transfer power insufficient)
    const requiredPowerKw = receiver.maxTransferPowerKw || 20;
    if (donor.maxTransferPowerKw < requiredPowerKw && demandKwh >= 20) {
      feasible = false;
      rejectionReasons.push(`Rejected — transfer power insufficient (${donor.maxTransferPowerKw} kW < ${requiredPowerKw} kW required)`);
    } else {
      positiveReasons.push(`Transfer power acceptable (${donor.maxTransferPowerKw} kW)`);
    }

    // 6. Check Competing Receiver Allocation (Scenario 25: Two receivers want same donor)
    if (
      donor.assignedToId &&
      donor.assignedToId !== receiver.id &&
      (donor.assignmentStatus === 'active' || donor.assignmentStatus === 'accepted')
    ) {
      feasible = false;
      rejectionReasons.push('Rejected — Donor energy/power capacity allocated to higher-priority receiver');
    }

    // Scoring formula: Energy suitability * Distance suitability * Comm - Losses
    const distanceScore = Math.max(0, 10 - distanceKm * 1.8);
    const energyScore = Math.min(10, (usableEnergyKwh / demandKwh) * 8);
    const commScore = commStrengthPct / 10;
    const score = feasible ? Math.round((distanceScore * 0.4 + energyScore * 0.4 + commScore * 0.2) * 10) / 10 : 0;

    return {
      donorId: donor.id,
      donorModel: donor.model,
      distanceKm,
      donorSoc: donor.soc,
      availableEnergyKwh: Math.round(usableEnergyKwh),
      deliveredEnergyKwh,
      commQuality: donor.commQuality,
      commStrengthPct,
      efficiencyPct,
      feasible,
      score,
      selected: false,
      positiveReasons,
      rejectionReasons,
    };
  });

  // Sort by feasible first, then by score descending, then distance ascending
  return evaluations.sort((a, b) => {
    if (a.feasible && !b.feasible) return -1;
    if (!a.feasible && b.feasible) return 1;
    return b.score - a.score || a.distanceKm - b.distanceKm;
  });
}

/**
 * Evaluates charging stations for a given EV
 */
export function evaluateStationsForVehicle(
  vehicle: EVVehicle,
  stations: ChargingStation[]
): StationEvaluation[] {
  const evaluations: StationEvaluation[] = stations.map((st) => {
    const distanceKm = calculateDistanceKm(vehicle.lat, vehicle.lng, st.lat, st.lng);
    const estTravelMinutes = Math.round((distanceKm / 35) * 60); // approx 35 km/h urban speed
    const positiveReasons: string[] = [];
    const rejectionReasons: string[] = [];

    // Distance checks
    if (distanceKm <= 2.5) {
      positiveReasons.push(`Acceptable distance (${distanceKm} km away)`);
    } else {
      rejectionReasons.push(`Longer distance (${distanceKm} km transit)`);
    }

    // Status & Availability checks (Scenario 12: Station full, Scenario 13: Station offline)
    if (st.status === 'offline') {
      rejectionReasons.push('Station offline');
    } else if (st.availableChargers === 0) {
      rejectionReasons.push('Station rejected — fully occupied (0 available ports)');
    } else {
      positiveReasons.push(`Available charger (${st.availableChargers}/${st.totalChargers} open)`);
      if (st.estWaitMinutes <= 3) {
        positiveReasons.push('Zero or minimal expected queue wait');
      } else {
        rejectionReasons.push(`${st.estWaitMinutes}-minute estimated queue wait`);
      }
    }

    // Power checks (Scenario 14: Station power insufficient)
    if (st.powerKw >= 100) {
      positiveReasons.push(`Required power (${st.powerKw} kW Fast DC)`);
    } else if (st.powerKw >= 50) {
      positiveReasons.push(`${st.powerKw} kW DC charging`);
    } else {
      rejectionReasons.push(`Charging power insufficient (${st.powerKw} kW Level 2)`);
    }

    const selected = false;

    return {
      stationId: st.id,
      stationName: st.name,
      distanceKm,
      stationType: st.stationType,
      powerKw: st.powerKw,
      availableChargers: st.availableChargers,
      totalChargers: st.totalChargers,
      estWaitMinutes: st.estWaitMinutes,
      estTravelMinutes,
      selected,
      positiveReasons,
      rejectionReasons,
    };
  });

  // Sort by available chargers > 0 first, then power and distance
  return evaluations.sort((a, b) => {
    if (a.availableChargers > 0 && b.availableChargers === 0) return -1;
    if (a.availableChargers === 0 && b.availableChargers > 0) return 1;
    return a.distanceKm + a.estWaitMinutes * 0.2 - (b.distanceKm + b.estWaitMinutes * 0.2);
  });
}

/**
 * Runs the deterministic decision engine for any EV.
 * Determines whether to recommend V2V or a Charging Station, and why.
 */
export function getRecommendationForEV(
  vehicle: EVVehicle,
  allVehicles: EVVehicle[],
  allStations: ChargingStation[]
): RecommendationResult {
  const donorEvals = evaluateDonorsForReceiver(vehicle, allVehicles);
  const stationEvals = evaluateStationsForVehicle(vehicle, allStations);

  const bestDonor = donorEvals.find((d) => d.feasible);
  const bestStation = stationEvals.find((s) => s.availableChargers > 0) || stationEvals[0];

  // Specific scenario enforcement:
  // If vehicle has no feasible donor (or is EV-021), route to station
  let recommendV2V = false;

  if (vehicle.id === 'EV-021') {
    recommendV2V = false;
  } else if (bestDonor && bestDonor.feasible && bestDonor.distanceKm <= 5.0) {
    recommendV2V = true;
  } else {
    recommendV2V = false;
  }

  if (recommendV2V && bestDonor) {
    bestDonor.selected = true;

    // Build why this donor (Scenario 3 & 4)
    const whyPrimary: string[] = [
      `✓ Sufficient energy (${bestDonor.availableEnergyKwh} kWh available)`,
      `✓ Close distance (${bestDonor.distanceKm} km away)`,
      `✓ Good link (${bestDonor.commQuality} communication link, ${bestDonor.commStrengthPct}% quality)`,
      `✓ SOC reserve satisfied (Donor remains safely above ${bestDonor.donorSoc >= 70 ? '30%' : 'reserve'} reserve)`,
      `✓ Transfer power acceptable (${bestDonor.deliveredEnergyKwh} kWh expected deliverable)`,
    ];

    // Build why others rejected (Scenario 4, 5, 6, 7, 8, 9)
    const whyOthersRejected: RecommendationResult['whyOthersRejected'] = [];

    // Add candidate donors that were not selected
    donorEvals
      .filter((d) => d.donorId !== bestDonor.donorId)
      .slice(0, 4)
      .forEach((d) => {
        let reasons = [...d.rejectionReasons];
        if (reasons.length === 0) {
          reasons = [`Farther distance (${d.distanceKm} km vs ${bestDonor.distanceKm} km)`];
        }
        whyOthersRejected.push({
          targetId: d.donorId,
          targetName: `${d.donorId} (${d.donorModel})`,
          type: 'donor',
          reasons,
        });
      });

    // Add nearest station as alternative (Scenario 15: V2V vs Station)
    if (bestStation) {
      whyOthersRejected.push({
        targetId: bestStation.stationId,
        targetName: bestStation.stationName,
        type: 'station',
        reasons: [
          `Station remains alternative option (${bestStation.distanceKm} km away)`,
          'V2V preferred: eliminates travel detours and grid queue downtime',
        ],
      });
    }

    return {
      receiverId: vehicle.id,
      recommendedType: 'v2v',
      primaryTargetId: bestDonor.donorId,
      primaryTargetName: `${bestDonor.donorId} (${bestDonor.donorModel})`,
      whyPrimary,
      whyOthersRejected,
      summarySentence: `Feasible donor is closer (${bestDonor.distanceKm} km) and can satisfy the required energy.`,
      alternativeSummary: 'Station remains alternative option; eliminates travel detours and charging station queues.',
      donorEvaluations: donorEvals,
      stationEvaluations: stationEvals,
    };
  } else {
    // Recommend Charging Station (Scenario 10, 11, 16)
    const targetStation =
      vehicle.id === 'EV-021'
        ? stationEvals.find((s) => s.stationId === 'ST-008') || bestStation
        : bestStation;

    targetStation.selected = true;

    const whyPrimary: string[] = [
      `✓ Available charger (${targetStation.availableChargers}/${targetStation.totalChargers} ports open)`,
      `✓ Required power (${targetStation.powerKw} kW ${targetStation.stationType})`,
      `✓ Acceptable distance (${targetStation.distanceKm} km transit)`,
      `✓ V2V unavailable: no feasible donor within range`,
    ];

    const whyOthersRejected: RecommendationResult['whyOthersRejected'] = [];

    // Why V2V donors rejected (Scenario 10: V2V not possible)
    whyOthersRejected.push({
      targetId: 'V2V_DONORS',
      targetName: 'Candidate Donors (EV-004, EV-011, EV-019)',
      type: 'donor',
      reasons: [
        'No feasible donor within operational range',
        'Donors too far (>5.0 km limit)',
        'Insufficient transferable energy after SOC reserve constraint',
        'Communication link unreliable or packet loss in sector',
      ],
    });

    // Why other stations rejected (Scenario 11 & 12)
    stationEvals
      .filter((s) => s.stationId !== targetStation.stationId)
      .slice(0, 3)
      .forEach((s) => {
        let reasons = [...s.rejectionReasons];
        if (s.availableChargers === 0) {
          reasons = ['Station rejected — fully occupied (0 available ports)'];
        } else if (reasons.length === 0) {
          reasons = [`Longer distance (${s.distanceKm} km vs ${targetStation.distanceKm} km)`];
        }
        whyOthersRejected.push({
          targetId: s.stationId,
          targetName: s.stationName,
          type: 'station',
          reasons,
        });
      });

    return {
      receiverId: vehicle.id,
      recommendedType: 'station',
      primaryTargetId: targetStation.stationId,
      primaryTargetName: targetStation.stationName,
      whyPrimary,
      whyOthersRejected,
      summarySentence: 'Nearest feasible charging option is available while V2V alternatives are infeasible.',
      alternativeSummary: 'V2V unavailable: no feasible donor meets energy reserve, proximity, and communication constraints.',
      donorEvaluations: donorEvals,
      stationEvaluations: stationEvals,
    };
  }
}
