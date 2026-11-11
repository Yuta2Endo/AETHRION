import * as THREE from 'three';
import type { City } from '@/simulation/city';
import { buildCityLayout } from '@/rendering/adapters/cityLayout';
import { buildCityVisualModel, type CityVisualModel } from '@/rendering/adapters/cityAdapter';
import type { CityLayout, SceneSelection } from '@/rendering/types';
import { DISTRICT_COLORS, DISTRICT_GROUND_COLORS, buildingHeight, statusOpacity, CATEGORY_COLORS } from './palette';

interface BuildingMeshEntry {
  group: THREE.Group;
  body: THREE.Mesh;
  accent: THREE.Mesh;
  progress: THREE.Mesh;
  stateKey: string;
}

interface PlotMeshEntry {
  mesh: THREE.Mesh;
  stateKey: string;
}

export class CityWorld {
  readonly root = new THREE.Group();
  readonly pickables: THREE.Object3D[] = [];

  private layout: CityLayout | null = null;
  private model: CityVisualModel | null = null;

  private readonly districtGroups = new Map<string, THREE.Group>();
  private readonly districtGrounds = new Map<string, THREE.Mesh>();
  private readonly plotMeshes = new Map<string, PlotMeshEntry>();
  private readonly buildingMeshes = new Map<string, BuildingMeshEntry>();
  private readonly selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.85, 32),
    new THREE.MeshBasicMaterial({ color: 0x00d9ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );

  private readonly sharedGeometries: THREE.BufferGeometry[] = [];
  private readonly sharedMaterials: THREE.Material[] = [];

  constructor() {
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.visible = false;
    this.root.add(this.selectionRing);
  }

  getLayout(): CityLayout | null {
    return this.layout;
  }

  getModel(): CityVisualModel | null {
    return this.model;
  }

  sync(city: City | null): void {
    if (!city) {
      this.clear();
      this.layout = null;
      this.model = null;
      return;
    }

    this.layout = buildCityLayout(city);
    this.model = buildCityVisualModel(city);
    this.syncDistricts();
    this.syncPlots();
    this.syncBuildings();
    this.prune();
  }

  setSelection(selection: SceneSelection | null): void {
    if (!selection || !this.layout) {
      this.selectionRing.visible = false;
      this.resetHighlights();
      return;
    }

    this.resetHighlights();

    if (selection.kind === 'district') {
      const d = this.layout.byDistrictId[selection.districtId];
      const ground = this.districtGrounds.get(selection.districtId);
      if (d && ground) {
        this.selectionRing.position.set(d.center.x, 0.06, d.center.z);
        this.selectionRing.scale.set(8, 8, 1);
        this.selectionRing.visible = true;
        (ground.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.45;
      }
      return;
    }

    if (selection.kind === 'plot') {
      const p = this.layout.byPlotId[selection.plotId];
      const mesh = this.plotMeshes.get(selection.plotId)?.mesh;
      if (p && mesh) {
        this.selectionRing.position.set(p.position.x, 0.07, p.position.z);
        this.selectionRing.scale.set(2.2, 2.2, 1);
        this.selectionRing.visible = true;
        (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5;
      }
      return;
    }

    if (selection.kind === 'building') {
      const b = this.buildingMeshes.get(selection.buildingId);
      if (b) {
        const pos = b.group.position;
        this.selectionRing.position.set(pos.x, 0.07, pos.z);
        this.selectionRing.scale.set(2.4, 2.4, 1);
        this.selectionRing.visible = true;
        (b.accent.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2;
      }
    }
  }

  private resetHighlights(): void {
    for (const ground of this.districtGrounds.values()) {
      (ground.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.18;
    }
    for (const entry of this.plotMeshes.values()) {
      (entry.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.12;
    }
    for (const entry of this.buildingMeshes.values()) {
      (entry.accent.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
    }
  }

  private syncDistricts(): void {
    if (!this.layout) return;
    for (const district of this.layout.districts) {
      if (this.districtGroups.has(district.districtId)) continue;

      const group = new THREE.Group();
      group.name = district.districtId;
      group.userData = { kind: 'district', districtId: district.districtId };

      const color = DISTRICT_GROUND_COLORS[district.type] ?? 0x111a31;
      const accent = DISTRICT_COLORS[district.type] ?? 0x00d9ff;
      const geo = new THREE.PlaneGeometry(district.size.width, district.size.depth);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: new THREE.Color(accent),
        emissiveIntensity: 0.18,
        roughness: 0.9,
        metalness: 0.1,
        transparent: true,
        opacity: 0.95,
      });
      const ground = new THREE.Mesh(geo, mat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(district.center.x, 0, district.center.z);
      ground.receiveShadow = false;
      ground.userData = { kind: 'district', districtId: district.districtId };

      const borderGeo = new THREE.EdgesGeometry(geo);
      const borderMat = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.7 });
      const border = new THREE.LineSegments(borderGeo, borderMat);
      border.rotation.x = -Math.PI / 2;
      border.position.set(district.center.x, 0.01, district.center.z);

      group.add(ground);
      group.add(border);
      this.root.add(group);

      this.districtGroups.set(district.districtId, group);
      this.districtGrounds.set(district.districtId, ground);
      this.pickables.push(ground);
      this.sharedGeometries.push(geo, borderGeo);
      this.sharedMaterials.push(mat, borderMat);
    }
  }

  private syncPlots(): void {
    if (!this.layout || !this.model) return;
    const byId = new Map(this.model.plots.map((p) => [p.id, p]));

    for (const [plotId, layout] of Object.entries(this.layout.byPlotId)) {
      const visual = byId.get(plotId);
      if (!visual) continue;

      const stateKey = `${visual.status}|${visual.zoning}|${visual.infrastructureAvailable}`;
      const existing = this.plotMeshes.get(plotId);
      if (existing && existing.stateKey === stateKey) continue;

      if (existing) {
        this.removePickable(existing.mesh);
        existing.mesh.removeFromParent();
        existing.mesh.geometry.dispose();
        (existing.mesh.material as THREE.Material).dispose();
      }

      const color = this.plotColor(visual.status);
      const geo = new THREE.BoxGeometry(layout.size.width, 0.08, layout.size.depth);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: new THREE.Color(DISTRICT_COLORS[visual.districtType] ?? 0x00d9ff),
        emissiveIntensity: 0.12,
        roughness: 0.85,
        metalness: 0.15,
        transparent: true,
        opacity: visual.status === 'sold' ? 0.25 : 0.75,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(layout.position.x, 0.04, layout.position.z);
      mesh.userData = { kind: 'plot', plotId: visual.id, districtId: visual.districtId };

      this.root.add(mesh);
      this.pickables.push(mesh);
      this.plotMeshes.set(plotId, { mesh, stateKey });
    }
  }

  private plotColor(status: string): number {
    switch (status) {
      case 'available':
        return 0x16223d;
      case 'owned':
        return 0x1b3350;
      case 'occupied':
        return 0x12283b;
      case 'sold':
        return 0x1a1f2e;
      default:
        return 0x111a31;
    }
  }

  private syncBuildings(): void {
    if (!this.layout || !this.model) return;
    const byId = new Map(this.model.buildings.map((b) => [b.id, b]));

    for (const building of this.model.buildings) {
      const plot = this.layout.byPlotId[building.plotId];
      if (!plot) continue;

      const stateKey = `${building.status}|${building.progress.toFixed(3)}|${building.infrastructureSatisfied}|${building.category}`;
      const existing = this.buildingMeshes.get(building.id);
      if (existing && existing.stateKey === stateKey) {
        existing.group.position.set(plot.position.x, 0.08, plot.position.z);
        continue;
      }

      if (existing) {
        this.disposeBuildingEntry(existing);
        this.buildingMeshes.delete(building.id);
      }

      const entry = this.createBuildingMesh(building, plot.position.x, plot.position.z);
      entry.stateKey = stateKey;
      this.root.add(entry.group);
      this.pickables.push(entry.body, entry.accent);
      this.buildingMeshes.set(building.id, entry);
    }

    // remove missing
    for (const [id, entry] of this.buildingMeshes.entries()) {
      if (!byId.has(id)) {
        this.disposeBuildingEntry(entry);
        this.buildingMeshes.delete(id);
      }
    }
  }

  private createBuildingMesh(
    building: CityVisualModel['buildings'][number],
    x: number,
    z: number,
  ): BuildingMeshEntry {
    const group = new THREE.Group();
    const h = buildingHeight(building.category, building.status);
    const color = CATEGORY_COLORS[building.category] ?? 0x00d9ff;
    const opacity = statusOpacity(building.status, building.infrastructureSatisfied);

    const bodyGeo = new THREE.BoxGeometry(1.4, h, 1.4);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x111a31,
      emissive: new THREE.Color(color),
      emissiveIntensity: building.status === 'operational' ? 0.25 : 0.12,
      transparent: true,
      opacity,
      roughness: 0.55,
      metalness: 0.35,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, h / 2, 0);
    body.userData = { kind: 'building', buildingId: building.id, plotId: building.plotId, districtId: building.districtId };

    const accentGeo = new THREE.BoxGeometry(1.46, 0.12, 1.46);
    const accentMat = new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.95,
    });
    const accent = new THREE.Mesh(accentGeo, accentMat);
    accent.position.set(0, h + 0.06, 0);
    accent.userData = body.userData;

    const p = Math.max(0, Math.min(1, building.progress));
    const progressGeo = new THREE.BoxGeometry(1.5 * p, 0.06, 0.12);
    const progressMat = new THREE.MeshBasicMaterial({ color: 0x00d9ff, transparent: true, opacity: building.status === 'constructing' ? 0.95 : 0.0 });
    const progressMesh = new THREE.Mesh(progressGeo, progressMat);
    progressMesh.position.set((1.5 * (p - 1)) / 2, 0.12, 0.82);

    group.add(body);
    group.add(accent);
    group.add(progressMesh);
    group.position.set(x, 0.08, z);

    return { group, body, accent, progress: progressMesh, stateKey: '' };
  }

  private disposeBuildingEntry(entry: BuildingMeshEntry): void {
    this.removePickable(entry.body);
    this.removePickable(entry.accent);
    entry.group.removeFromParent();
    entry.body.geometry.dispose();
    (entry.body.material as THREE.Material).dispose();
    entry.accent.geometry.dispose();
    (entry.accent.material as THREE.Material).dispose();
    entry.progress.geometry.dispose();
    (entry.progress.material as THREE.Material).dispose();
  }

  private removePickable(object: THREE.Object3D): void {
    const idx = this.pickables.indexOf(object);
    if (idx >= 0) this.pickables.splice(idx, 1);
  }

  private prune(): void {
    if (!this.layout) return;
    const validPlots = new Set(Object.keys(this.layout.byPlotId));
    for (const [id, entry] of this.plotMeshes.entries()) {
      if (!validPlots.has(id)) {
        this.removePickable(entry.mesh);
        entry.mesh.removeFromParent();
        entry.mesh.geometry.dispose();
        (entry.mesh.material as THREE.Material).dispose();
        this.plotMeshes.delete(id);
      }
    }
  }

  clear(): void {
    this.selectionRing.visible = false;
    for (const entry of this.buildingMeshes.values()) this.disposeBuildingEntry(entry);
    this.buildingMeshes.clear();
    for (const entry of this.plotMeshes.values()) {
      this.removePickable(entry.mesh);
      entry.mesh.removeFromParent();
      entry.mesh.geometry.dispose();
      (entry.mesh.material as THREE.Material).dispose();
    }
    this.plotMeshes.clear();
    for (const group of this.districtGroups.values()) {
      group.removeFromParent();
    }
    this.districtGroups.clear();
    this.districtGrounds.clear();
    this.pickables.length = 0;
  }

  dispose(): void {
    this.clear();
    this.selectionRing.geometry.dispose();
    (this.selectionRing.material as THREE.Material).dispose();
    for (const geo of this.sharedGeometries) geo.dispose();
    for (const mat of this.sharedMaterials) mat.dispose();
    this.sharedGeometries.length = 0;
    this.sharedMaterials.length = 0;
  }
}