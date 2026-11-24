"use client";

import React from "react";

interface ScientificMarkdownProps {
  content: string;
  className?: string;
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRe = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      const inner = token.slice(2, -2);
      nodes.push(
        <strong
          key={`b-${keyIdx++}`}
          className="font-semibold text-[var(--text-primary)]"
        >
          {inner.includes("`") ? renderInline(inner) : inner}
        </strong>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={`c-${keyIdx++}`}
          className="neu-recessed mx-0.5 rounded-md px-1.5 py-0.5 font-mono-bio text-[0.86em] font-medium text-accent"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = tokenRe.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

export function ScientificMarkdown({
  content,
  className = "",
}: ScientificMarkdownProps) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const elements: React.ReactNode[] = [];

  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      i++;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const headingClass =
        level === 1
          ? "text-base font-semibold text-[var(--text-primary)] pt-1"
          : level === 2
            ? "text-[0.98rem] font-semibold text-[var(--text-primary)] pt-1"
            : "text-sm font-semibold text-accent pt-0.5";
      elements.push(
        <h4 key={`h-${blockKey++}`} className={headingClass}>
          {renderInline(text)}
        </h4>
      );
      i++;
      continue;
    }

    if (/^([-*•])\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^([-*•])\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^([-*•])\s+/, ""));
        i++;
      }
      elements.push(
        <ul
          key={`ul-${blockKey++}`}
          className="space-y-1.5 pl-5 list-disc marker:text-[var(--accent-primary)]"
        >
          {items.map((item, idx) => (
            <li
              key={idx}
              className="text-[0.94rem] leading-relaxed text-[var(--text-secondary)]"
            >
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ""));
        i++;
      }
      elements.push(
        <ol
          key={`ol-${blockKey++}`}
          className="space-y-1.5 pl-5 list-decimal marker:font-mono-bio marker:font-semibold marker:text-[var(--accent-primary)]"
        >
          {items.map((item, idx) => (
            <li
              key={idx}
              className="text-[0.94rem] leading-relaxed text-[var(--text-secondary)]"
            >
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    const paraLines: string[] = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s+/.test(lines[i].trim()) &&
      !/^([-*•])\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    elements.push(
      <p
        key={`p-${blockKey++}`}
        className="text-[0.94rem] leading-relaxed text-[var(--text-secondary)]"
      >
        {renderInline(paraLines.join(" "))}
      </p>
    );
  }

  return <div className={`space-y-2.5 ${className}`}>{elements}</div>;
}
