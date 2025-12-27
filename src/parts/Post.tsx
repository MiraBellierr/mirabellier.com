import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from "@tiptap/starter-kit"
import { Image } from "@tiptap/extension-image"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { Selection } from "@tiptap/extensions"

const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(), 
      loading: {
        default: 'lazy', 
        parseHTML: element => element.getAttribute('loading'),
        renderHTML: attributes => ({ loading: attributes.loading }),
      },
    }
  },
})

const Post = ({ html }: { html: object }) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      CustomImage.configure({ allowBase64: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Typography,
      Superscript,
      Subscript,
      Selection,
    ],
    content: html,
    editable: false,
  })

  if (!editor) return null

  return (
    <div className="prose dark:prose-invert prose-blue max-w-none">
      <EditorContent editor={editor} />
    </div>
  )
}

export default Post;