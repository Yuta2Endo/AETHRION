# AETHRION — Game Design Overview

**Project:** AETHRION  
**Stage:** 01 — Foundation (design documented; gameplay not implemented)

## 1. Genre & Vision

Hybrid Empire Simulator combining Business Tycoon, Economic Strategy, City Builder, Life Simulation, Technology Simulator, and Global Empire Management.

The player starts with a small technology corporation and builds a global empire. The world evolves in response to player decisions.

## 2. Core Player Activities

- Establish corporations
- Hire and manage employees
- Develop technologies (research tree)
- Build factories and research centers
- Manufacture products
- Manage supply chains
- Develop cities
- Influence global markets
- Compete against AI corporations
- Expand across world regions
- Shape the future of civilization

## 3. Domain Modules (planned)

Each module is an independent, typed interface. Implementations land in future stages.

| Module | Responsibility |
|--------|----------------|
| World Engine | Global regions, map, world-state evolution |
| Economy Engine | Markets, currencies, pricing, global trade |
| Corporation Engine | Corporations, employees, hiring, corporate structure |
| Technology Engine | Technology tree, research, unlocks |
| Production Engine | Factories, products, manufacturing, supply chains |
| City Engine | Cities, buildings, urban development |
| Employee Engine | Hiring, roles, salaries, performance |
| Events Engine | World events, news, scenario triggers |
| Competitor AI Engine | AI corporations, competitive behavior |
| Save & Archive Engine | Persistence (IndexedDB) |

## 4. Simulation Principles

- Game simulation does **not** depend on React components.
- Three.js is responsible for rendering only — never game rules.
- Expensive simulation tasks run in Web Workers (via Comlink) when justified.
- Typed interfaces between modules; no circular dependencies.
- All modules testable in isolation.

## 5. Stage 01 Status

No gameplay functionality is implemented. All modules above are documented interfaces/placeholders. The dashboard explicitly marks systems as "planned — future stage."
