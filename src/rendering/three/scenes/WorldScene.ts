/**
 * Three.js WorldScene (Stage 01 placeholder).
 * Rendering-only scene setup. Contains no game rules — Three.js is responsible
 * for rendering, never for simulation logic.
 */

import * as THREE from 'three';

export interface WorldSceneOptions {
  container: HTMLElement;
}

export class WorldScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  private animationId: number | null = null;

  constructor(options: WorldSceneOptions) {
    this.container = options.container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080b18); // deep space

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.camera.position.set(0, 2, 5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(1, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Minimal ambient light so the scene is not empty
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    const cyanLight = new THREE.PointLight(0x00d9ff, 1, 100);
    cyanLight.position.set(3, 3, 3);
    this.scene.add(cyanLight);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  start(): void {
    const animate = (): void => {
      this.render();
      this.animationId = requestAnimationFrame(animate);
    };
    this.animationId = requestAnimationFrame(animate);
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  dispose(): void {
    this.stop();
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }
}
