# Poly-Granular Sequence Lattice (PGSL) — Abstract Data Type Specification

## 1. Overview

The **Poly-Granular Sequence Lattice (PGSL)** is an abstract data type for constructing deterministic, canonical hierarchies of overlapping sub-structures from ordered sequences. Given a sequence of *N* items, PGSL produces a lattice of **O(N²)** nodes representing every contiguous subsequence, linked by binary constituent relationships that encode how each subsequence decomposes into overlapping pairs.

Every node in the lattice is a first-class **Semantic Web resource** — identified by an HTTP URI, typed with JSON-LD, and annotated with W3C PROV-O provenance.

---

## 2. Formal Definition

### 2.1 Primitive Types

| Type    | Definition                              |
|---------|-----------------------------------------|
| `URI`   | An HTTP hyperlink or DID string used as a globally unique node identifier. |
| `DID`   | A W3C Decentralized Identifier for agent attribution (e.g., `did:web:host:user:alice`). |
| `Value` | `string \| number` — an indivisible datum stored in a leaf node. |

### 2.2 Node Types

PGSL defines exactly two node kinds:

```
NodeType ::= ATOM | FRAGMENT
```

| Kind       | RDF Type          | Description |
|------------|-------------------|-------------|
| `ATOM`     | `pgsl:Atom`       | A leaf node wrapping a single `Value`. |
| `FRAGMENT` | `pgsl:Fragment`   | A composite node representing an ordered subsequence. |

---

## 3. Node Schemas

### 3.1 AtomNode

An **Atom** is the indivisible unit of the lattice. It wraps exactly one `Value` and occupies the base of the hierarchy.

| Property                 | Type                              | Constraint        |
|--------------------------|-----------------------------------|--------------------|
| `@id`                    | `URI`                             | Canonical, minted as `{authority}/atoms/{uuid}`. |
| `@type`                  | `[pgsl:Atom, prov:Entity]`        | Fixed tuple.       |
| `rdf:value`              | `Value`                           | The stored datum.  |
| `pgsl:level`             | `0`                               | **Invariant:** always `0`. |
| `pgsl:height`            | `0`                               | **Invariant:** always `0`. |
| `prov:wasAttributedTo`   | `DID`                             | Creating agent.    |
| `prov:generatedAtTime`   | `xsd:dateTime` (ISO 8601 string)  | Creation timestamp.|

### 3.2 FragmentNode

A **Fragment** represents a contiguous subsequence of one or more base URIs. It stores the ordered content list and an optional binary decomposition.

| Property                 | Type                              | Constraint |
|--------------------------|-----------------------------------|------------|
| `@id`                    | `URI`                             | Canonical, minted as `{authority}/fragments/{uuid}`. |
| `@type`                  | `[pgsl:Fragment, prov:Entity]`    | Fixed tuple. |
| `pgsl:level`             | `number`                          | Equal to `content.length`. |
| `pgsl:height`            | `number`                          | Topological depth (see §5.3). |
| `pgsl:content`           | `URI[]`                           | Ordered list of child URIs. |
| `pgsl:constituents`      | `[URI, URI] \| null`              | Binary pair `[left, right]` or `null` for L1 wrappers. |
| `prov:wasAttributedTo`   | `DID`                             | Creating agent. |
| `prov:generatedAtTime`   | `xsd:dateTime` (ISO 8601 string)  | Creation timestamp. |

### 3.3 L1 Wrappers

A **Level-1 Wrapper** is a special case of `FragmentNode` with:
- `pgsl:level = 1`
- `pgsl:content = [atomURI]` (single element)
- `pgsl:constituents = null`

Wrappers bridge the type boundary between Atoms (value layer) and Fragments (structural layer), allowing Atoms to participate in constituent relationships.

---

## 4. State Model

The engine maintains three maps that together form the complete lattice state:

```
PGSLState {
    atomRegistry:     Value      → URI      // Canonical atom deduplication
    fragmentRegistry: Content[]  → URI      // Canonical fragment deduplication (key is JSON-serialized URI list)
    nodeRepository:   URI        → Node     // Full node object store
}
```

### 4.1 Canonical Deduplication

**Atoms** are canonical per value: calling `getCanonicalAtom("x")` twice returns the same URI. The `atomRegistry` maps `String(value) → URI`.

**Fragments** are canonical per ordered content: two fragments with identical `pgsl:content` URI lists always resolve to the same URI. The `fragmentRegistry` maps `JSON.stringify(contentURIs) → URI`.

