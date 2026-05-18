import { useEffect, useState } from 'react';

interface DashboardScaleOptions {
  width: number;
  height: number;
}

interface DashboardScaleState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

function getScaleState({ width, height }: DashboardScaleOptions): DashboardScaleState {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scale = Math.min(viewportWidth / width, viewportHeight / height);

  return {
    scale,
    offsetX: (viewportWidth - width * scale) / 2,
    offsetY: (viewportHeight - height * scale) / 2,
  };
}

export function useDashboardScale(options: DashboardScaleOptions): DashboardScaleState {
  const [scaleState, setScaleState] = useState<DashboardScaleState>(() => getScaleState(options));

  useEffect(() => {
    const updateScale = () => setScaleState(getScaleState(options));

    updateScale();
    window.addEventListener('resize', updateScale);

    return () => window.removeEventListener('resize', updateScale);
  }, [options.width, options.height]);

  return scaleState;
}
