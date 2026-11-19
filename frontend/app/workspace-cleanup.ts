/** Deprecated compatibility shim. Preserve every workspace record. */
export function removeSmokingWorkspaceData<T extends Record<string, any>>(workspace: T): T {
  return workspace;
}
