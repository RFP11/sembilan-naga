import { Fragment, type ReactNode } from "react";

// Renders the small Markdown subset used by the SRD data: paragraphs, "- " lists,
// **bold** and *italic*. No HTML is interpreted, so content can't inject markup.

function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
        <em key={i}>{part.slice(1, -1)}</em>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
}

export function Prose({ text }: { text: string }) {
  return (
    <div className="prose">
      {text.split("\n\n").map((block, i) => {
        const lines = block.split("\n");
        const items = lines.filter((l) => l.startsWith("- "));
        const head = lines.filter((l) => !l.startsWith("- "));
        return (
          <Fragment key={i}>
            {head.length > 0 && <p>{inline(head.join(" "))}</p>}
            {items.length > 0 && (
              <ul>
                {items.map((l, j) => (
                  <li key={j}>{inline(l.slice(2))}</li>
                ))}
              </ul>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
