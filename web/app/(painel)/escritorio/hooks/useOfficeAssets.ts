'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { OfficeState } from '../office/engine/officeState';
import { setFloorSprites } from '../office/floorTiles';
import type { LoadedAssetData } from '../office/layout/furnitureCatalog';
import { buildDynamicCatalog } from '../office/layout/furnitureCatalog';
import { migrateLayoutColors } from '../office/layout/layoutSerializer';
import { setCharacterTemplates } from '../office/sprites/spriteData';
import type { OfficeLayout } from '../office/types';
import { setWallSprites } from '../office/wallTiles';

type FurnitureAsset = LoadedAssetData['catalog'][number] & { file: string };

const CHAR_COUNT = 18;
const CHAR_FRAME_W = 16;
const CHAR_FRAME_H = 32;
const CHAR_FRAMES_PER_ROW = 7;
const DIRECTIONS = ['down', 'up', 'right'] as const;

const WALL_PIECE_W = 16;
const WALL_PIECE_H = 32;
const WALL_GRID_COLS = 4;
const WALL_BITMASK_COUNT = 16;

const FLOOR_PATTERN_COUNT = 9;
const FLOOR_TILE_SIZE = 16;

function pngUrlToSprite(
  url: string,
  frameW: number,
  frameH: number,
  offsetX = 0,
  offsetY = 0,
): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(offsetX, offsetY, frameW, frameH).data;
      const sprite: string[][] = [];
      for (let y = 0; y < frameH; y++) {
        const row: string[] = [];
        for (let x = 0; x < frameW; x++) {
          const idx = (y * frameW + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];
          if (a < 2) {
            row.push('');
          } else {
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
            row.push(hex);
          }
        }
        sprite.push(row);
      }
      resolve(sprite);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export interface UseOfficeAssetsReturn {
  layoutReady: boolean;
  loadedAssets?: LoadedAssetData;
  reloadLayout: (customLayout?: OfficeLayout) => Promise<void>;
}

export function useOfficeAssets(
  getOfficeState: () => OfficeState,
  onLayoutLoaded?: (layout: OfficeLayout) => void,
): UseOfficeAssetsReturn {
  const [layoutReady, setLayoutReady] = useState(false);
  const [loadedAssets, setLoadedAssets] = useState<LoadedAssetData | undefined>();
  const initializedRef = useRef(false);

  const reloadLayout = useCallback(
    async (customLayout?: OfficeLayout) => {
      const os = getOfficeState();
      if (customLayout) {
        const migrated = migrateLayoutColors(customLayout);
        os.rebuildFromLayout(migrated);
        onLayoutLoaded?.(migrated);
        return;
      }
      try {
        const resp = await fetch('/api/escritorio/layout', { cache: 'no-store' });
        if (resp.ok) {
          const data = await resp.json();
          const rawLayout = (data?.layout ?? data) as OfficeLayout;
          if (rawLayout && rawLayout.version === 1 && Array.isArray(rawLayout.tiles)) {
            const migrated = migrateLayoutColors(rawLayout);
            os.rebuildFromLayout(migrated);
            onLayoutLoaded?.(migrated);
            return;
          }
        }
      } catch {
        // fallback below
      }
      try {
        const resp = await fetch('/assets/default-layout.json');
        if (resp.ok) {
          const rawLayout = (await resp.json()) as OfficeLayout;
          const migrated = migrateLayoutColors(rawLayout);
          os.rebuildFromLayout(migrated);
          onLayoutLoaded?.(migrated);
          return;
        }
      } catch {
        // use built-in layout
      }
      os.rebuildFromLayout(os.getLayout());
      onLayoutLoaded?.(os.getLayout());
    },
    [getOfficeState, onLayoutLoaded],
  );

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    async function boot() {
      // 1. Character sprites (char_0..char_17)
      try {
        const characters: Array<{ down: string[][][]; up: string[][][]; right: string[][][] }> = [];
        for (let ci = 0; ci < CHAR_COUNT; ci++) {
          const url = `/assets/characters/char_${ci}.png`;
          const charData: { down: string[][][]; up: string[][][]; right: string[][][] } = {
            down: [],
            up: [],
            right: [],
          };
          for (let dirIdx = 0; dirIdx < DIRECTIONS.length; dirIdx++) {
            const dir = DIRECTIONS[dirIdx];
            const rowOffsetY = dirIdx * CHAR_FRAME_H;
            const frames: string[][][] = [];
            for (let f = 0; f < CHAR_FRAMES_PER_ROW; f++) {
              const sprite = await pngUrlToSprite(
                url,
                CHAR_FRAME_W,
                CHAR_FRAME_H,
                f * CHAR_FRAME_W,
                rowOffsetY,
              );
              frames.push(sprite);
            }
            charData[dir] = frames;
          }
          characters.push(charData);
        }
        setCharacterTemplates(characters);
      } catch (err) {
        console.warn('[escritorio] Falha ao carregar sprites de personagens:', err);
      }

      // 2. Floor pattern sprites (/assets/floors/floor_0..8.png)
      try {
        const floors: string[][][] = [];
        for (let fi = 0; fi < FLOOR_PATTERN_COUNT; fi++) {
          const sprite = await pngUrlToSprite(
            `/assets/floors/floor_${fi}.png`,
            FLOOR_TILE_SIZE,
            FLOOR_TILE_SIZE,
          );
          floors.push(sprite);
        }
        if (floors.length > 0) {
          setFloorSprites(floors);
        }
      } catch {
        // Fallback solid tile is automatic
      }

      // 3. Wall sprites (/assets/walls.png)
      try {
        const sprites: string[][][] = [];
        for (let mask = 0; mask < WALL_BITMASK_COUNT; mask++) {
          const ox = (mask % WALL_GRID_COLS) * WALL_PIECE_W;
          const oy = Math.floor(mask / WALL_GRID_COLS) * WALL_PIECE_H;
          const sprite = await pngUrlToSprite('/assets/walls.png', WALL_PIECE_W, WALL_PIECE_H, ox, oy);
          sprites.push(sprite);
        }
        setWallSprites(sprites);
      } catch (err) {
        console.warn('[escritorio] Falha ao carregar walls.png:', err);
      }

      // 4. Furniture catalog + PNGs
      try {
        const catalogRes = await fetch('/assets/furniture/furniture-catalog.json');
        if (catalogRes.ok) {
          const catalogData = (await catalogRes.json()) as { assets: FurnitureAsset[] };
          const catalog = catalogData.assets || [];
          const sprites: Record<string, string[][]> = {};
          await Promise.all(
            catalog.map(async (asset) => {
              try {
                let filePath = asset.file;
                if (!filePath.startsWith('assets/')) {
                  filePath = `assets/${filePath}`;
                }
                const sprite = await pngUrlToSprite(`/${filePath}`, asset.width, asset.height);
                sprites[asset.id] = sprite;
              } catch {
                // ignore missing individual furniture sprite
              }
            }),
          );
          buildDynamicCatalog({ catalog, sprites });
          setLoadedAssets({ catalog, sprites });
        }
      } catch (err) {
        console.warn('[escritorio] Falha ao carregar catalogo de moveis:', err);
      }

      // 5. Office Layout
      await reloadLayout();
      setLayoutReady(true);
    }

    boot();
  }, [reloadLayout]);

  return {
    layoutReady,
    loadedAssets,
    reloadLayout,
  };
}
