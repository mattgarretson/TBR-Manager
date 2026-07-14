"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";

type Book = {
  id: string;
  title: string;
  author: string;
  reason: string;
  tags: string[];
  coverUrl: string;
  coverKey: string;
  createdAt: string;
  updatedAt: string;
};

type BookDraft = Omit<Book, "id" | "createdAt" | "updatedAt">;

const emptyDraft: BookDraft = {
  title: "",
  author: "",
  reason: "",
  tags: [],
  coverUrl: "",
  coverKey: "",
};

function normalizeTags(tags: string[]) {
  return [
    ...new Set(
      tags
        .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function getLibraryId() {
  const storageKey = "plot-pile-library-id";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(storageKey, created);
  return created;
}

function initials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function coverTone(bookId: string) {
  let hash = 0;
  for (let index = 0; index < bookId.length; index += 1) {
    hash = (hash * 31 + bookId.charCodeAt(index)) >>> 0;
  }
  return hash % 5;
}

export default function Home() {
  const [books, setBooks] = useState<Book[]>([]);
  const [libraryId, setLibraryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("All");
  const [sort, setSort] = useState("newest");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BookDraft>(emptyDraft);
  const [tagInput, setTagInput] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadBooks(id: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/books?libraryId=${encodeURIComponent(id)}`);
      const payload = (await response.json()) as { books?: Book[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load your shelf.");
      setBooks(payload.books ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your shelf.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = getLibraryId();
    setLibraryId(id);
    void loadBooks(id);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    books.forEach((book) =>
      book.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)),
    );
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [books]);

  const visibleBooks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = books.filter((book) => {
      const matchesTag = activeTag === "All" || book.tags.includes(activeTag);
      const matchesQuery =
        !needle ||
        [book.title, book.author, book.reason, ...book.tags]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return matchesTag && matchesQuery;
    });

    return filtered.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "author") return a.author.localeCompare(b.author);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [books, query, activeTag, sort]);

  function openNewBook() {
    setEditingId(null);
    setDraft(emptyDraft);
    setTagInput("");
    setCoverFile(null);
    setCoverPreview("");
    setError("");
    setEditorOpen(true);
  }

  function openEditBook(book: Book) {
    setEditingId(book.id);
    setDraft({
      title: book.title,
      author: book.author,
      reason: book.reason,
      tags: book.tags,
      coverUrl: book.coverUrl,
      coverKey: book.coverKey,
    });
    setTagInput("");
    setCoverFile(null);
    setCoverPreview(book.coverUrl);
    setError("");
    setEditorOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setEditorOpen(false);
  }

  function addTags(value: string) {
    const incoming = normalizeTags(value.split(","));
    if (!incoming.length) return;
    setDraft((current) => ({
      ...current,
      tags: normalizeTags([...current.tags, ...incoming]),
    }));
    setTagInput("");
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTags(tagInput);
    }
  }

  function chooseCover(file: File | null) {
    setCoverFile(file);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCoverPreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function saveBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.author.trim()) {
      setError("Add both a title and an author so future-you knows what this is.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      let coverUrl = draft.coverUrl.trim();
      let coverKey = draft.coverKey;

      if (coverFile) {
        const formData = new FormData();
        formData.append("cover", coverFile);
        const upload = await fetch("/api/covers", { method: "POST", body: formData });
        const uploaded = (await upload.json()) as {
          coverUrl?: string;
          coverKey?: string;
          error?: string;
        };
        if (!upload.ok) throw new Error(uploaded.error || "That cover would not upload.");
        coverUrl = uploaded.coverUrl ?? "";
        coverKey = uploaded.coverKey ?? "";
      }

      const response = await fetch("/api/books", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          libraryId,
          ...draft,
          tags: normalizeTags([...draft.tags, ...tagInput.split(",")]),
          title: draft.title.trim(),
          author: draft.author.trim(),
          reason: draft.reason.trim(),
          coverUrl,
          coverKey,
        }),
      });
      const payload = (await response.json()) as { book?: Book; error?: string };
      if (!response.ok || !payload.book) throw new Error(payload.error || "Could not save this book.");

      setBooks((current) =>
        editingId
          ? current.map((book) => (book.id === editingId ? payload.book! : book))
          : [payload.book!, ...current],
      );
      setEditorOpen(false);
      setNotice(editingId ? "Book updated" : "Added to your TBR");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this book.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBook(book: Book) {
    if (!window.confirm(`Remove “${book.title}” from your TBR?`)) return;
    setError("");
    try {
      const response = await fetch(
        `/api/books?id=${encodeURIComponent(book.id)}&libraryId=${encodeURIComponent(libraryId)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not remove this book.");
      setBooks((current) => current.filter((item) => item.id !== book.id));
      setNotice("Removed from your TBR");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove this book.");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Plot Pile home">
          <span className="brand-mark">PP</span>
          <span>Plot Pile</span>
        </a>
        <button className="add-button desktop-add" type="button" onClick={openNewBook}>
          <span aria-hidden="true">＋</span> Add a book
        </button>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">Your beautifully unhinged reading list</p>
          <h1>Remember why you wanted to read it.</h1>
          <p className="hero-copy">
            Titles, authors, every last trope, and the tiny note that saves you from asking,
            “wait—why is this on my list?”
          </p>
        </div>
        <div className="shelf-stats" aria-label="TBR summary">
          <div>
            <strong>{books.length}</strong>
            <span>books waiting</span>
          </div>
          <div>
            <strong>{allTags.length}</strong>
            <span>tropes collected</span>
          </div>
          <div className="top-trope">
            <strong>{allTags[0]?.[0] ?? "Your next obsession"}</strong>
            <span>{allTags.length ? "top trope" : "starts here"}</span>
          </div>
        </div>
      </section>

      <section className="library" aria-labelledby="library-title">
        <div className="library-heading">
          <div>
            <p className="section-kicker">The pile</p>
            <h2 id="library-title">My TBR</h2>
          </div>
          <label className="sort-control">
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="newest">Recently added</option>
              <option value="title">Book title</option>
              <option value="author">Author</option>
            </select>
          </label>
        </div>

        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Search your TBR</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles, authors, tropes…"
          />
        </label>

        {allTags.length > 0 && (
          <div className="tag-filter" aria-label="Filter by trope">
            <button
              className={activeTag === "All" ? "active" : ""}
              type="button"
              onClick={() => setActiveTag("All")}
            >
              All <span>{books.length}</span>
            </button>
            {allTags.map(([tag, count]) => (
              <button
                className={activeTag === tag ? "active" : ""}
                type="button"
                onClick={() => setActiveTag(tag)}
                key={tag}
              >
                {tag} <span>{count}</span>
              </button>
            ))}
          </div>
        )}

        {error && !editorOpen && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            {libraryId && (
              <button type="button" onClick={() => void loadBooks(libraryId)}>
                Try again
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="book-grid loading-grid" aria-label="Loading your books">
            {[0, 1, 2].map((item) => (
              <div className="book-card loading-card" key={item} />
            ))}
          </div>
        ) : visibleBooks.length > 0 ? (
          <div className="book-grid">
            {visibleBooks.map((book) => (
              <article className="book-card" key={book.id}>
                <div className={`cover cover-tone-${coverTone(book.id)}`}>
                  {book.coverUrl ? (
                    // User-provided cover URLs can come from any host.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={book.coverUrl} alt={`Cover of ${book.title}`} />
                  ) : (
                    <div className="cover-placeholder">
                      <span>{initials(book.title)}</span>
                      <small>{book.author}</small>
                    </div>
                  )}
                </div>
                <div className="book-details">
                  <div className="book-heading-row">
                    <div>
                      <h3>{book.title}</h3>
                      <p className="author">by {book.author}</p>
                    </div>
                    <button
                      className="edit-button"
                      type="button"
                      onClick={() => openEditBook(book)}
                      aria-label={`Edit ${book.title}`}
                    >
                      Edit
                    </button>
                  </div>
                  {book.tags.length > 0 && (
                    <div className="book-tags" aria-label="Tropes and tags">
                      {book.tags.map((tag) => (
                        <button type="button" onClick={() => setActiveTag(tag)} key={tag}>
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="reason-note">
                    <span className="quote-mark" aria-hidden="true">“</span>
                    <div>
                      <small>Why I saved it</small>
                      <p>{book.reason || "Future me knew this looked good."}</p>
                    </div>
                  </div>
                  <button className="remove-button" type="button" onClick={() => void deleteBook(book)}>
                    Remove from TBR
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : books.length === 0 ? (
          <div className="empty-state">
            <div className="example-card" aria-hidden="true">
              <div className="example-cover">EX</div>
              <div>
                <span className="example-label">Your first book goes here</span>
                <div className="example-lines"><i /><i /><i /></div>
                <div className="example-tags"><b>slow burn</b><b>found family</b></div>
              </div>
            </div>
            <p className="eyebrow">Clean slate. Dangerous.</p>
            <h3>Your TBR is suspiciously empty.</h3>
            <p>Rescue the next recommendation from your browser tabs or saved videos.</p>
            <button className="add-button" type="button" onClick={openNewBook}>＋ Add your first book</button>
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <p className="eyebrow">No matches</p>
            <h3>That trope is hiding.</h3>
            <p>Try another search or clear your filters.</p>
            <button
              className="text-button"
              type="button"
              onClick={() => { setQuery(""); setActiveTag("All"); }}
            >
              Clear filters
            </button>
          </div>
        )}
      </section>

      <button className="mobile-fab" type="button" onClick={openNewBook} aria-label="Add a book">
        <span aria-hidden="true">＋</span>
      </button>

      {editorOpen && (
        <div className="dialog-backdrop">
          <section
            className="book-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <div className="dialog-grabber" aria-hidden="true" />
            <div className="dialog-heading">
              <div>
                <p className="section-kicker">{editingId ? "A tiny revision" : "Freshly influenced"}</p>
                <h2 id="dialog-title">{editingId ? "Edit this book" : "Add to the pile"}</h2>
              </div>
              <button className="close-button" type="button" onClick={closeEditor} aria-label="Close">
                ×
              </button>
            </div>

            <form onSubmit={saveBook}>
              <div className="cover-picker-row">
                <label className="cover-picker">
                  {coverPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverPreview} alt="Selected book cover preview" />
                  ) : (
                    <span><b>＋</b>Add cover</span>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) => chooseCover(event.target.files?.[0] ?? null)}
                  />
                </label>
                <div className="cover-help">
                  <strong>Cover is optional</strong>
                  <span>Upload a photo, or paste an image link below.</span>
                  <label>
                    <span className="sr-only">Book cover image URL</span>
                    <input
                      type="url"
                      value={coverFile ? "" : draft.coverUrl}
                      disabled={Boolean(coverFile)}
                      onChange={(event) => {
                        setDraft((current) => ({ ...current, coverUrl: event.target.value, coverKey: "" }));
                        setCoverPreview(event.target.value);
                      }}
                      placeholder="https://…"
                    />
                  </label>
                </div>
              </div>

              <div className="field-row">
                <label className="form-field">
                  <span>Book title</span>
                  <input
                    autoFocus
                    required
                    value={draft.title}
                    onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                    placeholder="The one everyone is yelling about"
                  />
                </label>
                <label className="form-field">
                  <span>Author</span>
                  <input
                    required
                    value={draft.author}
                    onChange={(event) => setDraft((current) => ({ ...current, author: event.target.value }))}
                    placeholder="Author name"
                  />
                </label>
              </div>

              <label className="form-field">
                <span>Why did you want to read it?</span>
                <textarea
                  value={draft.reason}
                  onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))}
                  placeholder="That one review said the banter was elite…"
                  rows={3}
                />
              </label>

              <div className="form-field tags-field">
                <div className="label-row">
                  <span>Tropes & tags</span>
                  <small>No limit. Go wild.</small>
                </div>
                <div className="tag-entry">
                  {draft.tags.map((tag) => (
                    <button
                      type="button"
                      onClick={() => setDraft((current) => ({
                        ...current,
                        tags: current.tags.filter((item) => item !== tag),
                      }))}
                      key={tag}
                      aria-label={`Remove ${tag}`}
                    >
                      {tag} <span>×</span>
                    </button>
                  ))}
                  <input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={handleTagKeyDown}
                    onBlur={() => addTags(tagInput)}
                    placeholder={draft.tags.length ? "Add another…" : "slow burn, enemies to lovers…"}
                  />
                </div>
                <small className="field-hint">Press enter or use commas to separate tags.</small>
              </div>

              {error && <p className="form-error" role="alert">{error}</p>}

              <div className="dialog-actions">
                <button className="cancel-button" type="button" onClick={closeEditor}>Cancel</button>
                <button className="save-button" type="submit" disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Save changes" : "Add to my TBR"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status">✓ {notice}</div>}
    </main>
  );
}
