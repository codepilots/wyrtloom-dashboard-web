import { describe, expect, it } from 'vitest';
import { auditStatuses } from './auditStatus';

describe('auditStatuses', () => {
  it('reports both checks as ok when the server verifies both', () => {
    const [chain, anchor] = auditStatuses({
      chain_verified: true,
      anchor_verified: true,
    });
    expect(chain.state).toBe('ok');
    expect(anchor.state).toBe('ok');
  });

  it('reports a failed anchor even when the chain verifies', () => {
    // The truncation case: the shortened chain still verifies on its own.
    const [chain, anchor] = auditStatuses({
      chain_verified: true,
      anchor_verified: false,
    });
    expect(chain.state).toBe('ok');
    expect(anchor.state).toBe('bad');
  });

  it('reports a failed chain independently of the anchor', () => {
    const [chain, anchor] = auditStatuses({
      chain_verified: false,
      anchor_verified: true,
    });
    expect(chain.state).toBe('bad');
    expect(anchor.state).toBe('ok');
  });

  it('never treats a missing anchor verdict as verified', () => {
    // An API server that predates anchoring omits the field.
    const [, anchor] = auditStatuses({ chain_verified: true });
    expect(anchor.state).toBe('unknown');
    expect(anchor.text).toMatch(/not reported/);
  });

  it('does not treat a non-boolean anchor value as verified', () => {
    const [, anchor] = auditStatuses({
      chain_verified: true,
      anchor_verified: 'true' as unknown as boolean,
    });
    expect(anchor.state).toBe('unknown');
  });
});
