import { describe, expect, it } from 'vitest';
import {
  CLIMATE_ZONES, CLIMATE_ZONE_LABEL, CLIMATE_ZONE_DESC,
  rollWeather, hashSeed, weatherFx, zoneFromContinent,
  type WeatherKind,
} from './weather';

describe('rollWeather', () => {
  it('is deterministic for the same seed', () => {
    for (const zone of CLIMATE_ZONES) {
      const a = rollWeather(zone, 12345);
      const b = rollWeather(zone, 12345);
      expect(a).toEqual(b);
    }
  });

  it('produces coherent temperatures for every zone over many rolls', () => {
    for (const zone of CLIMATE_ZONES) {
      for (let seed = 0; seed < 200; seed++) {
        const w = rollWeather(zone, seed);
        expect(w.tempC).toBeGreaterThanOrEqual(-15);
        expect(w.tempC).toBeLessThanOrEqual(48);
        if (w.kind === 'neige') expect(w.tempC).toBeLessThanOrEqual(1);
        if (w.kind === 'canicule') expect(w.tempC).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it('never snows in tropical/desert zones', () => {
    for (const zone of ['afrique-tropicale', 'sahara-moyen-orient', 'ameriques-tropicales', 'asie-sud-tropicale', 'mediterranee', 'oceanie'] as const) {
      for (let seed = 0; seed < 300; seed++) {
        expect(rollWeather(zone, seed).kind).not.toBe('neige');
      }
    }
  });

  it('never produces canicule in northern Europe', () => {
    for (let seed = 0; seed < 300; seed++) {
      expect(rollWeather('europe-nord', seed).kind).not.toBe('canicule');
    }
  });

  it('has labels and descriptions for every zone', () => {
    for (const zone of CLIMATE_ZONES) {
      expect(CLIMATE_ZONE_LABEL[zone]).toBeTruthy();
      expect(CLIMATE_ZONE_DESC[zone]).toBeTruthy();
    }
  });
});

describe('weatherFx', () => {
  it('is neutral without weather and for clear skies', () => {
    expect(weatherFx(undefined).fatigueMult).toBe(1);
    expect(weatherFx({ kind: 'clair', tempC: 18 }).keyPassMult).toBe(1);
  });

  it('heat multiplies fatigue', () => {
    expect(weatherFx({ kind: 'canicule', tempC: 40 }).fatigueMult).toBeGreaterThan(1.3);
    expect(weatherFx({ kind: 'clair', tempC: 35 }).fatigueMult).toBeGreaterThan(1);
  });

  it('rain/snow degrade technique, wind degrades set pieces', () => {
    const rain = weatherFx({ kind: 'pluie', tempC: 12 });
    expect(rain.keyPassMult).toBeLessThan(1);
    expect(rain.foulMult).toBeGreaterThan(1);
    const snow = weatherFx({ kind: 'neige', tempC: -2 });
    expect(snow.dribbleMult).toBeLessThan(rain.dribbleMult);
    const wind = weatherFx({ kind: 'vent', tempC: 15 });
    expect(wind.setPieceDelta).toBeLessThan(0);
  });

  it('all kinds keep on-target probability positive', () => {
    const kinds: WeatherKind[] = ['clair', 'couvert', 'pluie', 'orage', 'neige', 'vent', 'brouillard', 'canicule'];
    for (const kind of kinds) {
      const fx = weatherFx({ kind, tempC: 10 });
      expect(0.55 + fx.onTargetDelta).toBeGreaterThan(0.4);
    }
  });
});

describe('helpers', () => {
  it('hashSeed is stable and non-negative', () => {
    expect(hashSeed('match-123')).toBe(hashSeed('match-123'));
    expect(hashSeed('x')).toBeGreaterThanOrEqual(0);
  });

  it('maps every continent to a zone', () => {
    for (const c of ['europe', 'asie', 'asiecentrale', 'amerique', 'moyenorient', 'afrique', 'afriquenord', 'oceanie']) {
      expect(zoneFromContinent(c)).toBeTruthy();
    }
    expect(zoneFromContinent('inconnu')).toBeUndefined();
  });
});