This guarantees that the lattice is a true **set** — no duplicate structures exist.

---

## 5. Operations

### 5.1 `getCanonicalAtom(value: Value) → URI`

Retrieves or creates the canonical Atom for a given value.

**Behavior:**
1. If `atomRegistry[String(value)]` exists → return existing URI.
2. Otherwise:
   - Mint URI: `{authority}/atoms/{uuid}`
   - Create `AtomNode` with `level=0`, `height=0`.
   - Store in `atomRegistry` and `nodeRepository`.
   - Return new URI.

### 5.2 `ingestSequence(items: (Value | URI)[]) → URI`

The **primary operation**. Builds the complete composition lattice for an input sequence and returns the URI of the root (top-level) fragment.

**Precondition:** `items.length ≥ 1`.

**Algorithm (three phases):**

#### Phase 1 — Normalize to URIs

Each input item is resolved to a URI:
- If the item looks like a URI (contains `://` or starts with `did:`): use as-is (external reference).
- Otherwise: call `getCanonicalAtom(item)` to mint/retrieve.

Result: `baseURIs[0..N-1]`.

#### Phase 2 — L1 Wrappers

Create a Level-1 wrapper fragment for each base URI:

```
For each baseURI[i]:
    getCanonicalFragment([baseURI[i]], constituents=null)
```

If `N = 1`, return the single L1 wrapper URI immediately.

#### Phase 3 — Iterative Hierarchy Construction

Build fragments for every contiguous subsequence of length 2 through N, bottom-up:

```
For len = 2 to N:
    For i = 0 to N - len:
        content   = baseURIs[i .. i+len]
        leftURI   = fragmentRegistry[ baseURIs[i .. i+len-1] ]
        rightURI  = fragmentRegistry[ baseURIs[i+1 .. i+len] ]
        getCanonicalFragment(content, [leftURI, rightURI])
```

The root fragment (length = N) is returned.

#### Example

For the input sequence `["A", "B", "C"]`:

```
Level 0 (Atoms):     A          B          C
                     │          │          │
Level 1 (Wrappers): [A]        [B]        [C]
                     │╲        ╱│╲        ╱│
Level 2:            [A,B]      [B,C]
                      ╲        ╱
Level 3 (Root):      [A,B,C]
```

**Nodes created:** 3 atoms + 3 wrappers + 2 pairs + 1 root = **9 nodes**.

Each Level-2+ fragment stores:
- `pgsl:content`: the flattened base URI sequence.
- `pgsl:constituents`: `[leftFragment, rightFragment]` where left and right overlap by all but one element.

#### Complexity

For a sequence of length N:
- Atoms: N
- Wrappers: N
- Higher fragments: N(N-1)/2
- **Total: O(N²)**

### 5.3 Height Calculation

Height represents topological depth in the lattice:

| Scenario | Formula |
|----------|---------|
| Atom | `0` |
| L1 Wrapper (null constituents) | `content[0].height + 1` |
| Fragment with constituents `[L, R]` | `max(L.height, R.height) + 1` |

### 5.4 `findNeighbors(targetURI, direction) → { neighbor, pair }[]`

Finds all nodes adjacent to a target in a given direction within the lattice.

**Smart resolution:**
1. If `target` is an Atom, auto-promote to its L1 wrapper (since constituent relationships reference wrappers, not raw atoms).
2. Scan all fragments with non-null constituents:
   - `direction = 'left'`: if `constituents[1] === target`, emit `constituents[0]`.
   - `direction = 'right'`: if `constituents[0] === target`, emit `constituents[1]`.
3. Auto-demote any L1-wrapper neighbor back to its inner Atom for cleaner output.

Returns: `{ neighbor: URI, pair: URI }` — the adjacent node and the parent fragment connecting them.

### 5.5 `findParentNode(leftURI, rightURI) → URI | undefined`

Finds a fragment whose `pgsl:constituents` are exactly `[left, right]`. Both inputs are auto-promoted from Atom to L1 wrapper if needed.

### 5.6 `resolveContentString(uri) → string`

Produces a human-readable recursive representation of any node:

| Input | Output |
|-------|--------|
| Atom `"k"` | `"k"` |
| L1 Wrapper around `"k"` | `"k"` (unwrapped) |
| Fragment `[A, B]` | `"(A B)"` |
| Nested `[[A, B], C]` | `"((A B) C)"` |

