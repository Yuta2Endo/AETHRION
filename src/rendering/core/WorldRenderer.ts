import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { City } from '@/simulation/city';
import { CityWorld } from '@/rendering/city/CityWorld';
import { detectRenderQuality, isWebGLAvailable } from '@/rendering/core/quality';
import type { SceneSelection } from '@/rendering/types';

export interface WorldRendererOptions {
  container: HTMLElement;
  onSelectionChange?: (selection: SceneSelection | null) => void;
  onError?: (message: string) => void;
}

export interface FocusTarget {
  x: number;
  y: number;
  z: number;
}

export class WorldRenderer {
  private readonly container: HTMLElement;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly world = new CityWorld();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  private animationId: number | null = null;
  private disposed = false;
  private visible = true;
  private selection: SceneSelection | null = null;

  private readonly onSelectionChange?: (selection: SceneSelection | null) => void;
  private readonly onError?: (message: string) => void;

  private readonly resizeObserver: ResizeObserver | null = null;
  private readonly onResizeBound = () => this.resizeToContainer();
  private readonly onPointerDownBound = (event: PointerEvent) => this.handlePointerDown(event);
  private readonly onContextLostBound = (event: Event) => this.handleContextLost(event);
  private readonly onVisibilityBound = () => this.handleVisibilityChange();

  constructor(options: WorldRendererOptions) {
    this.container = options.container;
    this.onSelectionChange = options.onSelectionChange;
    this.onError = options.onError;

    const quality = detectRenderQuality();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080b18);
    this.scene.fog = new THREE.Fog(0x080b18, 55, 120);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
    this.camera.position.set(18, 20, 22);

    this.renderer = new THREE.WebGLRenderer({
      antialias: quality.antialias,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(quality.pixelRatio);
    this.renderer.setSize(1, 1, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';

    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 80;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    this.setupLights();
    this.scene.add(this.world.root);

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDownBound);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLostBound as EventListener, false);
    window.addEventListener('resize', this.onResizeBound);
    document.addEventListener('visibilitychange', this.onVisibilityBound);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resizeToContainer());
      this.resizeObserver.observe(this.container);
    }

    this.resizeToContainer();
  }

  static canRender(): boolean {
    return isWebGLAvailable();
  }

  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0xbfd8ff, 0.65);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xdce8ff, 0.9);
    key.position.set(20, 30, 10);
    this.scene.add(key);

    const cyan = new THREE.PointLight(0x00d9ff, 0.8, 120);
    cyan.position.set(-10, 18, 8);
    this.scene.add(cyan);

    const purple = new THREE.PointLight(0xa855f7, 0.45, 120);
    purple.position.set(14, 14, -10);
    this.scene.add(purple);
  }

  start(): void {
    if (this.disposed || this.animationId !== null) return;
    const loop = () => {
      if (this.disposed) return;
      this.animationId = requestAnimationFrame(loop);
      if (!this.visible) return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  syncCity(city: City | null): void {
    if (this.disposed) return;
    try {
      this.world.sync(city);
      this.world.setSelection(this.selection);
      if (!this.visible) this.renderOnce();
    } catch (error) {
      this.onError?.(error instanceof Error ? error.message : 'Failed to synchronize the world view.');
    }
  }

  renderOnce(): void {
    if (this.disposed) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  setSelection(selection: SceneSelection | null): void {
    this.selection = selection;
    this.world.setSelection(selection);
    this.onSelectionChange?.(selection);
  }

  getSelection(): SceneSelection | null {
    return this.selection;
  }

  resetCamera(): void {
    this.camera.position.set(18, 20, 22);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  focusOn(target: FocusTarget, distance = 14): void {
    this.controls.target.set(target.x, target.y, target.z);
    const offset = new THREE.Vector3(distance * 0.7, distance * 0.8, distance * 0.7);
    this.camera.position.copy(new THREE.Vector3(target.x, target.y, target.z).add(offset));
    this.controls.update();
  }

  focusSelection(): void {
    if (!this.selection) return;
    const layout = this.world.getLayout();
    if (!layout) return;

    if (this.selection.kind === 'district') {
      const d = layout.byDistrictId[this.selection.districtId];
      if (d) this.focusOn({ x: d.center.x, y: 0, z: d.center.z }, 18);
    } else if (this.selection.kind === 'plot') {
      const p = layout.byPlotId[this.selection.plotId];
      if (p) this.focusOn({ x: p.position.x, y: 0, z: p.position.z }, 10);
    } else if (this.selection.kind === 'building') {
      const p = layout.byPlotId[this.selection.plotId];
      if (p) this.focusOn({ x: p.position.x, y: 1.2, z: p.position.z }, 9);
    }
  }

  private handlePointerDown(event: PointerEvent): void {
    if (this.disposed) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.world.pickables, false);
    if (hits.length === 0) {
      this.setSelection(null);
      return;
    }

    const data = hits[0].object.userData as Record<string, unknown>;
    const kind = data.kind;
    if (kind === 'building' && typeof data.buildingId === 'string') {
      this.setSelection({
        kind: 'building',
        buildingId: data.buildingId,
        plotId: String(data.plotId ?? ''),
        districtId: String(data.districtId ?? ''),
      });
      return;
    }
    if (kind === 'plot' && typeof data.plotId === 'string') {
      this.setSelection({ kind: 'plot', plotId: data.plotId, districtId: String(data.districtId ?? '') });
      return;
    }
    if (kind === 'district' && typeof data.districtId === 'string') {
      this.setSelection({ kind: 'district', districtId: data.districtId });
    }
  }

  resizeToContainer(): void {
    if (this.disposed) return;
    const width = Math.max(1, Math.floor(this.container.clientWidth));
    const height = Math.max(1, Math.floor(this.container.clientHeight));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderOnce();
  }

  private handleContextLost(event: Event): void {
    event.preventDefault();
    this.onError?.('WebGL context was lost. The simulation continues; reload the World View to reinitialise rendering.');
  }

  private handleVisibilityChange(): void {
    this.visible = document.visibilityState !== 'hidden';
    if (this.visible) this.renderOnce();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();

    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.onResizeBound);
    document.removeEventListener('visibilitychange', this.onVisibilityBound);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDownBound);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLostBound as EventListener);

    this.controls.dispose();
    this.world.dispose();
    this.renderer.dispose();

    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }

    this.scene.clear();
  }
}