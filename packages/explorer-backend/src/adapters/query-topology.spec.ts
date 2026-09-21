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
  it('uses the real predicate and direction instead of a wildcard', () => {
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
    // What the wildcard did: attach the agent to the property. It must not appear.
    expect(t.links).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subject: 'realEstate', object: 'agente' }),
      ]),
    );
  });

  it('preserves the geographic hierarchy instead of flattening it', () => {
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

  it('normalizes an inverse path by swapping subject and object', () => {
    const t = extractQueryTopology(`${PREFIXES}
      SELECT ?casa ?listing WHERE { ?casa ^sioc:about ?listing . }`);

    expect(t.links).toHaveLength(1);
    expect(t.links[0]).toMatchObject({
      subject: 'listing',
      object: 'casa',
      predicate: 'http://rdfs.org/sioc/ns#about',
    });
  });

  it('ignores patterns whose object is a constant', () => {
    const t = extractQueryTopology(`${PREFIXES}
      SELECT ?listing ?realEstate WHERE {
        ?listing a pronto:RealEstateListing ; sioc:about ?realEstate .
        ?realEstate a inm:House .
        ?listing rdfs:label "Casa en venta" .
      }`);

    // Only sioc:about survives: a class or literal is not a result node.
    expect(t.links).toHaveLength(1);
    expect(t.links[0]).toMatchObject({
      subject: 'listing',
      object: 'realEstate',
    });
  });

  it('does produce an edge when the class is a variable', () => {
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

  it('marks the predicate as variable when the query leaves it open', () => {
    const t = extractQueryTopology('SELECT * WHERE { ?s ?p ?o }');
    expect(t.links).toHaveLength(1);
    expect(t.links[0]).toMatchObject({
      subject: 's',
      object: 'o',
      predicateVar: 'p',
    });
    expect(t.projected).toBeNull();
  });

  it('detects intermediates and adds them to SELECT', () => {
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

  it('preserves LIMIT, ORDER BY, and FILTER clauses when rewriting', () => {
    // Critical invariant: the backend does NOT inject LIMIT (it only trims the response),
    // so if rewriting lost LIMIT, the query would run without a cap over the
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

  it('does not rewrite DISTINCT because that would change the row count', () => {
    const t = extractQueryTopology(`${PREFIXES}
      SELECT DISTINCT ?realEstate ?barrio WHERE {
        ?realEstate inm:hasFeature ?feature .
        ?feature inm:neighborhood ?barrio .
      }`);

    expect(t.intermediates).toEqual(['feature']);
    expect(t.rewritten).toBeUndefined();
  });

  it('does not rewrite queries with aggregates or GROUP BY', () => {
    const t = extractQueryTopology(`${PREFIXES}
      SELECT ?barrio (COUNT(?realEstate) AS ?n) WHERE {
        ?realEstate inm:hasFeature ?feature .
        ?feature inm:neighborhood ?barrio .
      }
      GROUP BY ?barrio`);

    expect(t.rewritten).toBeUndefined();
  });

  it('returns empty topology when the query cannot be parsed', () => {
    const t = extractQueryTopology('SELECT ?x WHERE { esto no es sparql');
    expect(t.links).toEqual([]);
    expect(t.intermediates).toEqual([]);
  });

  it('returns empty topology for ASK', () => {
    const t = extractQueryTopology('ASK WHERE { ?s ?p ?o }');
    expect(t.links).toEqual([]);
  });

  describe('classAssertions', () => {
    const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

    it('captures a simple class assertion', () => {
      const t = extractQueryTopology(`${PREFIXES}
        SELECT ?listing ?realEstate WHERE {
          ?listing a pronto:RealEstateListing ; sioc:about ?realEstate .
        }`);

      expect(t.classAssertions.get('listing')).toEqual([
        'https://raw.githubusercontent.com/fdioguardi/pronto/main/ontology/pronto.owl#RealEstateListing',
      ]);
      // The class pattern produces an assertion, not a link.
      expect(t.links).toHaveLength(1);
    });

    it('also captures it when rdf:type is written as an IRI', () => {
      const t = extractQueryTopology(
        `SELECT ?x WHERE { ?x <${RDF_TYPE}> <http://example.org/House> }`,
      );
      expect(t.classAssertions.get('x')).toEqual(['http://example.org/House']);
    });

    it('groups multiple classes for the same variable in order', () => {
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

    it('deduplicates the same class asserted twice', () => {
      const t = extractQueryTopology(`${PREFIXES}
        SELECT ?realEstate WHERE {
          ?realEstate a inm:House .
          ?realEstate a inm:House .
        }`);

      expect(t.classAssertions.get('realEstate')).toHaveLength(1);
    });

    it('?x a ?typeVariable is NOT an assertion and remains a link', () => {
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

    it('is empty for queries without classes', () => {
      const t = extractQueryTopology(`${PREFIXES}
        SELECT ?listing ?realEstate WHERE { ?listing sioc:about ?realEstate . }`);
      expect(t.classAssertions.size).toBe(0);
    });
  });
});