L1 wrappers are transparent — they recurse directly to their content without adding parentheses. This avoids `((A)(B))` artifacting.

### 5.7 `executeSPARQL(query) → URI[]`

A lightweight pattern-matching query engine supporting three constituent patterns:

| Pattern | Semantics |
|---------|-----------|
| `pgsl:constituents [ <L>, <R> ]` | Find parent of exact pair. |
| `pgsl:constituents [ ?left, <R> ]` | Find all left neighbors of R. |
| `pgsl:constituents [ <L>, ?right ]` | Find all right neighbors of L. |

### 5.8 Mutation Operations

| Operation | Behavior |
|-----------|----------|
| `reset()` | Clear all registries and repository. |
| `deleteNode(uri)` | Remove from repository and clean registry entries. Does not cascade to orphaned relatives. |

---

## 6. Federation Model

The engine supports a configurable identity model for distributed scenarios:

| Setting | Default | Purpose |
|---------|---------|---------|
| `authority` | `http://localhost:3000` | Base URL for minted URIs. Changing this makes the engine mint URIs under a different domain. |
| `agent` | `did:web:localhost:user:default` | DID stamped into `prov:wasAttributedTo` on every created node. |

All URIs follow the pattern:
```
{authority}/atoms/{uuid}        — for AtomNodes
{authority}/fragments/{uuid}    — for FragmentNodes
```

This enables future federation where nodes from different authorities can reference each other by URI within the same lattice.

---

## 7. JSON-LD Serialization

Every node carries a full `@context` mapping PGSL terms to standard RDF vocabularies:

```json
{
  "@context": {
    "pgsl":  "http://schema.pgsl.org/core#",
    "prov":  "http://www.w3.org/ns/prov#",
    "rdf":   "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "owl":   "http://www.w3.org/2002/07/owl#",
    "hydra": "http://www.w3.org/ns/hydra/core#",
    "schema":"http://schema.org/",
    "id":    "@id",
    "type":  "@type",
    "value": "rdf:value",
    "constituents": { "@id": "pgsl:constituents", "@type": "@id" },
    "content":      { "@id": "pgsl:content",      "@type": "@id" },
    "height":       { "@id": "pgsl:height",        "@type": "xsd:integer" },
    "level":        { "@id": "pgsl:level",         "@type": "xsd:integer" },
    "wasAttributedTo":  { "@id": "prov:wasAttributedTo",  "@type": "@id" },
    "generatedAtTime":  { "@id": "prov:generatedAtTime",  "@type": "xsd:dateTime" }
  },
  "@id": "http://localhost:3000/fragments/abc-123",
  "@type": ["pgsl:Fragment", "prov:Entity"],
  "pgsl:level": 3,
  "pgsl:height": 3,
  "pgsl:content": [
    "http://localhost:3000/atoms/aaa",
    "http://localhost:3000/atoms/bbb",
    "http://localhost:3000/atoms/ccc"
  ],
  "pgsl:constituents": [
    "http://localhost:3000/fragments/left-pair",
    "http://localhost:3000/fragments/right-pair"
  ],
  "prov:wasAttributedTo": "did:web:localhost:user:default",
  "prov:generatedAtTime": "2026-02-27T12:00:00.000Z"
}
```

---

## 8. Invariants Summary

1. **Atom level and height are always 0.**
2. **Fragment level equals `content.length`.**
3. **Fragment height is strictly greater than the height of any constituent.**
4. **Canonical uniqueness:** no two nodes share the same value (atoms) or content list (fragments).
5. **Binary overlap:** for any fragment with `constituents = [L, R]`, `L.content` and `R.content` overlap by all but one element — L drops the last element of the parent's content, R drops the first.
6. **L1 wrappers have null constituents** and single-element content.
7. **Every node has provenance:** `prov:wasAttributedTo` (agent) and `prov:generatedAtTime` (timestamp) are always populated.

---

## 9. Complexity

| Operation | Time | Space |
|-----------|------|-------|
| `getCanonicalAtom` | O(1) amortized | O(1) per new atom |
| `ingestSequence(N items)` | O(N²) | O(N²) new nodes |
| `findNeighbors` | O(M) where M = total nodes | — |
| `findParentNode` | O(M) | — |
| `resolveContentString` | O(N) recursive depth | — |
| `executeSPARQL` | O(M) | — |
