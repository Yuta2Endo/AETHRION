/**
 * City Engine module (Stage 01 placeholder).
 * Responsible for cities, buildings, and urban development.
 * Typed interface only — no implementation in Stage 01.
 */

export interface City {
  id: string;
  name: string;
  population: number;
}

export interface CityState {
  cities: City[];
}

export const defaultCityState: CityState = {
  cities: [],
};

export function getCityState(): CityState {
  return { ...defaultCityState };
}
