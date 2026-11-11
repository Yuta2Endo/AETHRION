/**
 * Production Engine module (Stage 01 placeholder).
 * Responsible for factories, products, manufacturing, and supply chains.
 * Typed interface only — no implementation in Stage 01.
 */

export interface Product {
  id: string;
  name: string;
  cost: number;
  price: number;
}

export interface ProductionState {
  products: Product[];
  factories: number;
}

export const defaultProductionState: ProductionState = {
  products: [],
  factories: 0,
};

export function getProductionState(): ProductionState {
  return { ...defaultProductionState };
}
