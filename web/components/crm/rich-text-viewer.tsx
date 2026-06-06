import * as React from 'react';
import { cn } from '@/lib/utils';
import type { TiptapDoc, TiptapNode } from '@/lib/types/db';

/**
 * RichTextViewer — server-safe read-only renderer for Tiptap/ProseMirror JSON
 * (ADR-009 #5). Renders the StarterKit node/mark set to React elements without
 * loading the editor, so documents read instantly in RSC and the editor bundle
 * only loads on edit. Visual styles mirror {@link RichTextEditor}'s prose.
 */

const PROSE =
  'prose prose-sm max-w-none dark:prose-invert ' +
  'prose-headings:font-semibold prose-headings:tracking-tight ' +
  'prose-h1:text-xl prose-h2:text-lg prose-h3:text-base ' +
  'prose-p:leading-relaxed prose-a:text-primary';

/**
 * Allowlist link schemes to neutralise stored XSS: a saved Tiptap doc can contain
 * a link mark with an arbitrary href (the write path does no sanitisation), and
 * React escapes the value but does NOT block `javascript:`/`data:` URIs. Only
 * http(s), mailto, tel, in-page anchors and site-relative links are allowed;
 * anything else collapses to '#'.
 */
function safeHref(raw: unknown): string {
  const v = String(raw ?? '').trim();
  if (v.startsWith('/') || v.startsWith('#')) return v;
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  return '#';
}

/** Wrap a text node in its active marks (bold/italic/strike/code/link). */
function renderText(node: TiptapNode, key: React.Key): React.ReactNode {
  let el: React.ReactNode = node.text ?? '';
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'bold':
        el = <strong>{el}</strong>;
        break;
      case 'italic':
        el = <em>{el}</em>;
        break;
      case 'strike':
        el = <s>{el}</s>;
        break;
      case 'code':
        el = <code>{el}</code>;
        break;
      case 'link': {
        const href = safeHref((mark.attrs as { href?: string })?.href);
        el = (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {el}
          </a>
        );
        break;
      }
      default:
        break;
    }
  }
  return <React.Fragment key={key}>{el}</React.Fragment>;
}

function renderNodes(nodes: TiptapNode[] | undefined): React.ReactNode {
  if (!nodes) return null;
  return nodes.map((n, i) => renderNode(n, i));
}

function renderNode(node: TiptapNode, key: React.Key): React.ReactNode {
  switch (node.type) {
    case 'text':
      return renderText(node, key);
    case 'paragraph':
      return <p key={key}>{renderNodes(node.content)}</p>;
    case 'heading': {
      const level = Number((node.attrs as { level?: number })?.level ?? 2);
      const Tag = (`h${Math.min(Math.max(level, 1), 6)}`) as keyof JSX.IntrinsicElements;
      return <Tag key={key}>{renderNodes(node.content)}</Tag>;
    }
    case 'bulletList':
      return <ul key={key}>{renderNodes(node.content)}</ul>;
    case 'orderedList':
      return <ol key={key}>{renderNodes(node.content)}</ol>;
    case 'listItem':
      return <li key={key}>{renderNodes(node.content)}</li>;
    case 'blockquote':
      return <blockquote key={key}>{renderNodes(node.content)}</blockquote>;
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{renderNodes(node.content)}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr key={key} />;
    case 'hardBreak':
      return <br key={key} />;
    default:
      // Unknown node → render its children defensively.
      return <React.Fragment key={key}>{renderNodes(node.content)}</React.Fragment>;
  }
}

export interface RichTextViewerProps {
  doc: TiptapDoc;
  className?: string;
}

export function RichTextViewer({ doc, className }: RichTextViewerProps) {
  const empty = !doc?.content || doc.content.length === 0;
  if (empty) {
    return (
      <p className={cn('text-sm italic text-muted-foreground', className)}>
        Nessun contenuto.
      </p>
    );
  }
  return <div className={cn(PROSE, className)}>{renderNodes(doc.content)}</div>;
}
