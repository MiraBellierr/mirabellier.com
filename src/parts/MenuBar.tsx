import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'


function MenuBar({ editor }: { editor: Editor }) {
  const editorState = useEditorState({
    editor,
    selector: ctx => {
      return {
        isBold: ctx.editor.isActive('bold'),
        canBold: ctx.editor.can().chain().toggleBold().run(),
        isItalic: ctx.editor.isActive('italic'),
        canItalic: ctx.editor.can().chain().toggleItalic().run(),
        isStrike: ctx.editor.isActive('strike'),
        canStrike: ctx.editor.can().chain().toggleStrike().run(),
        isCode: ctx.editor.isActive('code'),
        canCode: ctx.editor.can().chain().toggleCode().run(),
      }
    },
  })

  return (
    <div className="control-group">
      <div className="button-group space-x-2">
        <button
          type='button'
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editorState.canBold}
          className={editorState.isBold ? 'is-active border border-blue-500 bg-blue-300 p-1 rounded-lg' : 'border border-blue-500 bg-white p-1 rounded-lg'}
        >
          Bold
        </button>
        <button
          type='button'
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editorState.canItalic}
          className={editorState.isItalic ? 'is-active border border-blue-500 bg-blue-300 p-1 rounded-lg' : 'border border-blue-500 bg-white p-1 rounded-lg'}
        >
          Italic
        </button>
        <button
          type='button'
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={!editorState.canStrike}
          className={editorState.isStrike ? 'is-active border border-blue-500 bg-blue-300 p-1 rounded-lg' : 'border border-blue-500 bg-white p-1 rounded-lg'}
        >
          Strike
        </button>
        <button
          type='button'
          onClick={() => editor.chain().focus().toggleCode().run()}
          disabled={!editorState.canCode}
          className={editorState.isCode ? 'is-active border border-blue-500 bg-blue-300 p-1 rounded-lg' : 'border border-blue-500 bg-white p-1 rounded-lg'}
        >
          Code
        </button>
      </div>
    </div>
  )
}

export default MenuBar;