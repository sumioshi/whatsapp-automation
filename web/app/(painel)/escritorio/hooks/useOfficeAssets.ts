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

interface PrebakedOfficeSpritesBundle {
  characters: Array<{ down: string[][][]; up: string[][][]; right: string[][][] }>;
  floors: string[][][];
  walls: string[][][];
  catalog: LoadedAssetData['catalog'];
  sprites: Record<string, string[][]>;
}

let cachedBundle: PrebakedOfficeSpritesBundle | null = null;
let cachedLayout: OfficeLayout | null = null;

export interface UseOfficeAssetsReturn {
  layoutReady: boolean;
  loadingProgress: number;
  loadingStep: string;
  loadedAssets?: LoadedAssetData;
  reloadLayout: (customLayout?: OfficeLayout) => Promise<void>;
}

export function useOfficeAssets(
  getOfficeState: () => OfficeState,
  onLayoutLoaded?: (layout: OfficeLayout) => void,
): UseOfficeAssetsReturn {
  const [layoutReady, setLayoutReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(cachedBundle ? 100 : 12);
  const [loadingStep, setLoadingStep] = useState(
    cachedBundle ? 'Abrindo portas do estúdio…' : 'Carregando sprites em pixel-art…',
  );
  const [loadedAssets, setLoadedAssets] = useState<LoadedAssetData | undefined>(
    cachedBundle ? { catalog: cachedBundle.catalog, sprites: cachedBundle.sprites } : undefined,
  );
  const initializedRef = useRef(false);

  const reloadLayout = useCallback(
    async (customLayout?: OfficeLayout) => {
      const os = getOfficeState();
      if (customLayout) {
        const migrated = migrateLayoutColors(customLayout);
        cachedLayout = migrated;
        os.rebuildFromLayout(migrated);
        onLayoutLoaded?.(migrated);
        return;
      }
      try {
        const resp = await fetch('/api/escritorio/layout', { cache: 'no-store' });
        if (resp.ok) {
          const data = await resp.json();
          const rawLayout = (data?.layout ?? data) as OfficeLayout;
          if (
            rawLayout &&
            (rawLayout.version ?? 1) >= 4 &&
            Array.isArray(rawLayout.tiles) &&
            rawLayout.cols >= 50
          ) {
            const migrated = migrateLayoutColors(rawLayout);
            cachedLayout = migrated;
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
          cachedLayout = migrated;
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
      try {
        // Caminho ultra-rápido se já estiver em memória na sessão
        if (cachedBundle && cachedLayout) {
          setCharacterTemplates(cachedBundle.characters);
          setFloorSprites(cachedBundle.floors);
          setWallSprites(cachedBundle.walls);
          buildDynamicCatalog({ catalog: cachedBundle.catalog, sprites: cachedBundle.sprites });
          setLoadedAssets({ catalog: cachedBundle.catalog, sprites: cachedBundle.sprites });
          const os = getOfficeState();
          os.rebuildFromLayout(cachedLayout);
          onLayoutLoaded?.(cachedLayout);
          setLoadingProgress(100);
          setLayoutReady(true);
          return;
        }

        setLoadingProgress(28);
        setLoadingStep('Baixando pacote de sprites e planta 36×26…');

        // Baixa o bundle único pré-compilado (50 KB gzipped) + o layout em paralelo!
        const [bundleRes, layoutPromise] = await Promise.all([
          cachedBundle ? Promise.resolve(null) : fetch('/assets/office-sprites-bundle.json'),
          reloadLayout(),
        ]);

        setLoadingProgress(72);
        setLoadingStep('Montando 28 estações de trabalho e iluminação…');

        let bundle = cachedBundle;
        if (!bundle && bundleRes && bundleRes.ok) {
          bundle = (await bundleRes.json()) as PrebakedOfficeSpritesBundle;
          cachedBundle = bundle;
        }

        if (bundle) {
          setCharacterTemplates(bundle.characters);
          if (bundle.floors?.length) setFloorSprites(bundle.floors);
          if (bundle.walls?.length) setWallSprites(bundle.walls);
          buildDynamicCatalog({ catalog: bundle.catalog, sprites: bundle.sprites });
          setLoadedAssets({ catalog: bundle.catalog, sprites: bundle.sprites });
          // Reconstrói as instâncias de móveis após o catálogo dinâmico estar pronto
          const os = getOfficeState();
          os.rebuildFromLayout(os.getLayout());
        }

        void layoutPromise;
        setLoadingProgress(100);
        setLoadingStep('Posicionando projetos nas baias…');

        // Pequena transição suave para o usuário ver a barra completar em 100%
        await new Promise((r) => setTimeout(r, 180));
        setLayoutReady(true);
      } catch (err) {
        console.warn('[escritorio] Erro no boot de assets:', err);
        setLayoutReady(true);
      }
    }

    boot();
  }, [getOfficeState, onLayoutLoaded, reloadLayout]);

  return {
    layoutReady,
    loadingProgress,
    loadingStep,
    loadedAssets,
    reloadLayout,
  };
}
