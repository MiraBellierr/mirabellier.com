import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchVideoTagSuggestions,
  MAX_VIDEO_TAGS,
  normalizeVideoTags,
} from "@/lib/pixies";

export interface VideoTagField {
  tags: string[];
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
  tagInput: string;
  setTagInput: React.Dispatch<React.SetStateAction<string>>;
  tagInputFocused: boolean;
  setTagInputFocused: React.Dispatch<React.SetStateAction<boolean>>;
  tagSuggestions: string[];
  filteredSuggestions: string[];
  addTag: (raw: string) => void;
  removeTag: (tag: string) => void;
  handleTagKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Shared tag-input state for the pixie upload forms (`PixieUpload`,
 * `AdminPixies`): the tag list, the in-progress input, the fetched suggestion
 * pool, and the add / remove / keydown behaviour that was duplicated verbatim
 * between the two pages.
 *
 * `onMessage` mirrors the pages' inline error slot — it's called with the
 * "too many tags" warning when the cap is hit, and with `null` on a successful
 * add (matching the previous `setMessage` calls).
 */
export function useVideoTagInput(options?: {
  onMessage?: (message: string | null) => void;
}): VideoTagField {
  const onMessage = options?.onMessage;

  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagInputFocused, setTagInputFocused] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchVideoTagSuggestions().then((suggestions) => {
      if (!cancelled) setTagSuggestions(suggestions);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const addTag = useCallback(
    (raw: string) => {
      const normalized = normalizeVideoTags([raw]);
      if (normalized.length === 0) return;
      const tag = normalized[0];
      if (tags.includes(tag)) {
        setTagInput("");
        return;
      }
      if (tags.length >= MAX_VIDEO_TAGS) {
        onMessage?.(`You can add up to ${MAX_VIDEO_TAGS} tags`);
        setTagInput("");
        return;
      }
      setTags((current) => [...current, tag]);
      setTagInput("");
      onMessage?.(null);
    },
    [tags, onMessage],
  );

  const removeTag = useCallback((tag: string) => {
    setTags((current) => current.filter((entry) => entry !== tag));
  }, []);

  const handleTagKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        addTag(tagInput);
      } else if (event.key === "Backspace" && !tagInput && tags.length > 0) {
        setTags((current) => current.slice(0, -1));
      }
    },
    [addTag, tagInput, tags.length],
  );

  const filteredSuggestions = useMemo(
    () =>
      tagSuggestions
        .filter(
          (suggestion) =>
            suggestion.includes(tagInput.trim().toLowerCase()) &&
            !tags.includes(suggestion),
        )
        .slice(0, 8),
    [tagSuggestions, tagInput, tags],
  );

  return {
    tags,
    setTags,
    tagInput,
    setTagInput,
    tagInputFocused,
    setTagInputFocused,
    tagSuggestions,
    filteredSuggestions,
    addTag,
    removeTag,
    handleTagKeyDown,
  };
}
