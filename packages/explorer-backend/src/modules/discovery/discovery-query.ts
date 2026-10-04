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
): string {
  const triple =
    step.direction === 'out'
      ? `${from} ${iri(step.predicate)} ${to} .`
      : `${to} ${iri(step.predicate)} ${from} .`;
  if (step.kind === 'literal' && step.direction === 'in') {
    throw new BadRequestException('Literals cannot be subjects');
  }
  return `${triple}\n${step.targetClass ? `${to} a ${iri(step.targetClass)} .` : ''}
    FILTER(${step.kind === 'literal' ? 'isLiteral' : '!isLiteral'}(${to}))
    ${step.datatype ? `FILTER(datatype(${to}) = ${iri(step.datatype)})` : ''}`;
}

/** The context stays in its own subquery; reserved names cannot capture user variables. */
export function focusPattern(focus: DiscoveryFocus): {
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
  if (focus.classUri) pattern = `?__d_root a ${iri(focus.classUri)} .`;
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
    pattern += `\n${stepPattern(step, current, next)}`;
    current = next;
  }
  return { pattern, current };
}
export function focusSample(focus: DiscoveryFocus, limit: number): string {
  const { pattern, current } = focusPattern(focus);
  return `{ SELECT DISTINCT (${current} AS ?__d_focus) WHERE { ${pattern} } LIMIT ${limit} }`;
}

export function catalogQuery(
  kind: DiscoveryKind,
  q: string,
  limit: number,
): string {
  const observed =
    kind === 'class'
      ? '?s a ?uri'
      : kind === 'property'
        ? '?s ?uri ?o'
        : '?uri ?p ?o';
  const declared =
    kind === 'class'
      ? `?uri a ?declaration . VALUES ?declaration { <${RDFS}Class> <http://www.w3.org/2002/07/owl#Class> }`
      : '?uri a ?declaration . VALUES ?declaration { <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> <http://www.w3.org/2002/07/owl#ObjectProperty> <http://www.w3.org/2002/07/owl#DatatypeProperty> }';
  const branches =
    kind === 'resource'
      ? `${observed} . BIND("observed" AS ?evidence)`
      : `{ ${observed} . BIND("observed" AS ?evidence) } UNION { ${declared} BIND("declared" AS ?evidence) }`;
  return `SELECT DISTINCT ?uri ?label ?evidence WHERE {
    { SELECT DISTINCT ?uri ?evidence WHERE { ${branches} FILTER(isIRI(?uri)) } }
    OPTIONAL { ?uri <${RDFS}label> ?label . FILTER(lang(?label) IN ("", "es", "en")) }
    FILTER(CONTAINS(LCASE(STR(?uri)), LCASE(${literal(q)})) || CONTAINS(LCASE(STR(?label)), LCASE(${literal(q)})))
  } ORDER BY DESC(LCASE(REPLACE(STR(?uri), "^.*[/#:]", "")) = LCASE(${literal(q)})) ?uri ?label ?evidence LIMIT ${limit}`;
}

export function connectionsQuery(
  focus: DiscoveryFocus,
  direction: 'out' | 'in',
  sample: number,
  limit: number,
): string {
  const edge =
    direction === 'out'
      ? '?__d_focus ?predicate ?neighbor'
      : '?neighbor ?predicate ?__d_focus';
  return `SELECT ?predicate ?targetClass ?kind ?datatype
    (COUNT(DISTINCT ?__d_focus) AS ?entities)
    (SAMPLE(STR(?neighbor)) AS ?example) (SAMPLE(?exampleKind) AS ?exampleKindValue)
    (SAMPLE(?language) AS ?languageValue)
    WHERE {
      ${focusSample(focus, sample)}
      ${edge} .
      BIND(IF(isLiteral(?neighbor), "literal", "resource") AS ?kind)
      BIND(IF(isLiteral(?neighbor), "literal", IF(isBlank(?neighbor), "bnode", "uri")) AS ?exampleKind)
      BIND(IF(isLiteral(?neighbor), DATATYPE(?neighbor), <urn:rdfgis:no-datatype>) AS ?datatype)
      BIND(IF(isLiteral(?neighbor), LANG(?neighbor), "") AS ?language)
      OPTIONAL { ?neighbor a ?targetClass . FILTER(isIRI(?targetClass)) }
    } GROUP BY ?predicate ?targetClass ?kind ?datatype ?exampleKind ?language
    ORDER BY DESC(?entities) ?predicate ?targetClass ?kind ?datatype ?exampleKind ?language LIMIT ${limit}`;
}
