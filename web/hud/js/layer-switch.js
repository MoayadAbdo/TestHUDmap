/** Which map layer is painted on the 3D Mars ground (L key, gamepad X, demo panel, Ground Control). */
export function createLayerSwitch({ sim, notify = () => {} }) {
  const list = () => sim?.layerList?.() ?? [];
  let current = null;

  async function set(id) {
    const layer = await sim?.setLayer?.(id);
    if (!layer) return null;
    current = layer.id === 'photo' ? null : layer;
    notify(layer.id === 'photo' ? 'Layer: photo (normal view)' : `Layer: ${layer.name} (${layer.instrument}, ${layer.resolution_m} m)`);
    return layer;
  }

  return {
    /** Next layer in the cycle (photo → slope → minerals → heat → photo). */
    next() {
      const layers = list();
      if (!layers.length) return Promise.resolve(null);
      const i = layers.findIndex((l) => l.id === (current?.id ?? 'photo'));
      return set(layers[(i + 1) % layers.length].id);
    },
    set,
    /** The layer shown now (null = photo), for the visor's key. */
    get current() {
      return current;
    },
    get available() {
      return list().length > 1;
    },
  };
}
