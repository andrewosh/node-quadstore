
import * as _ from '../utils/lodash.js';
import { Term, DataFactory, Literal, Quad, Quad_Graph, Quad_Object, Quad_Predicate, Quad_Subject } from 'rdf-js';
import {
  TSBinding,
  TSPattern,
  TSQuad,
  TSRange, TSRdfBinding, TSRdfPattern,
  TSRdfQuad,
  TSRdfRange,
  TSRdfSearchStage, TSRdfSimplePattern, TSSearchStage, TSSearchStageType, TSSimplePattern
} from '../types/index.js';
import * as fpstring from './fpstring.js';

const xsd = 'http://www.w3.org/2001/XMLSchema#';
const xsdString  = xsd + 'string';
const xsdInteger = xsd + 'integer';
const xsdDouble = xsd + 'double';
const xsdDateTime = xsd + 'dateTime';
const xsdBoolean = xsd + 'boolean';
const RdfLangString = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString';

export const exportLiteralTerm = (term: string, dataFactory: DataFactory): Literal => {
  const [, encoding, datatype, value, language] = term.split('^');
  switch (datatype) {
    case xsdString:
      if (language !== '') {
        return dataFactory.literal(value, language);
      }
      return dataFactory.literal(value);
    default:
      return dataFactory.literal(value, dataFactory.namedNode(datatype));
  }
}

export const importLiteralTerm = (term: Literal, rangeBoundary = false): string => {
  if (term.language) {
    return `^^${xsdString}^${term.value}^${term.language}`;
  }
  if (!term.datatype || term.datatype.value === xsdString) {
    return `^^${term.datatype.value}^${term.value}^`;
  }
  switch (term.datatype.value) {
    case xsdInteger:
    case xsdDouble:
      if (rangeBoundary) {
        return `^number:${fpstring.encode(term.value.slice(1, -1))}`;
      }
      return `^number:${fpstring.encode(term.value.slice(1, -1))}^${term.datatype.value}^${term.value}^`;
    case xsdDateTime:
      const timestamp = new Date(term.value.slice(1, -1)).valueOf();
      if (rangeBoundary) {
        return `^datetime:${fpstring.encode(timestamp)}`;
      }
      return `^datetime:${fpstring.encode(timestamp)}^${term.datatype.value}^${term.value}^`;
    default:
      return `^^${term.datatype.value}^${term.value}^`;
  }
}

export const exportTerm = (term: string, isGraph: boolean, defaultGraphValue: string, dataFactory: DataFactory): Term => {
  if (!term) {
    throw new Error(`Nil term "${term}". Cannot export.`);
  }
  if (term === defaultGraphValue) {
    return dataFactory.defaultGraph();
  }
  switch (term[0]) {
    case '_':
      return dataFactory.blankNode(term.substr(2));
    case '?':
      if (dataFactory.variable) {
        return dataFactory.variable(term.substr(1));
      }
      throw new Error('DataFactory does not support variables');
    case '^':
      if (isGraph) {
        throw new Error(`Invalid graph term "${term}" (graph cannot be a literal).`);
      }
      return exportLiteralTerm(term, dataFactory);
    default:
      return dataFactory.namedNode(term);
  }
}

export const importSimpleTerm = (term: Term, isGraph: boolean, defaultGraphValue: string): string => {
  if (!term) {
    if (isGraph) {
      return defaultGraphValue;
    }
    throw new Error(`Nil non-graph term, cannot import.`);
  }
  switch (term.termType) {
    case 'NamedNode':
      return term.value;
    case 'BlankNode':
      return '_:' + term.value;
    case 'Variable':
      return '?' + term.value;
    case 'DefaultGraph':
      return defaultGraphValue;
    case 'Literal':
      return importLiteralTerm(term, false);
    default:
      // @ts-ignore
      throw new Error(`Unexpected termType: "${term.termType}".`);
  }
}

export const importRange = (range: TSRdfRange, rangeBoundary: boolean = false): TSRange => {
  const importedRange: TSRange = {};
  if (range.lt) importedRange.lt = importLiteralTerm(range.lt, rangeBoundary);
  if (range.lte) importedRange.lte = importLiteralTerm(range.lte, rangeBoundary);
  if (range.gt) importedRange.gt = importLiteralTerm(range.gt, rangeBoundary);
  if (range.gte) importedRange.gte = importLiteralTerm(range.gte, rangeBoundary);
  return importedRange;
}

export const importTerm = (term: Term|TSRdfRange, isGraph: boolean, defaultGraphValue: string, rangeBoundary: boolean = false): string|TSRange => {
  if ('gt' in term  || 'gte' in term || 'lt' in term || 'lte' in term) {
    return importRange(term, rangeBoundary);
  } else if ('termType' in term) {
    switch (term.termType) {
      case 'NamedNode':
        return term.value;
      case 'BlankNode':
        return '_:' + term.value;
      case 'Variable':
        return '?' + term.value;
      case 'DefaultGraph':
        return defaultGraphValue;
      case 'Literal':
        return importLiteralTerm(term, rangeBoundary);
      default:
        // @ts-ignore
        throw new Error(`Unexpected termType: "${term.termType}".`);
    }
  } else {
    throw new Error(`Unexpected type of "term" argument.`);
  }
}

