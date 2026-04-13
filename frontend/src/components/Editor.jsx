import { useEffect, useRef } from 'react';
import { EditorView, keymap, lineNumbers, placeholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { sql } from '@codemirror/lang-sql';
import { defaultKeymap } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';

const PLACEHOLDER = '-- Write your SQL query here\nSELECT * FROM employees LIMIT 10;';

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
        oneDark,
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
        EditorView.theme({
          // Fill the container div completely.
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
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
