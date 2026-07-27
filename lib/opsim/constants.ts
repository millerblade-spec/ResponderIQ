/** Fixed operational identifiers (§5, §7): the unit is always Medic 3 and it always uses EMS 2. */
export const UNIT_CALLSIGN = 'Medic 3';
export const RADIO_CHANNEL = 'EMS 2';

/**
 * Provisional learner identity used to key start-of-shift persistence (§4)
 * until the agency sign-in slice (§27) supplies a real learner name + badge ID.
 * ASSUMPTION: replaced by the authenticated learner identity in that slice.
 */
export const PROVISIONAL_LEARNER_ID = 'provisional-learner';
