// SWID format: {GUID-WITH-HYPHENS}
// Extract the raw GUID for comparison against ownerId fields

export function extractGuid(swid: string): string {
  return swid.replace(/[{}]/g, "").toLowerCase();
}

export function swidMatchesOwner(swid: string, ownerId: string): boolean {
  return extractGuid(swid) === ownerId.replace(/[{}]/g, "").toLowerCase();
}
