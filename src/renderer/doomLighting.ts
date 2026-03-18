export function lightLevelToBrightness(lightLevel: number, contrast: number = 0): number {
  const adjusted = Math.max(0, Math.min(255, lightLevel + contrast));
  const quantized = Math.max(0, Math.min(31, Math.round(adjusted / 8)));
  return quantized / 31;
}

export function getWallFakeContrast(dx: number, dy: number): number {
  if (Math.abs(dx) > Math.abs(dy)) {
    return -16;
  }

  if (Math.abs(dy) > Math.abs(dx)) {
    return 16;
  }

  return 0;
}
