import { useEffect, useRef } from 'react';
import { EditorView, keymap, lineNumbers, placeholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { sql } from '@codemirror/lang-sql';
import { defaultKeymap } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const PLACEHOLDER = '-- Write your SQL query here\nSELECT * FROM employees LIMIT 10;';

// ── Light editor theme ─────────────────────────────────────────────────────────
// Colors pull from the same palette as main.css so the editor feels embedded
// in the app rather than bolted on.  Hardcoded hex here because CodeMirror
// themes are JS-based and can't read CSS variables.

const sqlLightTheme = EditorView.theme({
  '&': {
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    height: '100%',
  },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-content': { caretColor: '#0F172A' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#0F172A' },

  // Selection: soft emerald tint
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: '#D1FAE5',
  },

  // Line gutters (line numbers)
  '.cm-gutters': {
    backgroundColor: '#F7FAF8',
    color: '#94A3B8',
    border: 'none',
    borderRight: '1px solid #E5E9E7',
  },
  '.cm-lineNumbers .cm-gutterElement': { color: '#94A3B8' },

  // Active line
  '.cm-activeLine': { backgroundColor: '#F1F5F3' },
  '.cm-activeLineGutter': { backgroundColor: '#F1F5F3', color: '#475569' },

  // Matching brackets
  '.cm-matchingBracket, .cm-nonmatchingBracket': {
    backgroundColor: '#D1FAE5',
    outline: '1px solid #10B981',
  },

  // Placeholder text
  '.cm-placeholder': { color: '#94A3B8', fontStyle: 'italic' },

  // Autocomplete tooltip
  '.cm-tooltip': {
    backgroundColor: '#FFFFFF',
    border: '1px solid #CBD5D1',
    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.06)',
    borderRadius: '6px',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: '#ECFDF5',
    color: '#0F172A',
  },
});

// ── Syntax highlight style ─────────────────────────────────────────────────────
// Keywords are emerald-700 (#047857) so they tie into the app's accent palette.
// Strings → warm amber, numbers → blue, comments → muted gray.

const sqlLightHighlight = syntaxHighlighting(
  HighlightStyle.define([
    // SQL keywords (SELECT, FROM, WHERE, JOIN, …) — emerald, bold
    { tag: [tags.keyword, tags.operatorKeyword], color: '#047857', fontWeight: 'bold' },
    // String literals
    { tag: tags.string, color: '#B45309' },
    // Numeric literals
    { tag: tags.number, color: '#1D4ED8' },
    // Comments
    { tag: tags.comment, color: '#94A3B8', fontStyle: 'italic' },
    // Operators (=, <, >, …)
    { tag: tags.operator, color: '#047857' },
    // Type names
    { tag: tags.typeName, color: '#6D28D9' },
    // Function calls
    { tag: [tags.function(tags.name), tags.function(tags.variableName)], color: '#0369A1' },
    // Identifiers (table / column names)
    { tag: [tags.name, tags.variableName], color: '#0F172A' },
    // Punctuation
    { tag: tags.punctuation, color: '#475569' },
    // Booleans / NULL
    { tag: tags.bool, color: '#1D4ED8', fontWeight: 'bold' },
    { tag: tags.null, color: '#94A3B8', fontStyle: 'italic' },
    // Special names
    { tag: tags.special(tags.name), color: '#047857' },
  ])
);

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * CodeMirror 6 SQL editor component.
 *
 * Props:
 *   value      {string}   - Initial SQL content (treated as uncontrolled after mount).
 *   onChange   {function} - Called with the current editor string on every change.
 *   onExecute  {function} - Called when Ctrl+Enter / Cmd+Enter is pressed.
 */
function Editor({ value, onChange, onExecute }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);

  // Keep callbacks in refs so the stable effect closure always calls the latest version.
  const onChangeRef = useRef(onChange);
  const onExecuteRef = useRef(onExecute);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onExecuteRef.current = onExecute; }, [onExecute]);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        sql(),
        sqlLightTheme,
        sqlLightHighlight,
        placeholder(PLACEHOLDER),
        keymap.of([
          {
            key: 'Ctrl-Enter',
            mac: 'Cmd-Enter',
            run() {
              onExecuteRef.current();
              return true;
            },
          },
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount — CodeMirror owns its own state after that.

  return <div ref={containerRef} className="editor-container" />;
}

export default Editor;
