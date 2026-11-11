/**
 * Three.js lighting presets using brand colors.
 * Rendering concern only.
 */

import * as THREE from 'three';
import { colors } from '@/ui/theme/tokens';

export function createAmbientLight(intensity = 0.4): THREE.AmbientLight {
  return new THREE.AmbientLight(0xffffff, intensity);
}

export function createNeonPointLight(intensity = 1, distance = 100): THREE.PointLight {
  const light = new THREE.PointLight(colors.neonCyan, intensity, distance);
  light.position.set(3, 3, 3);
  return light;
}
