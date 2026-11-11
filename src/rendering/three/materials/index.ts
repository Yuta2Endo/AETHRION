/**
 * Three.js materials using brand colors (tokens).
 * Rendering concern only.
 */

import * as THREE from 'three';
import { colors } from '@/ui/theme/tokens';

export function createNeonMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: colors.neonCyan });
}

export function createEmpireMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: colors.empireBlue, emissive: colors.imperialPurple, emissiveIntensity: 0.5 });
}
