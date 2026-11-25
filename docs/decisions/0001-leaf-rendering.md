# Keyed children, DOM refs and streamed Suspense

Leaf owns the identity of sibling elements. A key and element type identify a child within its parent. Unkeyed children keep their positional behavior. Hydration adopts server nodes in document order and records their keys for subsequent updates. Removing a child releases its hooks and DOM refs.

Host refs accept an object or a callback. A callback can use the node after DOM placement. Detaching or replacing a ref clears it. Server rendering never assigns a ref.

A Suspense boundary with an explicit fallback can send that fallback while its children wait. Independent pending siblings reveal in completion order, each at its original position. Boundaries without a fallback keep the ordered stream for existing callers. The reveal script carries the response nonce when supplied. Buffered consumers that insert HTML without executing scripts need resolved markup.

Verify identity and ref cleanup after hydration and reordering. Hold two promises open, release the second first, and check both the stream and the resulting browser DOM. Exercise a direct document request and client navigation through the example.
