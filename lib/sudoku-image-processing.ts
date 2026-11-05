import type CV from '@techstark/opencv-js';
import { hasDarkBackground } from './image-polarity';

// Leaves gray in the polarity used for detection so extraction uses the same ink.
export function detectGrid(cv: typeof CV, gray: CV.Mat) {
  const blur = new cv.Mat();
  const binary = new cv.Mat();
  try {
    if (hasDarkBackground(gray.data, gray.cols, gray.rows)) cv.bitwise_not(gray, gray);
    // Absolute brightness also describes shadowed paper; try the other polarity
    // only if the preferred one cannot supply a qualifying grid contour.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) cv.bitwise_not(gray, gray);
      cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
      cv.adaptiveThreshold(
        blur,
        binary,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        31,
        9,
      );
      const points = findGridCorners(cv, binary);
      if (points.length === 4) return points;
    }
    return [];
  } finally {
    blur.delete();
    binary.delete();
  }
}

export function findGridCorners(cv: typeof CV, binary: CV.Mat) {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  let bestArea = binary.cols * binary.rows * 0.12;
  let points: { x: number; y: number }[] = [];
  try {
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const approx = new cv.Mat();
      try {
        cv.approxPolyDP(contour, approx, 0.02 * cv.arcLength(contour, true), true);
        const area = cv.contourArea(contour);
        if (approx.rows === 4 && area > bestArea && cv.isContourConvex(approx)) {
          bestArea = area;
          points = Array.from({ length: 4 }, (_, j) => ({
            x: approx.data32S[j * 2],
            y: approx.data32S[j * 2 + 1],
          }));
        }
      } finally {
        contour.delete();
        approx.delete();
      }
    }
    return points;
  } finally {
    contours.delete();
    hierarchy.delete();
  }
}

function gridLine(ink: CV.Mat, horizontal: boolean, nominal: number, start: number, end: number) {
  const data = ink.data;
  let best = 0;
  let position = nominal;
  // A four-corner warp removes perspective, not paper curvature. Follow local
  // line support near each nominal boundary instead of clipping bowed cells.
  for (
    let candidate = Math.max(0, nominal - 22);
    candidate <= Math.min(899, nominal + 22);
    candidate++
  ) {
    let support = 0;
    for (let along = start; along < end; along++) {
      for (
        let across = Math.max(0, candidate - 2);
        across <= Math.min(899, candidate + 2);
        across++
      ) {
        const offset = horizontal ? across * ink.cols + along : along * ink.cols + across;
        if (data[offset]) {
          support++;
          break;
        }
      }
    }
    if (
      support > best ||
      (support === best && Math.abs(candidate - nominal) < Math.abs(position - nominal))
    ) {
      best = support;
      position = candidate;
    }
  }
  // Require broad support, but tolerate broken low-contrast grid lines.
  return best >= (end - start) * (2 / 3) ? position : nominal;
}

export function extractDigit(cv: typeof CV, ink: CV.Mat, index: number) {
  // Keep large glyphs intact; components touching this narrower crop are still
  // excluded because they can be grid lines connected to a digit.
  const column = (index % 9) * 100;
  const row = Math.floor(index / 9) * 100;
  const top = gridLine(ink, true, row, column + 15, column + 85);
  const bottom = gridLine(ink, true, Math.min(899, row + 100), column + 15, column + 85);
  const left = gridLine(ink, false, column, top + 15, bottom - 15);
  const right = gridLine(ink, false, Math.min(899, column + 100), top + 15, bottom - 15);
  const roiWidth = right - left - 10;
  const roiHeight = bottom - top - 10;
  const roi = ink.roi(new cv.Rect(left + 5, top + 5, roiWidth, roiHeight));
  const labels = new cv.Mat();
  const stats = new cv.Mat();
  const centers = new cv.Mat();
  try {
    const count = cv.connectedComponentsWithStats(roi, labels, stats, centers, 8, cv.CV_32S);
    let selected = 0;
    let best = 0;
    for (let k = 1; k < count; k++) {
      const x = stats.intAt(k, cv.CC_STAT_LEFT);
      const y = stats.intAt(k, cv.CC_STAT_TOP);
      const w = stats.intAt(k, cv.CC_STAT_WIDTH);
      const h = stats.intAt(k, cv.CC_STAT_HEIGHT);
      const area = stats.intAt(k, cv.CC_STAT_AREA);
      if (
        x <= 1 ||
        y <= 1 ||
        x + w >= roiWidth - 1 ||
        y + h >= roiHeight - 1 ||
        h < 22 ||
        w < 5 ||
        area < 65 ||
        Math.abs(x + w / 2 - roiWidth / 2) > 22 ||
        Math.abs(y + h / 2 - roiHeight / 2) > 22
      )
        continue;
      if (area > best) {
        selected = k;
        best = area;
      }
    }
    if (!selected) return null;
    const x = stats.intAt(selected, cv.CC_STAT_LEFT);
    const y = stats.intAt(selected, cv.CC_STAT_TOP);
    const width = stats.intAt(selected, cv.CC_STAT_WIDTH);
    const height = stats.intAt(selected, cv.CC_STAT_HEIGHT);
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let py = 0; py < height; py++)
      for (let px = 0; px < width; px++) {
        const offset = (py * width + px) * 4;
        const value = labels.intAt(y + py, x + px) === selected ? 0 : 255;
        pixels[offset] = value;
        pixels[offset + 1] = value;
        pixels[offset + 2] = value;
        pixels[offset + 3] = 255;
      }
    return { width, height, pixels };
  } finally {
    roi.delete();
    labels.delete();
    stats.delete();
    centers.delete();
  }
}
