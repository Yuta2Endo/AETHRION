/**
 * Camera factory helper for Three.js perspective cameras.
 * Rendering concern only.
 */

import * as THREE from 'three';

export interface PerspectiveCameraOptions {
  fov?: number;
  aspect?: number;
  near?: number;
  far?: number;
  position?: [number, number, number];
}

export function createPerspectiveCamera(options: PerspectiveCameraOptions = {}): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    options.fov ?? 60,
    options.aspect ?? 1,
    options.near ?? 0.1,
    options.far ?? 1000,
  );
  if (options.position) {
    camera.position.set(...options.position);
  }
  return camera;
}
