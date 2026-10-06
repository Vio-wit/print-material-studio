export interface CollageRect {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CollageLayoutOptions {
  width: number;
  height: number;
  columns: number;
  gap: number;
  mode: "grid" | "masonry";
}

/** Suggest a grid column count that best matches the selected photos and paper shape. */
export function suggestCollageColumns(aspects: number[], pageWidth: number, pageHeight: number, maxColumns = 5): number {
  if (aspects.length === 0 || pageWidth <= 0 || pageHeight <= 0) return 1;
  const validAspects = aspects.map((aspect) => Number.isFinite(aspect) && aspect > 0 ? aspect : 1);
  const limit = Math.max(1, Math.min(validAspects.length, Math.round(maxColumns)));
  let bestColumns = 1;
  let lowestMismatch = Number.POSITIVE_INFINITY;
  for (let columns = 1; columns <= limit; columns++) {
    const rows = Math.ceil(validAspects.length / columns);
    const cellAspect = (pageWidth / pageHeight) * rows / columns;
    const mismatch = validAspects.reduce((total, aspect) => total + Math.abs(Math.log(cellAspect / aspect)), 0) / validAspects.length;
    if (mismatch < lowestMismatch) {
      lowestMismatch = mismatch;
      bestColumns = columns;
    }
  }
  return bestColumns;
}

/** Deterministic, non-overlapping photo cells with a shared physical gap. */
export function computeCollageLayout(aspects: number[], options: CollageLayoutOptions): CollageRect[] {
  if (aspects.length === 0 || options.width <= 0 || options.height <= 0) return [];
  const columns = Math.max(1, Math.min(aspects.length, Math.round(options.columns)));
  const gap = Math.max(0, options.gap);
  const columnWidth = Math.max(1, (options.width - gap * (columns - 1)) / columns);
  const safeAspects = aspects.map((aspect) => Number.isFinite(aspect) && aspect > 0 ? aspect : 1);

  if (options.mode === "grid") {
    const rows = Math.ceil(aspects.length / columns);
    const cellHeight = Math.max(1, (options.height - gap * (rows - 1)) / rows);
    return aspects.map((_, index) => {
      const row = Math.floor(index / columns);
      const firstInRow = row * columns;
      const photosInRow = Math.min(columns, aspects.length - firstInRow);
      const occupiedWidth = photosInRow * columnWidth + gap * (photosInRow - 1);
      return {
        index,
        x: (options.width - occupiedWidth) / 2 + (index % columns) * (columnWidth + gap),
        y: row * (cellHeight + gap),
        width: columnWidth,
        height: cellHeight
      };
    });
  }

  const itemsByColumn: number[][] = Array.from({ length: columns }, () => []);
  const heightsByColumn = Array.from({ length: columns }, () => 0);
  safeAspects.forEach((aspect, index) => {
    let shortest = 0;
    for (let column = 1; column < columns; column++) {
      if (heightsByColumn[column]! < heightsByColumn[shortest]!) shortest = column;
    }
    itemsByColumn[shortest]!.push(index);
    heightsByColumn[shortest] = heightsByColumn[shortest]! + columnWidth / aspect + (itemsByColumn[shortest]!.length > 1 ? gap : 0);
  });

  let scale = 1;
  for (let column = 0; column < columns; column++) {
    const indexes = itemsByColumn[column]!;
    if (indexes.length === 0) continue;
    const imageHeight = indexes.reduce((total, index) => total + columnWidth / safeAspects[index]!, 0);
    const available = Math.max(1, options.height - gap * (indexes.length - 1));
    scale = Math.min(scale, available / imageHeight);
  }

  const scaledWidth = columnWidth * scale;
  const totalWidth = scaledWidth * columns + gap * (columns - 1);
  const left = (options.width - totalWidth) / 2;
  const rects: CollageRect[] = [];
  itemsByColumn.forEach((indexes, column) => {
    const columnImagesHeight = indexes.reduce((total, index) => total + scaledWidth / safeAspects[index]!, 0);
    const columnHeight = columnImagesHeight + gap * Math.max(0, indexes.length - 1);
    let y = (options.height - columnHeight) / 2;
    for (const index of indexes) {
      const height = scaledWidth / safeAspects[index]!;
      rects.push({ index, x: left + column * (scaledWidth + gap), y, width: scaledWidth, height });
      y += height + gap;
    }
  });

  return rects.sort((first, second) => first.index - second.index);
}
