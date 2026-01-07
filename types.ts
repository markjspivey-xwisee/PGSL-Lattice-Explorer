
export type URI = string; // HTTP Hyperlink or DID
export type DID = string; // Decentralized Identifier
export type Value = string | number;

// Namespaces
export const NS = {
  PGSL: "http://schema.pgsl.org/core#",
  PROV: "http://www.w3.org/ns/prov#",
  RDF: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  OWL: "http://www.w3.org/2002/07/owl#",
  HYDRA: "http://www.w3.org/ns/hydra/core#",
  SCHEMA: "http://schema.org/",
};

export enum NodeType {
  ATOM = 'pgsl:Atom',
  FRAGMENT = 'pgsl:Fragment',
}

// JSON-LD Context Base
export const JSONLD_CONTEXT = {
  "pgsl": NS.PGSL,
  "prov": NS.PROV,
  "rdf": NS.RDF,
  "owl": NS.OWL,
  "hydra": NS.HYDRA,
  "schema": NS.SCHEMA,
  "id": "@id",
  "type": "@type",
  "value": "rdf:value",
  "constituents": { "@id": "pgsl:constituents", "@type": "@id" },
  "content": { "@id": "pgsl:content", "@type": "@id" },
  "height": { "@id": "pgsl:height", "@type": "xsd:integer" },
  "level": { "@id": "pgsl:level", "@type": "xsd:integer" },
  "wasAttributedTo": { "@id": "prov:wasAttributedTo", "@type": "@id" },
  "generatedAtTime": { "@id": "prov:generatedAtTime", "@type": "xsd:dateTime" }
};

export interface JSONLDResource {
  "@context"?: any;
  "@id": URI;
  "@type": string[]; // e.g. ["pgsl:Atom", "prov:Entity", "hydra:Resource"]
}

export interface ProvenanceEntity {
  "prov:wasAttributedTo": DID; // The Agent (User)
  "prov:generatedAtTime": string; // ISO Timestamp
  "hydra:apiDocumentation"?: URI; // Link to API definition
}

export interface AtomNode extends JSONLDResource, ProvenanceEntity {
  "@type": [NodeType.ATOM, "prov:Entity"];
  "rdf:value": Value;
  "pgsl:level": 0;
  "pgsl:height": 0; 
}

export interface FragmentNode extends JSONLDResource, ProvenanceEntity {
  "@type": [NodeType.FRAGMENT, "prov:Entity"];
  "pgsl:level": number; 
  "pgsl:height": number; 
  "pgsl:content": URI[]; // Ordered list of URIs
  "pgsl:constituents": [URI, URI] | null; // Semantic link to parents
}

export type Node = AtomNode | FragmentNode;

export interface PGSLState {
  atomRegistry: Record<string, URI>; // Map Value -> URI
  fragmentRegistry: Record<string, URI>; // Map JSON(ContentURIs[]) -> URI
  nodeRepository: Record<URI, Node>; // Map URI -> NodeObject
}
