import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CalibrationSettings,
  clearSettings,
  loadSettings,
  saveSettings,
} from "./settings.ts";

describe("Settings persistence", () => {
  let storageMap: Record<string, string>;

  beforeEach(() => {
    storageMap = {};
    vi.stubGlobal(
      "localStorage",
      {
        getItem: (key: string) => storageMap[key] ?? null,
        setItem: (key: string, value: string) => {
          storageMap[key] = value;
        },
        removeItem: (key: string) => {
          delete storageMap[key];
        },
      } as Storage
    );
  });

  it("saveSettings and loadSettings round-trip a valid config", () => {
    const settings: CalibrationSettings = {
      f0Center: 120,
      noiseFloor: 0.001,
      rangeSemitones: 5,
    };
    saveSettings(settings);
    const loaded = loadSettings();
    expect(loaded).toEqual(settings);
  });

  it("loadSettings returns null when localStorage is empty", () => {
    expect(loadSettings()).toBeNull();
  });

  it("loadSettings returns null on corrupt JSON", () => {
    storageMap["toneflap.settings.v1"] = "not valid json {";
    expect(loadSettings()).toBeNull();
  });

  it("loadSettings returns null when f0Center is out of range (< 70)", () => {
    const settings: CalibrationSettings = {
      f0Center: 50,
      noiseFloor: 0.001,
      rangeSemitones: 5,
    };
    storageMap["toneflap.settings.v1"] = JSON.stringify(settings);
    expect(loadSettings()).toBeNull();
  });

  it("loadSettings returns null when f0Center is out of range (> 400)", () => {
    const settings: CalibrationSettings = {
      f0Center: 500,
      noiseFloor: 0.001,
      rangeSemitones: 5,
    };
    storageMap["toneflap.settings.v1"] = JSON.stringify(settings);
    expect(loadSettings()).toBeNull();
  });

  it("loadSettings accepts f0Center at the boundaries (70 and 400)", () => {
    const settings70: CalibrationSettings = {
      f0Center: 70,
      noiseFloor: 0.001,
      rangeSemitones: 5,
    };
    storageMap["toneflap.settings.v1"] = JSON.stringify(settings70);
    expect(loadSettings()).toEqual(settings70);

    const settings400: CalibrationSettings = {
      f0Center: 400,
      noiseFloor: 0.001,
      rangeSemitones: 5,
    };
    storageMap["toneflap.settings.v1"] = JSON.stringify(settings400);
    expect(loadSettings()).toEqual(settings400);
  });

  it("loadSettings returns null when noiseFloor is non-positive", () => {
    const settings: CalibrationSettings = {
      f0Center: 120,
      noiseFloor: 0,
      rangeSemitones: 5,
    };
    storageMap["toneflap.settings.v1"] = JSON.stringify(settings);
    expect(loadSettings()).toBeNull();

    const settingsNegative: CalibrationSettings = {
      f0Center: 120,
      noiseFloor: -0.001,
      rangeSemitones: 5,
    };
    storageMap["toneflap.settings.v1"] = JSON.stringify(settingsNegative);
    expect(loadSettings()).toBeNull();
  });

  it("loadSettings returns null when rangeSemitones is out of range (< 3)", () => {
    const settings: CalibrationSettings = {
      f0Center: 120,
      noiseFloor: 0.001,
      rangeSemitones: 2,
    };
    storageMap["toneflap.settings.v1"] = JSON.stringify(settings);
    expect(loadSettings()).toBeNull();
  });

  it("loadSettings returns null when rangeSemitones is out of range (> 8)", () => {
    const settings: CalibrationSettings = {
      f0Center: 120,
      noiseFloor: 0.001,
      rangeSemitones: 9,
    };
    storageMap["toneflap.settings.v1"] = JSON.stringify(settings);
    expect(loadSettings()).toBeNull();
  });

  it("loadSettings accepts rangeSemitones at the boundaries (3 and 8)", () => {
    const settings3: CalibrationSettings = {
      f0Center: 120,
      noiseFloor: 0.001,
      rangeSemitones: 3,
    };
    storageMap["toneflap.settings.v1"] = JSON.stringify(settings3);
    expect(loadSettings()).toEqual(settings3);

    const settings8: CalibrationSettings = {
      f0Center: 120,
      noiseFloor: 0.001,
      rangeSemitones: 8,
    };
    storageMap["toneflap.settings.v1"] = JSON.stringify(settings8);
    expect(loadSettings()).toEqual(settings8);
  });

  it("clearSettings removes the settings from localStorage", () => {
    const settings: CalibrationSettings = {
      f0Center: 120,
      noiseFloor: 0.001,
      rangeSemitones: 5,
    };
    saveSettings(settings);
    expect(loadSettings()).not.toBeNull();
    clearSettings();
    expect(loadSettings()).toBeNull();
  });

  it("loadSettings returns null when fields are missing", () => {
    storageMap["toneflap.settings.v1"] = JSON.stringify({
      f0Center: 120,
      noiseFloor: 0.001,
    });
    expect(loadSettings()).toBeNull();
  });

  it("loadSettings returns null when fields are the wrong type", () => {
    storageMap["toneflap.settings.v1"] = JSON.stringify({
      f0Center: "120",
      noiseFloor: 0.001,
      rangeSemitones: 5,
    });
    expect(loadSettings()).toBeNull();

    storageMap["toneflap.settings.v1"] = JSON.stringify({
      f0Center: 120,
      noiseFloor: "0.001",
      rangeSemitones: 5,
    });
    expect(loadSettings()).toBeNull();

    storageMap["toneflap.settings.v1"] = JSON.stringify({
      f0Center: 120,
      noiseFloor: 0.001,
      rangeSemitones: "5",
    });
    expect(loadSettings()).toBeNull();
  });
});
