/**
 * Inline error box rendered below the editor when the API returns an error.
 *
 * Props:
 *   message   {string}   - Error text from the backend.
 *   onDismiss {function} - Called when the user clicks the dismiss button.
 */
function ErrorDisplay({ message, onDismiss }) {
  return (
    <div className="error-display" role="alert">
      <pre className="error-message">{message}</pre>
      <button
        className="error-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss error"
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export default ErrorDisplay;
