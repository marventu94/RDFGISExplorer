import type { PropertyGraph } from '../graph';
import { Node } from '../node';

export function createCatsExample(graph: PropertyGraph, x: number, y: number): Node {
  const s = graph.addNode();
  const p = s.newProp();
  const o = graph.addNode();
  graph.addEdge(p, o);
  s.setPosition(x, y);
  o.setPosition(x + 280, y + 25);

  s.variable.setAlias('cat', graph);
  p.addUri('http://www.wikidata.org/prop/direct/P31'); p.mkConst();
  o.addUri('http://www.wikidata.org/entity/Q146'); o.mkConst();

  return s;
}

export function createW3cExample(graph: PropertyGraph, x: number, y: number): Node {
  const s = graph.addNode();
  const p = s.newProp();
  const o = graph.addNode();
  graph.addEdge(p, o);
  s.setPosition(x, y);
  o.setPosition(x + 280, y + 25);

  s.variable.setAlias('standard', graph);
  p.addUri('http://www.wikidata.org/prop/direct/P1462'); p.mkConst();
  o.addUri('http://www.wikidata.org/entity/Q37033'); o.mkConst();

  return s;
}

export function createMosquitoExample(graph: PropertyGraph, x: number, y: number): Node {
  const s = graph.addNode();
  const p = s.newProp();
  const o = graph.addNode();
  graph.addEdge(p, o);
  s.setPosition(x, y);
  o.setPosition(x + 280, y + 25);

  s.variable.setAlias('mosquito', graph);
  p.addUri('http://www.wikidata.org/prop/direct/P31'); p.mkConst();
  o.addUri('http://www.wikidata.org/entity/Q16521'); o.mkConst();
  const p2 = s.newProp(); p2.addUri('http://www.wikidata.org/prop/direct/P105'); p2.mkConst();
  const o2 = graph.addNode(); o2.addUri('http://www.wikidata.org/entity/Q7432'); o2.mkConst();
  const p3 = s.newProp(); p3.addUri('http://www.wikidata.org/prop/direct/P171'); p3.mkConst(); p3.star = true;
  const o3 = graph.addNode(); o3.addUri('http://www.wikidata.org/entity/Q7367'); o3.mkConst();
  const p4 = s.newProp(); p4.addUri('http://www.wikidata.org/prop/direct/P225'); p4.mkConst(); p4.mkLiteral();
  const lit = p4.getLiteral();
  if (lit) lit.setAlias('taxon_name', graph);
  graph.addEdge(p2, o2); o2.setPosition(x + 280, y + 65);
  graph.addEdge(p3, o3); o3.setPosition(x + 280, y + 105);

  return s;
}

export function createCancerExample(graph: PropertyGraph, x: number, y: number): Node {
  const s = graph.addNode();
  const p = s.newProp();
  const o = graph.addNode();
  graph.addEdge(p, o);
  s.setPosition(x, y);
  o.setPosition(x + 280, y + 25);

  s.variable.setAlias('drug', graph);
  o.variable.setAlias('gene_product', graph); o.hide = true;
  p.addUri('http://www.wikidata.org/prop/direct/P129'); p.mkConst();
  const s2 = graph.addNode(); s2.variable.setAlias('gene', graph);
  const p2 = s2.newProp(); p2.addUri('http://www.wikidata.org/prop/direct/P688'); p2.mkConst();
  const s3 = graph.addNode(); s3.variable.setAlias('disease', graph);
  const p3 = s3.newProp(); p3.addUri('http://www.wikidata.org/prop/direct/P279'); p3.mkConst(); p3.star = true;
  const p4 = s3.newProp(); p4.addUri('http://www.wikidata.org/prop/direct/P2293'); p4.mkConst();
  const o2 = graph.addNode(); o2.addUri('http://www.wikidata.org/entity/Q12078'); o2.mkConst();
  const p5 = o.newProp(); p5.addUri('http://www.wikidata.org/prop/direct/P682'); p5.mkConst();
  const o3 = graph.addNode(); o3.variable.setAlias('biological_process', graph);
  const p6 = o3.newProp();
  p6.addUri('http://www.wikidata.org/prop/direct/P361');
  p6.addUri('http://www.wikidata.org/prop/direct/P279'); p6.mkConst(); p6.star = true;
  const o4 = graph.addNode(); o4.addUri('http://www.wikidata.org/entity/Q14818032'); o4.mkConst();

  graph.addEdge(p2, o);
  graph.addEdge(p4, s2);
  graph.addEdge(p3, o2);
  graph.addEdge(p5, o3);
  graph.addEdge(p6, o4);
  o.setPosition(x, y);
  s3.setPosition(x, y - 110);
  o4.setPosition(x, y + 80);
  o2.setPosition(x + 280, y - 85);
  s2.setPosition(x + 280, y - 35);
  o3.setPosition(x + 280, y + 45);
  s.setPosition(x - 280, y - 25);

  return s;
}