export const importQuad = (quad: TSRdfQuad, defaultGraphValue: string): TSQuad => {
  return {
    subject: importSimpleTerm(quad.subject, false, defaultGraphValue),
    predicate: importSimpleTerm(quad.predicate, false, defaultGraphValue),
    object: importSimpleTerm(quad.object, false, defaultGraphValue),
    graph: importSimpleTerm(quad.graph, true, defaultGraphValue),
  };
}

const exportQuadSubject = (term: string, dataFactory: DataFactory): Quad_Subject => {
  switch (term[0]) {
    case '_':
      return dataFactory.blankNode(term.substr(2));
    case '?':
      if (dataFactory.variable) {
        return dataFactory.variable(term.substr(1));
      }
      throw new Error('DataFactory does not support variables');
    case '^':
      throw new Error('No literals as subject');
    default:
      return dataFactory.namedNode(term);
  }
}

const exportQuadPredicate = (term: string, dataFactory: DataFactory): Quad_Predicate => {
  switch (term[0]) {
    case '_':
      throw new Error('No blank nodes as predicates');
    case '?':
      if (dataFactory.variable) {
        return dataFactory.variable(term.substr(1));
      }
      throw new Error('DataFactory does not support variables');
    case '^':
      throw new Error('No literals as predicates');
    default:
      return dataFactory.namedNode(term);
  }
}

const exportQuadObject = (term: string, dataFactory: DataFactory): Quad_Object => {
  switch (term[0]) {
    case '_':
      return dataFactory.blankNode(term.substr(2));
    case '?':
      if (dataFactory.variable) {
        return dataFactory.variable(term.substr(1));
      }
      throw new Error('DataFactory does not support variables');
    case '^':
      return exportLiteralTerm(term, dataFactory);
    default:
      return dataFactory.namedNode(term);
  }
}

const exportQuadGraph = (term: string, defaultGraphValue: string, dataFactory: DataFactory): Quad_Graph => {
  if (term === defaultGraphValue) {
    return dataFactory.defaultGraph();
  }
  switch (term[0]) {
    case '_':
      return dataFactory.blankNode(term.substr(2));
    case '?':
      if (dataFactory.variable) {
        return dataFactory.variable(term.substr(1));
      }
      throw new Error('DataFactory does not support variables');
    case '^':
      throw new Error('No literals as graphs');
    default:
      return dataFactory.namedNode(term);
  }
}

export const exportQuad = (quad: TSQuad, defaultGraphValue: string, dataFactory: DataFactory): TSRdfQuad => {
  return dataFactory.quad(
    exportQuadSubject(quad.subject, dataFactory),
    exportQuadPredicate(quad.predicate, dataFactory),
    exportQuadObject(quad.object, dataFactory),
    exportQuadGraph(quad.graph, defaultGraphValue, dataFactory)
  );
};

export const exportBinding = (binding: TSBinding, defaultGraphValue: string, dataFactory: DataFactory): TSRdfBinding => {
  return _.mapValues(binding, (term: string) => exportTerm(term, false, defaultGraphValue, dataFactory));
};

export const importPattern = (terms: TSRdfPattern, defaultGraph: string): TSPattern => {
  const importedTerms: TSPattern = {};
  if (terms.subject) {
    importedTerms.subject = importSimpleTerm(terms.subject, false, defaultGraph);
  }
  if (terms.predicate) {
    importedTerms.predicate = importSimpleTerm(terms.predicate, false, defaultGraph);
  }
  if (terms.object) {
    importedTerms.object = importTerm(terms.object, false, defaultGraph, true);
  }
  if (terms.graph) {
    importedTerms.graph = importSimpleTerm(terms.graph, true, defaultGraph);
  }
  return importedTerms;
};

export const importSimplePattern = (terms: TSRdfSimplePattern, defaultGraph: string): TSSimplePattern => {
  const importedPattern: TSSimplePattern = {};
  if (terms.subject) {
    importedPattern.subject = importSimpleTerm(terms.subject, false, defaultGraph);
  }
  if (terms.predicate) {
    importedPattern.predicate = importSimpleTerm(terms.predicate, false, defaultGraph);
  }
  if (terms.object) {
    importedPattern.object = importSimpleTerm(terms.object, false, defaultGraph);
  }
  if (terms.graph) {
    importedPattern.graph = importSimpleTerm(terms.graph, true, defaultGraph);
  }
  return importedPattern;
};

export const importSearchStage = (stage: TSRdfSearchStage, defaultGraph: string): TSSearchStage => {
  switch (stage.type) {
    case TSSearchStageType.BGP:
      return { ...stage, pattern: importSimplePattern(stage.pattern, defaultGraph) };
    case TSSearchStageType.LT:
    case TSSearchStageType.LTE:
    case TSSearchStageType.GT:
    case TSSearchStageType.GTE:
      return {
        type: stage.type,
        args: stage.args.map(arg => importSimpleTerm(arg, false, defaultGraph)),
      };
  }
}