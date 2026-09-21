import { extractQueryTopology } from './query-topology';

const PREFIXES = `
PREFIX inm:    <http://www.semanticweb.org/luciana/ontologies/2024/8/inmontology#>
PREFIX pronto: <https://raw.githubusercontent.com/fdioguardi/pronto/main/ontology/pronto.owl#>
PREFIX rec:    <https://w3id.org/rec#>
PREFIX sioc:   <http://rdfs.org/sioc/ns#>
PREFIX foaf:   <http://xmlns.com/foaf/0.1/>
PREFIX rdfs:   <http://www.w3.org/2000/01/rdf-schema#>
`;

describe('extractQueryTopology', () => {
  it('usa el predicado real y la dirección real, no una estrella', () => {
    const t = extractQueryTopology(`${PREFIXES}
      SELECT ?realEstate ?listing ?agente WHERE {
        ?listing sioc:about ?realEstate .
        ?listing foaf:maker ?agente .
      }`);

    expect(t.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subject: 'listing',
          object: 'realEstate',
          predicate: 'http://rdfs.org/sioc/ns#about',
          predicateLabel: 'about',
        }),
        expect.objectContaining({
          subject: 'listing',
          object: 'agente',
          predicateLabel: 'maker',
        }),
      ]),
    );
    // Lo que hacía la estrella: colgar el agente del inmueble. No debe aparecer.
    expect(t.links).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subject: 'realEstate', object: 'agente' }),
      ]),
    );
  });

  it('conserva la jerarquía geográfica en lugar de aplanarla', () => {
    const t = extractQueryTopology(`${PREFIXES}
      SELECT ?realEstate ?barrio ?distrito WHERE {
        ?realEstate inm:hasFeature/inm:hasValue ?dir .
        ?dir inm:neighborhood ?barrio .
        ?barrio rec:locatedIn ?distrito .
      }`);

    expect(t.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subject: 'barrio',
          object: 'distrito',
          predicateLabel: 'locatedIn',
        }),
        expect.objectContaining({
          subject: 'dir',
          object: 'barrio',
          predicateLabel: 'neighborhood',
        }),
        expect.objectContaining({
          subject: 'realEstate',
          object: 'dir',
          predicateLabel: 'hasFeature/hasValue',
        }),
      ]),
    );
    expect(t.links).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subject: 'realEstate', object: 'distrito' }),
      ]),
    );
  });

  it('normaliza un path inverso dando vuelta sujeto y objeto', () => {
    const t = extractQueryTopology(`${PREFIXES}
      SELECT ?casa ?listing WHERE { ?casa ^sioc:about ?listing . }`);

    expect(t.links).toHaveLength(1);
    expect(t.links[0]).toMatchObject({
      subject: 'listing',
      object: 'casa',
      predicate: 'http://rdfs.org/sioc/ns#about',
    });
  });

  it('ignora los patrones cuyo objeto es una constante', () => {
    const t = extractQueryTopology(`${PREFIXES}
      SELECT ?listing ?realEstate WHERE {
        ?listing a pronto:RealEstateListing ; sioc:about ?realEstate .
        ?realEstate a inm:House .
        ?listing rdfs:label "Casa en venta" .
      }`);

    // Sólo sobrevive sioc:about: una clase o un literal no son nodos del resultado.
    expect(t.links).toHaveLength(1);
    expect(t.links[0]).toMatchObject({
      subject: 'listing',
      object: 'realEstate',
    });
  });

  it('sí produce arista cuando la clase es una variable', () => {
    const t = extractQueryTopology(`${PREFIXES}
      SELECT ?realEstate ?tipo WHERE {
        VALUES ?tipo { inm:House inm:Apartment }
        ?realEstate a ?tipo .
      }`);

    expect(t.links).toHaveLength(1);
    expect(t.links[0]).toMatchObject({
      subject: 'realEstate',
      object: 'tipo',
      predicateLabel: 'type',
    });
  });

  it('marca el predicado como variable cuando la consulta lo deja abierto', () => {
    const t = extractQueryTopology('SELECT * WHERE { ?s ?p ?o }');
    expect(t.links).toHaveLength(1);
    expect(t.links[0]).toMatchObject({
      subject: 's',
      object: 'o',
      predicateVar: 'p',
    });
    expect(t.projected).toBeNull();
  });

  it('detecta los intermedios y los agrega al SELECT', () => {
    const t = extractQueryTopology(`${PREFIXES}
      SELECT ?realEstate ?barrio WHERE {
        ?realEstate inm:hasFeature ?feature .
        ?feature inm:hasValue ?dir .
        ?dir inm:neighborhood ?barrio .
      }`);

    expect(t.projected).toEqual(['realEstate', 'barrio']);
    expect(t.intermediates.sort()).toEqual(['dir', 'feature']);
    expect(t.rewritten).toBeDefined();
    expect(t.rewritten).toMatch(/\?feature/);
    expect(t.rewritten).toMatch(/\?dir/);
  });

  it('la reescritura conserva LIMIT, ORDER BY y los FILTER', () => {
    // Invariante crítico: el backend NO inyecta LIMIT (sólo recorta la respuesta), así
    // que si la reescritura perdiera el LIMIT la consulta correría sin tope sobre las
    // ~81M de tripletas del OVS.
    const t = extractQueryTopology(`${PREFIXES}
      SELECT ?realEstate ?barrio WHERE {
        ?realEstate inm:hasFeature ?feature .
        ?feature inm:neighborhood ?barrio .
        ?barrio rdfs:label ?label .
        FILTER(CONTAINS(LCASE(STR(?label)), "dock sud"))
      }
      ORDER BY ?barrio
      LIMIT 250`);

    expect(t.rewritten).toBeDefined();
    expect(t.rewritten).toMatch(/LIMIT\s+250/i);
    expect(t.rewritten).toMatch(/ORDER BY/i);
    expect(t.rewritten).toMatch(/dock sud/);
  });

  it('no reescribe con DISTINCT, porque cambiaría la cantidad de filas', () => {
    const t = extractQueryTopology(`${PREFIXES}
      SELECT DISTINCT ?realEstate ?barrio WHERE {
        ?realEstate inm:hasFeature ?feature .
        ?feature inm:neighborhood ?barrio .
      }`);

    expect(t.intermediates).toEqual(['feature']);
    expect(t.rewritten).toBeUndefined();
  });

  it('no reescribe con agregados ni GROUP BY', () => {
    const t = extractQueryTopology(`${PREFIXES}
      SELECT ?barrio (COUNT(?realEstate) AS ?n) WHERE {
        ?realEstate inm:hasFeature ?feature .
        ?feature inm:neighborhood ?barrio .
      }
      GROUP BY ?barrio`);

    expect(t.rewritten).toBeUndefined();
  });

  it('devuelve topología vacía si la consulta no parsea', () => {
    const t = extractQueryTopology('SELECT ?x WHERE { esto no es sparql');
    expect(t.links).toEqual([]);
    expect(t.intermediates).toEqual([]);
  });

  it('devuelve topología vacía para un ASK', () => {
    const t = extractQueryTopology('ASK WHERE { ?s ?p ?o }');
    expect(t.links).toEqual([]);
  });

  describe('classAssertions', () => {
    const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

    it('captura una afirmación de clase simple', () => {
      const t = extractQueryTopology(`${PREFIXES}
        SELECT ?listing ?realEstate WHERE {
          ?listing a pronto:RealEstateListing ; sioc:about ?realEstate .
        }`);

      expect(t.classAssertions.get('listing')).toEqual([
        'https://raw.githubusercontent.com/fdioguardi/pronto/main/ontology/pronto.owl#RealEstateListing',
      ]);
      // El patrón de clase no genera link, sólo la afirmación.
      expect(t.links).toHaveLength(1);
    });

    it('también la captura con el predicado rdf:type escrito como IRI', () => {
      const t = extractQueryTopology(
        `SELECT ?x WHERE { ?x <${RDF_TYPE}> <http://example.org/House> }`,
      );
      expect(t.classAssertions.get('x')).toEqual(['http://example.org/House']);
    });

    it('agrupa varias clases para la misma variable (multi-tipo), en orden', () => {
      const t = extractQueryTopology(`${PREFIXES}
        SELECT ?realEstate WHERE {
          ?realEstate a inm:House .
          ?realEstate a inm:Apartment .
        }`);

      expect(t.classAssertions.get('realEstate')).toEqual([
        'http://www.semanticweb.org/luciana/ontologies/2024/8/inmontology#House',
        'http://www.semanticweb.org/luciana/ontologies/2024/8/inmontology#Apartment',
      ]);
    });

    it('deduplica la misma clase afirmada dos veces', () => {
      const t = extractQueryTopology(`${PREFIXES}
        SELECT ?realEstate WHERE {
          ?realEstate a inm:House .
          ?realEstate a inm:House .
        }`);

      expect(t.classAssertions.get('realEstate')).toHaveLength(1);
    });

    it('?x a ?tipoVariable NO es afirmación: sigue siendo un link', () => {
      const t = extractQueryTopology(`${PREFIXES}
        SELECT ?realEstate ?tipo WHERE {
          VALUES ?tipo { inm:House inm:Apartment }
          ?realEstate a ?tipo .
        }`);

      expect(t.classAssertions.size).toBe(0);
      expect(t.links).toHaveLength(1);
      expect(t.links[0]).toMatchObject({
        subject: 'realEstate',
        object: 'tipo',
        predicate: RDF_TYPE,
      });
    });

    it('viene vacío en consultas sin clases', () => {
      const t = extractQueryTopology(`${PREFIXES}
        SELECT ?listing ?realEstate WHERE { ?listing sioc:about ?realEstate . }`);
      expect(t.classAssertions.size).toBe(0);
    });
  });
});
