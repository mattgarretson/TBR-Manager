"use client";

export function TagSuggestions({
  input,
  tags,
  selected,
  onPick,
}: {
  input: string;
  tags: readonly string[];
  selected: readonly string[];
  onPick: (tag: string) => void;
}) {
  const needle = input.trim().replace(/^#/, "").toLocaleLowerCase("en-US");
  if (!needle) return null;
  const selectedTags = new Set(selected);
  const matches = tags
    .filter((tag) => tag.startsWith(needle) && !selectedTags.has(tag))
    .slice(0, 6);
  if (!matches.length) return null;
  return (
    <div className="tag-suggestions" aria-label="Matching library tags">
      {matches.map((tag) => (
        <button
          type="button"
          key={tag}
          aria-label={`Use tag ${tag}`}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onPick(tag)}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
