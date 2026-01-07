
import { 
  URI, 
  DID,
  Value, 
  NodeType, 
  Node, 
  AtomNode, 
  FragmentNode,
  PGSLState,
  JSONLD_CONTEXT,
  NS
} from '../types';

// Internal UUID Generator (Removes dependency on external module to prevent import errors)
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * The PGSLEngine now acts as a Semantic Web Node Factory.
 * It mints HTTP URIs, attaches Provenance (PROV-O), and structures data as JSON-LD.
 */
export class PGSLEngine {
  private state: PGSLState;
  private listeners: (() => void)[] = [];

  // Federation Settings
  private authority: string = "http://localhost:3000";
  private agent: DID = "did:web:localhost:user:default";

  constructor() {
    this.state = {
      atomRegistry: {},
      fragmentRegistry: {},
      nodeRepository: {},
    };
  }

  // --- Configuration ---
  setFederationConfig(authority: string, agent: DID) {
    this.authority = authority.replace(/\/$/, ''); // Remove trailing slash
    this.agent = agent;
  }

  getFederationConfig() {
    return { authority: this.authority, agent: this.agent };
  }

  // --- React Subscription ---
  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  getAllNodes(): Node[] {
    return Object.values(this.state.nodeRepository);
  }

  getNode(uri: URI): Node | undefined {
    return this.state.nodeRepository[uri];
  }

  /**
   * Retrieves an existing fragment URI for the given content if it exists.
   * Useful for finding wrappers around Atoms.
   */
  getFragmentUri(content: URI[]): URI | undefined {
      const key = JSON.stringify(content);
      return this.state.fragmentRegistry[key];
  }

  reset() {
    this.state = {
      atomRegistry: {},
      fragmentRegistry: {},
      nodeRepository: {},
    };
    this.notify();
  }

  deleteNode(uri: URI) {
    // 1. Remove from Repository
    delete this.state.nodeRepository[uri];

    // 2. Clean up Registries (Reverse Lookup is expensive, but necessary for consistency)
    // Clean Atom Registry
    for (const [key, val] of Object.entries(this.state.atomRegistry)) {
      if (val === uri) delete this.state.atomRegistry[key];
    }
    // Clean Fragment Registry
    for (const [key, val] of Object.entries(this.state.fragmentRegistry)) {
      if (val === uri) delete this.state.fragmentRegistry[key];
    }
    
    // 3. Recursive cleanup? 
    // For now, we leave orphaned parents or children. 
    // A robust system might cascade delete or mark as broken.

    this.notify();
  }

  // --- Helper: URI Minting ---
  private mintURI(type: 'atoms' | 'fragments'): URI {
    return `${this.authority}/${type}/${generateUUID()}`;
  }

  // --- Level 0: Atoms ---

  getCanonicalAtom(value: Value): URI {
    const stringKey = String(value);
    
    // In a true federated system, we might query external resolvers.
    // Here, we check our local cache.
    if (this.state.atomRegistry[stringKey]) {
      return this.state.atomRegistry[stringKey];
    }

    const newUri = this.mintURI('atoms');
    const atomNode: AtomNode = {
      "@context": JSONLD_CONTEXT,
      "@id": newUri,
      "@type": [NodeType.ATOM, "prov:Entity"],
      "rdf:value": value,
      "pgsl:level": 0,
      "pgsl:height": 0, 
      "prov:wasAttributedTo": this.agent,
      "prov:generatedAtTime": new Date().toISOString()
    };

    this.state.nodeRepository[newUri] = atomNode;
    this.state.atomRegistry[stringKey] = newUri;
    
    this.notify(); // Notify listeners that a new atom exists

    return newUri;
  }

  // --- Level 1+: Fragments ---

  private getCanonicalFragment(content: URI[], constituents: [URI, URI] | null): URI {
    const registryKey = JSON.stringify(content);
    
    if (this.state.fragmentRegistry[registryKey]) {
      return this.state.fragmentRegistry[registryKey];
    }

    const newUri = this.mintURI('fragments');
    const level = content.length; 

    // Calculate Topological Height
    let height = 0;
    if (constituents) {
        const c1 = this.getNode(constituents[0]);
        const c2 = this.getNode(constituents[1]);
        // Handle external/missing nodes gracefully (assume height 0 if not found locally)
        const h1 = c1 ? c1["pgsl:height"] : 0;
        const h2 = c2 ? c2["pgsl:height"] : 0;
        height = Math.max(h1, h2) + 1;
    } else {
        const child = this.getNode(content[0]);
        height = (child ? child["pgsl:height"] : 0) + 1;
    }

    const fragmentNode: FragmentNode = {
      "@context": JSONLD_CONTEXT,
      "@id": newUri,
      "@type": [NodeType.FRAGMENT, "prov:Entity"],
      "pgsl:level": level,
      "pgsl:height": height,
      "pgsl:content": content,
      "pgsl:constituents": constituents,
      "prov:wasAttributedTo": this.agent,
      "prov:generatedAtTime": new Date().toISOString()
    };

    this.state.nodeRepository[newUri] = fragmentNode;
    this.state.fragmentRegistry[registryKey] = newUri;

    return newUri;
  }

