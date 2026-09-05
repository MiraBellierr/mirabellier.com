import React from "react";
import type { VideoTagField } from "./useVideoTagInput";

/**
 * The tag chips + text input + suggestion dropdown shared by the pixie upload
 * forms. Drive it with a {@link VideoTagField} from `useVideoTagInput`.
 */
export default function TagInput({
  field,
  label = "Tags",
  required = false,
  emptyPlaceholder,
  filledPlaceholder = "Add another tag...",
  helpText,
}: {
  field: VideoTagField;
  label?: React.ReactNode;
  required?: boolean;
  emptyPlaceholder: string;
  filledPlaceholder?: string;
  helpText?: React.ReactNode;
}) {
  const {
    tags,
    tagInput,
    setTagInput,
    tagInputFocused,
    setTagInputFocused,
    filteredSuggestions,
    addTag,
    removeTag,
    handleTagKeyDown,
  } = field;

  return (
    <div>
      <label className="block text-sm font-medium text-blue-600 dark:text-purple-300">
        {label} {required && <span className="text-pink-500">*</span>}
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-pink-100 dark:bg-purple-700/60 px-3 py-1 text-sm font-medium text-pink-700 dark:text-purple-100"
          >
            #{tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => removeTag(tag)}
              className="font-bold text-pink-500 dark:text-purple-300 hover:text-pink-700 dark:hover:text-purple-100"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="relative mt-2">
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          onFocus={() => setTagInputFocused(true)}
          onBlur={() => {
            setTagInputFocused(false);
            if (tagInput.trim()) addTag(tagInput);
          }}
          placeholder={tags.length === 0 ? emptyPlaceholder : filledPlaceholder}
          maxLength={20}
          className="w-full p-3 border border-blue-200 dark:border-purple-600 rounded-lg focus:ring-2 focus:ring-blue-200"
        />
        {tagInputFocused && filteredSuggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-blue-200 dark:border-purple-600 bg-white dark:bg-purple-900 shadow-md">
            {filteredSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addTag(suggestion)}
                className="block w-full px-3 py-2 text-left text-sm text-blue-700 dark:text-purple-200 hover:bg-blue-50 dark:hover:bg-purple-800"
              >
                #{suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
      {helpText && (
        <p className="mt-1 text-xs text-blue-500 dark:text-purple-400">
          {helpText}
        </p>
      )}
    </div>
  );
}
