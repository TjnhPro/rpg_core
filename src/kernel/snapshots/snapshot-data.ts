/** Internal native-copy primitive. Legacy owns its capture/validation boundary. */
export function cloneSnapshotData<T>(value:T):T {return structuredClone(value);}

/** Keep the accepted children-first traversal, including Legacy error behavior.
 * Public numerical captures validate their closed, acyclic data domain first. */
export function freezeSnapshotData(value:unknown):void {
 if(value&&typeof value==='object'){
  Object.values(value).forEach(freezeSnapshotData);
  Object.freeze(value);
 }
}