  // --- Core Operation: Ingest Sequence ---

  ingestSequence(items: (Value | URI)[]): URI {
    if (items.length === 0) throw new Error("Sequence cannot be empty");

    // 1. Normalize Inputs to URIs
    // Checks if item is a valid URI (simple check: includes '://' or 'did:')
    // If not, treat as value -> get Atom URI
    const baseUris = items.map(item => {
        const strItem = String(item);
        const isURI = strItem.includes('://') || strItem.startsWith('did:');
        
        if (isURI) {
            // It's a reference to an existing resource (potentially on another host)
            return strItem;
        }
        return this.getCanonicalAtom(item);
    });

    // 2. Build Base Wrappers (Level 1 relative to this input sequence)
    const level1Fragments = baseUris.map(baseUri => {
      return this.getCanonicalFragment([baseUri], null);
    });

    if (level1Fragments.length === 1) {
        this.notify();
        return level1Fragments[0];
    }

    let topFragmentUri = level1Fragments[0];
    const N = baseUris.length;
    
    // 3. Iterative Hierarchy Construction
    for (let len = 2; len <= N; len++) {
      for (let i = 0; i <= N - len; i++) {
        const currentContent = baseUris.slice(i, i + len);
        
        const leftContent = baseUris.slice(i, i + len - 1);
        const rightContent = baseUris.slice(i + 1, i + len);
        
        const leftUri = this.state.fragmentRegistry[JSON.stringify(leftContent)];
        const rightUri = this.state.fragmentRegistry[JSON.stringify(rightContent)];

        if (!leftUri || !rightUri) {
            console.error("Integrity warning: Constituents missing. This might happen if cross-referencing external hosts without full resolution.", currentContent);
            continue;
        }

        const fragmentUri = this.getCanonicalFragment(currentContent, [leftUri, rightUri]);
        
        if (len === N) {
          topFragmentUri = fragmentUri;
        }
      }
    }

    this.notify();
    return topFragmentUri;
  }

  // --- Topology Queries ---

  /**
   * Finds a parent node that has the specified constituents.
   * Efficient O(N) lookup. Can be optimized with reverse index if needed.
   */
  findParentNode(leftUri: URI, rightUri: URI): URI | undefined {
      // Auto-promote Atoms to L1 Wrappers for structural search
      const safeLeft = this.promoteToStructural(leftUri);
      const safeRight = this.promoteToStructural(rightUri);

      const nodes = this.getAllNodes();
      for (const node of nodes) {
          if ((node["@type"] as string[]).includes(NodeType.FRAGMENT)) {
              const constituents = (node as any)["pgsl:constituents"];
              if (constituents && constituents[0] === safeLeft && constituents[1] === safeRight) {
                  return node["@id"];
              }
          }
      }
      return undefined;
  }

  /**
   * Helper: Promotes an Atom URI to its L1 Wrapper URI if applicable.
   * If it's already a fragment, returns it as is.
   */
  private promoteToStructural(uri: URI): URI {
      const node = this.getNode(uri);
      if (node && (node["@type"] as string[]).includes(NodeType.ATOM)) {
          const wrapper = this.getFragmentUri([uri]);
          return wrapper || uri;
      }
      return uri;
  }

  /**
   * Helper: Demotes an L1 Wrapper URI to its internal Atom URI if applicable.
   * If it's a complex fragment or atom, returns as is.
   */
  private demoteToAtom(uri: URI): URI {
      const node = this.getNode(uri);
      if (node 
          && (node["@type"] as string[]).includes(NodeType.FRAGMENT) 
          && (node as any)["pgsl:level"] === 1 
          && (node as any)["pgsl:content"]?.length === 1) {
          return (node as any)["pgsl:content"][0];
      }
      return uri;
  }

