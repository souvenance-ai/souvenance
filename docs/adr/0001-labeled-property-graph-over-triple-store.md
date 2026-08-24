# Labeled-property graph over triple-store

We use a labeled-property graph: the node is a whole memory (a markdown document), attributes live in a `metadata` JSON column, and typed directed edges connect memories. We rejected the triple-store / RDF model (subject-predicate-object triples, every attribute a node) because it atomizes content into one-word nodes, defeats FTS5 full-text search, and leaves the markdown prose with no natural home.
