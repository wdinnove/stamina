import { describe, it, expect } from 'vitest';
import { ZONE_LABEL_POINTS, ZONE_ORDER, shotZone, shotValue, zoneTier, densityGrid } from './shotChart';

describe('carte des zones', () => {
  it("l'étiquette de chaque zone tombe dans sa propre zone", () => {
    for (const zone of ZONE_ORDER) {
      const p = ZONE_LABEL_POINTS[zone];
      expect(shotZone(p.x, p.y)).toBe(zone);
    }
  });
});

describe('zoneTier', () => {
  it('applique les seuils de chaque type de zone', () => {
    expect(zoneTier('raquette', 65)).toBe('good');
    expect(zoneTier('cercle', 50)).toBe('mid');
    expect(zoneTier('raquette', 39)).toBe('bad');
    expect(zoneTier('mid_axe', 50)).toBe('good');
    expect(zoneTier('mid_gauche', 34)).toBe('bad');
    expect(zoneTier('corner_droite', 35)).toBe('good');
    expect(zoneTier('arc_axe', 30)).toBe('mid');
    expect(zoneTier('aile_gauche', 24)).toBe('bad');
  });
});

describe('corner et cercle', () => {
  it("le corner s'arrête à la fin de la portion droite (2,99 m) ; en dessous, aile à 3 pts", () => {
    expect(shotZone(0.5, 2.9)).toBe('corner_gauche');
    expect(shotZone(14.5, 2.9)).toBe('corner_droite');
    expect(shotZone(0.5, 3.1)).toBe('aile_gauche');
    expect(shotValue(0.5, 3.1)).toBe(3);
    expect(shotZone(14.5, 8)).toBe('aile_droite');
  });

  it('le cercle couvre 1,75 m autour du panier', () => {
    expect(shotZone(7.5, 1.575 + 1.7)).toBe('cercle');
    expect(shotZone(7.5, 1.575 + 1.8)).toBe('raquette');
  });
});

describe('densityGrid', () => {
  it('culmine à 1 sur le foyer de tirs et retombe loin de lui', () => {
    const g = densityGrid([{ x: 3.1, y: 5.1 }, { x: 3.1, y: 5.1 }, { x: 12, y: 10 }], 0.25, 1);
    const at = (x: number, y: number) => g.values[Math.floor(y / 0.25) * g.cols + Math.floor(x / 0.25)];
    expect(at(3.1, 5.1)).toBeCloseTo(1, 1);
    expect(at(12, 10)).toBeCloseTo(0.5, 1);
    expect(at(7.5, 12)).toBeLessThan(0.01);
  });
});