  /**
   * Returns a recursive human-readable string for any node URI.
   * e.g. "((mark is human) is fact)"
   */
  resolveContentString(uri: URI): string {
      const node = this.getNode(uri);
      if (!node) return "<?>";
      
      if ((node["@type"] as string[]).includes(NodeType.ATOM)) {
          return String((node as any)["rdf:value"]);
      }

      // If fragment, use pgsl:content for clean, flattened representation
      // This avoids the ((A B)(B C)) artifacting from binary constituents
      const content = (node as any)["pgsl:content"] || [];
      if (content.length === 0) return "()";

      // If it's a L1 wrapper (single content), just recurse
      if (content.length === 1) {
          return this.resolveContentString(content[0]);
      }

      // If it's a sequence, map and join
      const inner = content.map((c: string) => this.resolveContentString(c)).join(' ');
      return `(${inner})`;
  }

  /**
   * Finds all nodes that are neighbors of the given node in a specific direction.
   * Returns the neighbor URI and the ID of the parent pair that connects them.
   * 
   * SMART LOGIC: automatically handles the Atom <-> L1 Wrapper impedance mismatch.
   */
  findNeighbors(targetUri: URI, direction: 'left' | 'right'): { neighbor: URI, pair: URI }[] {
      const nodes = this.getAllNodes();
      const results: { neighbor: URI, pair: URI }[] = [];
      
      // If target is an Atom, we usually want to find neighbors of its L1 Wrapper
      // because Atoms themselves don't have 'constituents' in higher structures, L1 wrappers do.
      const effectiveTarget = this.promoteToStructural(targetUri);

      for (const node of nodes) {
          if ((node["@type"] as string[]).includes(NodeType.FRAGMENT)) {
              const constituents = (node as any)["pgsl:constituents"];
              if (constituents) {
                  let rawNeighbor: URI | null = null;

                  if (direction === 'left' && constituents[1] === effectiveTarget) {
                      rawNeighbor = constituents[0];
                  } else if (direction === 'right' && constituents[0] === effectiveTarget) {
                      rawNeighbor = constituents[1];
                  }

                  if (rawNeighbor) {
                      // Smart Unwrap: If the found neighbor is an L1 Wrapper around an Atom,
                      // return the Atom URI. This makes the UI cleaner.
                      const cleanNeighbor = this.demoteToAtom(rawNeighbor);
                      results.push({ neighbor: cleanNeighbor, pair: node["@id"] });
                  }
              }
          }
      }
      return results;
  }

  /**
   * DEBUG HELPER: Returns raw neighbor info without auto-unwrapping.
   */
  getDebugNeighbors(targetUri: URI): any[] {
      const nodes = this.getAllNodes();
      const results: any[] = [];
      const effectiveTarget = this.promoteToStructural(targetUri);
      
      for (const node of nodes) {
          if ((node["@type"] as string[]).includes(NodeType.FRAGMENT)) {
              const constituents = (node as any)["pgsl:constituents"];
              if (constituents) {
                  if (constituents[0] === effectiveTarget) {
                      results.push({ relation: 'Parent is (Target, Neighbor)', neighbor: constituents[1], parent: node["@id"] });
                  }
                  if (constituents[1] === effectiveTarget) {
                      results.push({ relation: 'Parent is (Neighbor, Target)', neighbor: constituents[0], parent: node["@id"] });
                  }
              }
          }
      }
      return results;
  }

  // --- SPARQL (Lite) Engine ---
  /**
   * Legacy method kept for simple queries, but core logic moved to specific methods above.
   */
  executeSPARQL(query: string): URI[] {
    const nodes = this.getAllNodes();
    const results: URI[] = [];
    const q = query.replace(/\s+/g, ' ');

    // Parent Match
    const parentMatch = q.match(/pgsl:constituents\s*\[\s*<([^>]+)>\s*,\s*<([^>]+)>\s*\]/);
    if (parentMatch) {
        const p = this.findParentNode(parentMatch[1], parentMatch[2]);
        if(p) results.push(p);
        return results;
    }

    // Left Match
    const leftMatch = q.match(/pgsl:constituents\s*\[\s*(\?left|\?s)\s*,\s*<([^>]+)>\s*\]/);
    if (leftMatch) {
        return this.findNeighbors(leftMatch[2], 'left').map(r => r.neighbor);
    }

    // Right Match
    const rightMatch = q.match(/pgsl:constituents\s*\[\s*<([^>]+)>\s*,\s*(\?right|\?o)\s*\]/);
    if (rightMatch) {
         return this.findNeighbors(rightMatch[1], 'right').map(r => r.neighbor);
    }

    return [];
  }
}

export const pgslEngine = new PGSLEngine();
