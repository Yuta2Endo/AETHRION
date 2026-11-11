/**
 * Three.js renderable objects (Stage 01 placeholder).
 * Objects used to visualize the empire (structures, map, etc.) live here.
 * Rendering concern only — no game rules.
 */

import * as THREE from 'three';

export function createGridHelper(size = 20, divisions = 20): THREE.GridHelper {
  return new THREE.GridHelper(size, divisions, 0x00d9ff, 0x111a31);
}

export function createEmptyObject(): THREE.Object3D {
  return new THREE.Object3D();
}
