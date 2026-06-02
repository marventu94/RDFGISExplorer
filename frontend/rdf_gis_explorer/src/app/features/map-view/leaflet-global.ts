import * as L from 'leaflet';

// leaflet-draw y leaflet.markercluster usan L como variable global libre,
// no como módulo ESM. En native federation el L del bundle no coincide con
// window.L. Al setear window.L = L aquí (en un módulo que se evalúa ANTES
// que los plugins en el grafo de imports) los plugins augmentan la instancia
// correcta de L, la misma que usa el componente.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).L = L;
