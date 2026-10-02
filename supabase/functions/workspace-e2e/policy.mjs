// This function accepts only claims whose JWT signature, issuer, audience and expiry were verified.
export function testAccountName(claims) {
  const repo='dalulu05168/growth-story-workspace';
  const refs=['refs/heads/main','refs/heads/fix/v23-acceptance'];
  if(claims.repository!==repo||claims.repository_id!=='1392350690'||claims.repository_owner_id!=='315132308'||!refs.includes(claims.ref)||!['push','workflow_dispatch'].includes(claims.event_name)||claims.workflow_ref!==`${repo}/.github/workflows/acceptance.yml@${claims.ref}`||!/^\d+$/.test(claims.run_id)||!/^\d+$/.test(claims.run_attempt))throw new Error('Untrusted workflow identity');
  return `e2e_${claims.run_id}_${claims.run_attempt}`;
}
