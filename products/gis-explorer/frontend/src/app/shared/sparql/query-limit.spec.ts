import { describe, it, expect } from 'vitest';
import { buildQueryLimitNotice, detectTopLevelLimit } from './query-limit';

const BASE = 'SELECT * WHERE { ?s ?p ?o }';

describe('detectTopLevelLimit', () => {
  it('devuelve el LIMIT del nivel externo', () => {
    expect(detectTopLevelLimit(`${BASE} LIMIT 500`)).toBe(500);
  });

  it('devuelve null cuando la consulta no declara LIMIT', () => {
    expect(detectTopLevelLimit(BASE)).toBeNull();
  });

  it('ignora el LIMIT de una subconsulta: no acota lo que recibe el tablero', () => {
    const query = 'SELECT * WHERE { { SELECT * WHERE { ?s ?p ?o } LIMIT 10 } }';
    expect(detectTopLevelLimit(query)).toBeNull();
  });

  it('devuelve null mientras el texto no parsea', () => {
    expect(detectTopLevelLimit('SELECT * WHERE { ?s ?p')).toBeNull();
  });

  it('devuelve null con el editor vacío', () => {
    expect(detectTopLevelLimit('   ')).toBeNull();
  });
});

describe('buildQueryLimitNotice', () => {
  it('no avisa nada sin LIMIT propio', () => {
    expect(buildQueryLimitNotice(BASE, 1000)).toBeNull();
  });

  it('no avisa nada hasta que se conoce el tope del backend', () => {
    expect(buildQueryLimitNotice(`${BASE} LIMIT 500`, null)).toBeNull();
    expect(buildQueryLimitNotice(`${BASE} LIMIT 500`, 0)).toBeNull();
  });

  it('avisa que el resultado se va a tomar como completo cuando el LIMIT entra bajo el tope', () => {
    const notice = buildQueryLimitNotice(`${BASE} LIMIT 500`, 1000);
    expect(notice).not.toBeNull();
    expect(notice!.capped).toBe(false);
    expect(notice!.limit).toBe(500);
    expect(notice!.summary).toContain('resultado completo');
    expect(notice!.detail).toContain('no se marca');
  });

  it('avisa que el backend recorta igual cuando el LIMIT supera el tope', () => {
    const notice = buildQueryLimitNotice(`${BASE} LIMIT 5000`, 1000);
    expect(notice!.capped).toBe(true);
    expect(notice!.summary).toContain('recorta a 1000 filas');
  });

  it('trata el LIMIT igual al tope como recorte del backend: ahí sí queda truncado', () => {
    const notice = buildQueryLimitNotice(`${BASE} LIMIT 1000`, 1000);
    expect(notice!.capped).toBe(true);
  });
});
