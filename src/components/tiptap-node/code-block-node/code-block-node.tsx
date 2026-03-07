"use client";

import * as React from "react";
import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";
import {
  CODE_BLOCK_LANGUAGES,
  formatCodeBlockLanguage,
  isSupportedCodeBlockLanguage,
  normalizeCodeBlockLanguage,
} from "@/lib/code-block-languages";

const stopEditorEvent = (event: React.SyntheticEvent) => {
  event.stopPropagation();
};

const CopyIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="9" width="10" height="10" rx="2" />
    <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
  </svg>
);

const ClearIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export const CodeBlockNode = ({
  node,
  updateAttributes,
  editor,
}: NodeViewProps) => {
  const datalistId = React.useId();
  const isEditable = editor.isEditable;
  const currentLanguage = typeof node.attrs.language === "string"
    ? node.attrs.language
    : "";
  const [languageInput, setLanguageInput] = React.useState(currentLanguage);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setLanguageInput(currentLanguage);
  }, [currentLanguage]);

  React.useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  const commitLanguage = React.useCallback(
    (value: string) => {
      const normalized = normalizeCodeBlockLanguage(value);

      if (!normalized) {
        updateAttributes({ language: null });
        setLanguageInput("");
        return;
      }

      if (isSupportedCodeBlockLanguage(normalized)) {
        updateAttributes({ language: normalized });
        setLanguageInput(normalized);
        return;
      }

      setLanguageInput(currentLanguage);
    },
    [currentLanguage, updateAttributes],
  );

  const handleLanguageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setLanguageInput(nextValue);

    const normalized = normalizeCodeBlockLanguage(nextValue);
    if (!normalized || isSupportedCodeBlockLanguage(normalized)) {
      updateAttributes({ language: normalized || null });
    }
  };

  const handleLanguageKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitLanguage(languageInput);
      editor.commands.focus();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setLanguageInput(currentLanguage);
      editor.commands.focus();
    }
  };

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    stopEditorEvent(event);

    if (!node.textContent) {
      return;
    }

    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <NodeViewWrapper className="tiptap-code-block" data-language={currentLanguage || "auto"}>
      <div
        className="tiptap-code-block-header"
        contentEditable={false}
        onMouseDown={stopEditorEvent}
        onClick={stopEditorEvent}
      >
        <div className="tiptap-code-block-language">
          {isEditable ? (
            <>
              <input
                type="text"
                list={datalistId}
                value={languageInput}
                onChange={handleLanguageChange}
                onBlur={() => commitLanguage(languageInput)}
                onKeyDown={handleLanguageKeyDown}
                placeholder="Auto"
                spellCheck={false}
                className="tiptap-code-block-language-input"
                aria-label="Code block language"
              />
              <datalist id={datalistId}>
                {CODE_BLOCK_LANGUAGES.map((language) => (
                  <option key={language} value={language}>
                    {formatCodeBlockLanguage(language)}
                  </option>
                ))}
              </datalist>
              {currentLanguage ? (
                <button
                  type="button"
                  className="tiptap-code-block-icon-button"
                  onClick={() => commitLanguage("")}
                  aria-label="Use auto-detected language"
                  title="Auto detect"
                >
                  <ClearIcon />
                </button>
              ) : null}
            </>
          ) : (
            <span className="tiptap-code-block-language-label">
              {formatCodeBlockLanguage(currentLanguage)}
            </span>
          )}
        </div>

        <button
          type="button"
          className={`tiptap-code-block-copy-button ${copied ? "is-copied" : ""}`}
          onClick={handleCopy}
          aria-label={copied ? "Copied code" : "Copy code"}
          title={copied ? "Copied" : "Copy code"}
        >
          <CopyIcon />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      <pre className="tiptap-code-block-body">
        <NodeViewContent
          spellCheck={false}
          className={`tiptap-code-block-content${currentLanguage ? ` language-${currentLanguage}` : ""}`}
        />
      </pre>
    </NodeViewWrapper>
  );
};

export default CodeBlockNode;
