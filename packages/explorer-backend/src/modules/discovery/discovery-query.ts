import { BadRequestException } from '@nestjs/common';
import { Generator, Parser } from 'sparqljs';
import type {
  DiscoveryFocus,
  DiscoveryKind,
  DiscoveryStep,
} from '@rdfgis/contracts';
import { escapeSparqlLiteral, isValidUri } from '../../adapters/sparql-text';

export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
export const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
export function iri(value: string): string {
  if (
    !isValidUri(value) ||
    /[\\{}|^`]/u.test(value) ||
    [...value].some((char) => char.charCodeAt(0) <= 32)
  ) {
    throw new BadRequestException('Invalid discovery IRI');
  }
  return `<${value}>`;
}
export function literal(value: string): string {
  return `"${escapeSparqlLiteral(value).replace(/'/g, "\\'").replace(/\t/g, '\\t')}"`;
}
export function stepPattern(
  step: DiscoveryStep,
  from: string,
  to: string,
  classPredicate = RDF_TYPE,
): string {
  const triple =
    step.direction === 'out'
      ? `${from} ${iri(step.predicate)} ${to} .`
      : `${to} ${iri(step.predicate)} ${from} .`;
  if (step.kind === 'literal' && step.direction === 'in') {
    throw new BadRequestException('Literals cannot be subjects');
  }
  return `${triple}\n${step.targetClass ? `${to} ${iri(classPredicate)} ${iri(step.targetClass)} .` : ''}
    FILTER(${step.kind === 'literal' ? 'isLiteral' : '!isLiteral'}(${to}))
    ${step.datatype ? `FILTER(datatype(${to}) = ${iri(step.datatype)})` : ''}`;
}

/** The context stays in its own subquery; reserved names cannot capture user variables. */
export function focusPattern(
  focus: DiscoveryFocus,
  classPredicate = RDF_TYPE,
): {
  pattern: string;
  current: string;
} {
  if (
    [focus.classUri, focus.propertyUri, focus.uri, focus.query].filter(Boolean)
      .length !== 1
  ) {
    throw new BadRequestException('Supply exactly one discovery focus');
  }
  let pattern: string;
  if (focus.classUri)
    pattern = `?__d_root ${iri(classPredicate)} ${iri(focus.classUri)} .`;
  else if (focus.propertyUri)
    pattern = `?__d_root ${iri(focus.propertyUri)} ?__d_object .`;
  else if (focus.uri) pattern = `VALUES ?__d_root { ${iri(focus.uri)} }`;
  else {
    if (
      !focus.variable ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(focus.variable) ||
      focus.variable.startsWith('__d_')
    ) {
      throw new BadRequestException('Invalid discovery variable');
    }
    try {
      const ast = new Parser().parse(focus.query!);
      if (ast.type !== 'query' || ast.queryType !== 'SELECT' || ast.from)
        throw new Error('SELECT required');
      const serialized = JSON.stringify(ast);
      if (/"termType":"Variable","value":"__d_/.test(serialized))
        throw new Error('Reserved variable');
      const projected = ast.variables.some((v) =>
        'termType' in v
          ? v.termType === 'Wildcard' || v.value === focus.variable
          : 'variable' in v && v.variable.value === focus.variable,
      );
      if (!projected) throw new Error('Focus must be projected');
      // Expanding prefixes to full IRIs avoids invalid PREFIX declarations in subqueries.
      const inner = new Generator().stringify({
        ...ast,
        prefixes: {},
        base: undefined,
      });
      pattern = `{ ${inner} } BIND(?${focus.variable} AS ?__d_root) FILTER(BOUND(?__d_root))`;
    } catch {
      throw new BadRequestException(
        'Invalid discovery SELECT context or variable',
      );
    }
  }
  let current = '?__d_root';
  for (const [i, step] of (focus.steps ?? []).entries()) {
    if (i > 0 && focus.steps![i - 1].kind === 'literal')
      throw new BadRequestException('Cannot traverse a literal');
    const next = `?__d_step${i}`;
    pattern += `\n${stepPattern(step, current, next, classPredicate)}`;
    current = next;
  }
  return { pattern, current };
}
export function focusSampleQuery(
  focus: DiscoveryFocus,
  limit: number,
  classPredicate = RDF_TYPE,
): string {
  const { pattern, current } = focusPattern(focus, classPredicate);
  return `SELECT DISTINCT (${current} AS ?__d_focus) WHERE { ${pattern} } LIMIT ${limit}`;
}

export function focusSample(
  focus: DiscoveryFocus,
  limit: number,
  classPredicate = RDF_TYPE,
): string {
  return `{ ${focusSampleQuery(focus, limit, classPredicate)} }`;
}

/** Bound statement scans BEFORE DISTINCT, text matching or sorting. */
export function catalogQuery(
  kind: Exclude<DiscoveryKind, 'resource'>,
  q: string,
  limit: number,
  offset = 0,
  sample = 1000,
  classPredicate = RDF_TYPE,
  subclassPredicate?: string,
): string {
  const observed =
    kind === 'class' ? `?s ${iri(classPredicate)} ?uri` : '?s ?uri ?o';
  const declaration =
    kind === 'class'
      ? `?uri a ?declaration . VALUES ?declaration { <${RDFS}Class> <http://www.w3.org/2002/07/owl#Class> }`
      : '?uri a ?declaration . VALUES ?declaration { <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> <http://www.w3.org/2002/07/owl#ObjectProperty> <http://www.w3.org/2002/07/owl#DatatypeProperty> }';
  const declared =
    kind === 'class' && subclassPredicate
      ? `{ ${declaration} } UNION { ?uri ${iri(subclassPredicate)} ?superClass . }`
      : declaration;
  const branches = `{ SELECT ?uri WHERE { ${observed} . } LIMIT ${sample} }
        UNION { SELECT ?uri WHERE { ${declared} } LIMIT ${sample} }`;
  const match = q
    ? `FILTER(CONTAINS(LCASE(STR(?uri)), ${literal(q.toLowerCase())}) || EXISTS {
        ?uri <${RDFS}label> ?searchLabel .
        FILTER(lang(?searchLabel) IN ("", "es", "en"))
        FILTER(CONTAINS(LCASE(STR(?searchLabel)), ${literal(q.toLowerCase())}))
      })`
    : '';
  const evidence = `CONCAT(IF(EXISTS { ${observed} }, "observed", ""),
        IF(EXISTS { ${declared} }, ",declared", ""))`;
  return `SELECT ?uri (MIN(STR(?candidateLabel)) AS ?label) ?evidence WHERE {
    { SELECT DISTINCT ?uri WHERE {
        { ${branches} } FILTER(isIRI(?uri)) ${match}
      } ORDER BY ?uri LIMIT ${limit} OFFSET ${offset} }
    OPTIONAL { ?uri <${RDFS}label> ?candidateLabel . FILTER(lang(?candidateLabel) IN ("", "es", "en")) }
    BIND(${evidence} AS ?evidence)
  } GROUP BY ?uri ?evidence ORDER BY ?uri LIMIT ${limit}`;
}

export function connectionsQuery(
  focus: DiscoveryFocus,
  direction: 'out' | 'in',
  sample: number,
  limit: number,
  vocabulary: {
    classPredicate?: string;
    predicateNamespace?: string;
    wikidataLabels?: boolean;
    sampleIris?: string[];
    requeryNonIris?: boolean;
    relationLimit?: number;
  } = {},
): string {
  const classPredicate = vocabulary.classPredicate ?? RDF_TYPE;
  const edge =
    direction === 'out'
      ? '?__d_focus ?predicate ?neighbor'
      : '?neighbor ?predicate ?__d_focus';
  const seeds = vocabulary.sampleIris
    ? [
        ...(vocabulary.sampleIris.length
          ? [
              `VALUES ?__d_focus { ${vocabulary.sampleIris.map(iri).join(' ')} }`,
            ]
          : []),
        ...(vocabulary.requeryNonIris
          ? [
              `${focusSample(focus, sample, classPredicate)} FILTER(!isIRI(?__d_focus))`,
            ]
          : []),
      ]
    : [];
  const anchor = vocabulary.sampleIris
    ? seeds.map((seed) => `{ ${seed} }`).join(' UNION ') || 'FILTER(false)'
    : focus.uri && !focus.steps?.length
      ? `BIND(${iri(focus.uri)} AS ?__d_focus)`
      : focusSample(focus, sample, classPredicate);
  const statementPattern =
    focus.uri && !focus.steps?.length && !vocabulary.sampleIris
      ? `${direction === 'out' ? `${iri(focus.uri)} ?predicate ?neighbor` : `?neighbor ?predicate ${iri(focus.uri)}`} . ${anchor}`
      : `{ ${anchor} } ${edge} .`;
  const namespace = vocabulary.predicateNamespace
    ? `FILTER(STRSTARTS(STR(?predicate), ${literal(vocabulary.predicateNamespace)}))`
    : '';
  // Bound raw relations BEFORE type enrichment and aggregate sorting. The
  // result intentionally reports incomplete coverage when this budget is used.
  const statements = vocabulary.relationLimit
    ? `{ SELECT ?__d_focus ?predicate ?neighbor WHERE { ${statementPattern} ${namespace} } LIMIT ${vocabulary.relationLimit} }`
    : `${statementPattern} ${namespace}`;
  const aggregate = `SELECT ?predicate ?targetClass ?kind ?datatype
    (COUNT(DISTINCT ?__d_focus) AS ?entities)
    (SAMPLE(STR(?neighbor)) AS ?example) (SAMPLE(?exampleKind) AS ?exampleKindValue)
    (SAMPLE(?language) AS ?languageValue)
    WHERE {
      ${statements}
      BIND(IF(isLiteral(?neighbor), "literal", "resource") AS ?kind)
      BIND(IF(isLiteral(?neighbor), "literal", IF(isBlank(?neighbor), "bnode", "uri")) AS ?exampleKind)
      BIND(IF(isLiteral(?neighbor), DATATYPE(?neighbor), <urn:rdfgis:no-datatype>) AS ?datatype)
      BIND(IF(isLiteral(?neighbor), LANG(?neighbor), "") AS ?language)
      OPTIONAL { ?neighbor ${iri(classPredicate)} ?targetClass . FILTER(isIRI(?targetClass)) }
    } GROUP BY ?predicate ?targetClass ?kind ?datatype ?exampleKind ?language
    ORDER BY DESC(?entities) ?predicate ?targetClass ?kind ?datatype ?exampleKind ?language LIMIT ${limit}`;
  if (!vocabulary.wikidataLabels) return aggregate;
  // Enrich only the bounded relation groups, not every statement in the sample.
  return `SELECT * WHERE {
    { ${aggregate} }
    BIND(IRI(REPLACE(STR(?predicate), "http://www.wikidata.org/prop/direct/", "http://www.wikidata.org/entity/")) AS ?propertyEntity)
    BIND(IF(?exampleKindValue = "uri", IRI(?example), ?__d_noExampleUri) AS ?exampleUri)
    SERVICE <http://wikiba.se/ontology#label> {
      <http://www.bigdata.com/rdf#serviceParam> <http://wikiba.se/ontology#language> "en" .
      ?propertyEntity <${RDFS}label> ?label .
      ?targetClass <${RDFS}label> ?targetLabel .
      ?exampleUri <${RDFS}label> ?exampleLabel .
    }
  } ORDER BY DESC(?entities) ?predicate ?targetClass LIMIT ${limit}`;
}
