# Bytecode

An interactive monograph on the CPython interpreter. A single long-form page that develops the subject from source compilation to bytecode through the value stack, frames, reference counting, cyclic GC, and the specialising adaptive interpreter, ending at free-threaded CPython and the GIL. Six live figures and a literature review.

**Live:** https://pablowilliams.github.io/Bytecode/

## What is here

Ten sections on one continuous-scroll page:

1. Reading the language one instruction at a time
2. The source, the compiler and the bytecode
3. **A history of CPython internals: a literature review** — the original implementation; PyPy, Pyston, Truffle as alternative-implementation work; Shannon's PhD and the specialising adaptive interpreter (PEP 659); PEP 657 (fine-grained errors); PEP 703 (free-threaded CPython)
4. The value stack
5. Reference counting
6. Cyclic garbage collection
7. The specialising adaptive interpreter
8. Frames and the call stack
9. Free-threaded CPython and the GIL
10. Conclusion

Six interactive figures. Two are deliberately rendered as semantic DOM rather than canvas, per the accessibility review: the source-plus-disassembly listing uses `<pre>` and `<ol>` with `aria-current` on the active line; the value-stack figure uses a real `<table>` with row and column headers and the running stack announced through the live region. The four graphical figures (refcount, cyclic GC, specialisation, call stack) use canvas with an off-canvas radiogroup of object selectors. Eleven references.

## Accessibility

Built to WCAG 2.2 AA. Real text is used for all prose-like content (the disassembly is `<pre><code>` and `<ol>`, the value stack is a `<table>` with `<th scope="row">` and `<th scope="col">`, the current-instruction label is a real `<p>`); the active line is marked with `aria-current="true"`, a leading chevron glyph and a highlighted background so the state is conveyed by three orthogonal channels; arrow-key navigation of the program counter respects Home/End; the graphical figures use distinct ring/halo glyphs to mark the active object (non-colour); `prefers-reduced-motion` is honoured.

## Stack

Vanilla HTML, CSS and JavaScript.

## Run locally

```bash
git clone https://github.com/pablowilliams/Bytecode.git
cd Bytecode
open index.html
```

## Sources

Aycock (2003), Bolz et al. (PyPy, 2009), Modzelewski et al. (Pyston, 2014), Würthinger et al. (Truffle, 2013), Shannon's PhD (2011), PEP 659 (Shannon, 2021), PEP 657 (Galindo Salgado, 2021), PEP 703 (Gross, 2023), Beazley's GIL talk (2010), van Rossum (1995), and the CPython source tree at <https://github.com/python/cpython>.
