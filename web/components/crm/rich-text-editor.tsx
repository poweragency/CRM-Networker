'use client';

import * as React from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Quote,
  Undo2,
  Redo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TiptapDoc } from '@/lib/types/db';

/**
 * RichTextEditor — the Tiptap/ProseMirror editor for internal documents
 * (ADR-009 #5). Rich text only, NO file uploads. Emits Tiptap JSON via
 * `onChange`. Pair with {@link RichTextViewer} for read-only rendering. The
 * shared prose styles below keep the editor and viewer visually identical.
 */

const PROSE =
  'prose prose-sm max-w-none dark:prose-invert ' +
  'prose-headings:font-semibold prose-headings:tracking-tight ' +
  'prose-h1:text-xl prose-h2:text-lg prose-h3:text-base ' +
  'prose-p:leading-relaxed prose-a:text-primary ' +
  'focus:outline-none';

export interface RichTextEditorProps {
  value: TiptapDoc;
  onChange: (doc: TiptapDoc) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  // Subscribe to editor transactions so button active states stay in sync.
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    editor.on('transaction', force);
    return () => {
      editor.off('transaction', force);
    };
  }, [editor]);

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b p-1.5">
      <ToolbarButton
        label="Grassetto"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold />
      </ToolbarButton>
      <ToolbarButton
        label="Corsivo"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic />
      </ToolbarButton>
      <ToolbarButton
        label="Barrato"
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <ToolbarButton
        label="Titolo"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 />
      </ToolbarButton>
      <ToolbarButton
        label="Sottotitolo"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <ToolbarButton
        label="Elenco puntato"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List />
      </ToolbarButton>
      <ToolbarButton
        label="Elenco numerato"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered />
      </ToolbarButton>
      <ToolbarButton
        label="Citazione"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <ToolbarButton
        label="Annulla"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 />
      </ToolbarButton>
      <ToolbarButton
        label="Ripeti"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 />
      </ToolbarButton>
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  editable = true,
  placeholder,
  className,
  ...aria
}: RichTextEditorProps) {
  const editor = useEditor({
    // Avoid SSR hydration mismatch (Tiptap renders on the client).
    immediatelyRender: false,
    editable,
    extensions: [StarterKit],
    content: value,
    editorProps: {
      attributes: {
        class: cn(PROSE, 'min-h-[12rem] px-4 py-3'),
        'aria-label': aria['aria-label'] ?? placeholder ?? 'Editor di testo',
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.getJSON() as TiptapDoc);
    },
  });

  React.useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (!editor) {
    return (
      <div
        className={cn(
          'min-h-[14rem] rounded-md border bg-background',
          className,
        )}
        aria-busy
      />
    );
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
        className,
      )}
    >
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
