import type { AuditResponse } from '../api/types';

// One line of the Audit view's integrity summary.
export interface IntegrityStatus {
  label: string;
  // 'ok' and 'bad' are the server's verdicts; 'unknown' means it gave none.
  state: 'ok' | 'bad' | 'unknown';
  text: string;
}

// Turn the server's audit verdicts into the statuses the Audit view shows.
//
// `anchor_verified` is absent from API servers that predate audit anchoring.
// Absence is reported as 'unknown', never as verified: the anchor is what
// detects dropped entries, so "no answer" must not read as a pass.
export function auditStatuses(
  data: Pick<AuditResponse, 'chain_verified' | 'anchor_verified'>,
): IntegrityStatus[] {
  const chain: IntegrityStatus = data.chain_verified
    ? { label: 'Audit hash-chain', state: 'ok', text: 'verified ✓' }
    : { label: 'Audit hash-chain', state: 'bad', text: 'VERIFICATION FAILED ✗' };

  let anchor: IntegrityStatus;
  if (data.anchor_verified === true) {
    anchor = { label: 'Audit anchor', state: 'ok', text: 'in step ✓' };
  } else if (data.anchor_verified === false) {
    anchor = { label: 'Audit anchor', state: 'bad', text: 'CHECK FAILED ✗' };
  } else {
    anchor = {
      label: 'Audit anchor',
      state: 'unknown',
      text: 'not reported by this server',
    };
  }
  return [chain, anchor];
}
