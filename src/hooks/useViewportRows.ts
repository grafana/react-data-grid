import { useMemo } from 'react';

import { floor, max, min } from '../utils';

interface ViewportRowsArgs<R> {
  element: HTMLElement | null;
  rows: readonly R[];
  rowHeight: number | string | ((row: R) => number);
  clientHeight: number;
  scrollTop: number;
  enableVirtualization: boolean;
  gridHeight: number;
}

export function useViewportRows<R>({
  element,
  rows,
  rowHeight,
  clientHeight,
  scrollTop,
  enableVirtualization,
  gridHeight
}: ViewportRowsArgs<R>) {
  const { totalRowHeight, gridTemplateRows, getRowTop, getRowHeight, findRowIdx } = useMemo(() => {
    if (typeof rowHeight === 'number') {
      return {
        totalRowHeight: rowHeight * rows.length,
        gridTemplateRows: ` repeat(${rows.length}, ${rowHeight}px)`,
        getRowTop: (rowIdx: number) => rowIdx * rowHeight,
        getRowHeight: () => rowHeight,
        findRowIdx: (offset: number) => floor(offset / rowHeight)
      };
    }

    if (typeof rowHeight === 'string') {
      const _headerElement = (element: Element): Element | null =>
        element.querySelector('[role="columnheader"]');
      const _rowElement = (element: Element, rowIdx: number): Element | null => {
        const nth = _headerElement(element) ? rowIdx + 1 : rowIdx;
        return element.querySelector(`[role="row"]:nth-of-type(${nth})`);
      };
      return {
        totalRowHeight: gridHeight,
        gridTemplateRows: ` repeat(${rows.length}, ${rowHeight})`,
        getRowTop(rowIdx: number) {
          if (!element) return -1;
          const rowElement = _rowElement(element, rowIdx);
          if (!rowElement) return -1;
          return rowElement.scrollTop;
        },
        getRowHeight(rowIdx: number) {
          if (!element) return -1;
          const rowElement = _rowElement(element, rowIdx);
          if (!rowElement) return 0;
          return rowElement.scrollHeight;
        },
        findRowIdx(offset: number) {
          if (!element) return -1;
          const rowElements = element.querySelectorAll('[role="row"]');
          let start = 0;
          let end = rowElements.length - 1;

          while (start <= end) {
            const middle = start + floor((end - start) / 2);
            const currentScrollTop = _rowElement(element, middle)?.scrollTop ?? 0;
            const prevScrollTop = _rowElement(element, middle - 1)?.scrollTop ?? 0;

            if (currentScrollTop >= offset && prevScrollTop < offset) return middle;

            if (currentScrollTop < offset) {
              start = middle + 1;
            } else if (currentScrollTop > offset) {
              end = middle - 1;
            }

            if (start > end) return end;
          }

          return -1;
        }
      };
    }

    let totalRowHeight = 0;
    let gridTemplateRows = ' ';
    // Calcule the height of all the rows upfront. This can cause performance issues
    // and we can consider using a similar approach as react-window
    // https://github.com/bvaughn/react-window/blob/b0a470cc264e9100afcaa1b78ed59d88f7914ad4/src/VariableSizeList.js#L68
    const rowPositions = rows.map((row) => {
      const currentRowHeight = rowHeight(row);
      const position = { top: totalRowHeight, height: currentRowHeight };
      gridTemplateRows += `${currentRowHeight}px `;
      totalRowHeight += currentRowHeight;
      return position;
    });

    const validateRowIdx = (rowIdx: number) => {
      return max(0, min(rows.length - 1, rowIdx));
    };

    return {
      totalRowHeight,
      gridTemplateRows,
      getRowTop: (rowIdx: number) => rowPositions[validateRowIdx(rowIdx)].top,
      getRowHeight: (rowIdx: number) => rowPositions[validateRowIdx(rowIdx)].height,
      findRowIdx(offset: number) {
        let start = 0;
        let end = rowPositions.length - 1;
        while (start <= end) {
          const middle = start + floor((end - start) / 2);
          const currentOffset = rowPositions[middle].top;

          if (currentOffset === offset) return middle;

          if (currentOffset < offset) {
            start = middle + 1;
          } else if (currentOffset > offset) {
            end = middle - 1;
          }

          if (start > end) return end;
        }
        return 0;
      }
    };
  }, [element, gridHeight, rowHeight, rows]);

  let rowOverscanStartIdx = 0;
  let rowOverscanEndIdx = rows.length - 1;

  if (enableVirtualization) {
    const overscanThreshold = 4;
    const rowVisibleStartIdx = findRowIdx(scrollTop);
    const rowVisibleEndIdx = findRowIdx(scrollTop + clientHeight);
    rowOverscanStartIdx = max(0, rowVisibleStartIdx - overscanThreshold);
    rowOverscanEndIdx = min(rows.length - 1, rowVisibleEndIdx + overscanThreshold);
  }

  return {
    rowOverscanStartIdx,
    rowOverscanEndIdx,
    totalRowHeight,
    gridTemplateRows,
    getRowTop,
    getRowHeight,
    findRowIdx
  };
}
