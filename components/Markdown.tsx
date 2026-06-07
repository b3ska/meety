import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// GitHub-flavored markdown for LLM output (summaries + chat). Styling lives in
// the `.markdown-body` scope in globals.css so it themes to NovaSpark tokens.
// Raw HTML is intentionally NOT enabled (no rehype-raw) — model output stays inert.

export default function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
