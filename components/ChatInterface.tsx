"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SearchSource = {
  title: string;
  snippet: string;
  uri?: string;
};

type Department = {
  id: string;
  label: string;
  description: string;
};

type ChatMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; sources: SearchSource[] };

type ChatResponse = {
  answer: string;
  sources: SearchSource[];
};

function isBrowserLink(uri?: string): boolean {
  if (!uri) {
    return false;
  }

  return uri.startsWith("http://") || uri.startsWith("https://");
}

function mergeSourcesByTitle(sources: SearchSource[]): SearchSource[] {
  const merged = new Map<string, SearchSource>();

  for (const source of sources) {
    const existing = merged.get(source.title);
    if (!existing) {
      merged.set(source.title, { ...source });
      continue;
    }

    const snippetParts = new Set<string>();
    for (const text of [existing.snippet, source.snippet]) {
      const trimmed = text.trim();
      if (trimmed) {
        snippetParts.add(trimmed);
      }
    }

    existing.snippet = [...snippetParts].join("\n\n");
    existing.uri = existing.uri ?? source.uri;
  }

  return [...merged.values()];
}

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatMessageForCopy(content: string, sources: SearchSource[]): string {
  const mergedSources = mergeSourcesByTitle(sources);
  const lines = ["【回答】", content.trim()];

  if (mergedSources.length > 0) {
    lines.push("", "【参照元】");
    mergedSources.forEach((source, index) => {
      lines.push(`${index + 1}. ${source.title}`);
    });
  }

  return lines.join("\n");
}

function CopyAnswerButton({
  content,
  sources,
}: {
  content: string;
  sources: SearchSource[];
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(formatMessageForCopy(content, sources));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
    >
      {copied ? "コピーしました" : "コピー"}
    </button>
  );
}

function SourceList({ sources }: { sources: SearchSource[] }) {
  const mergedSources = useMemo(
    () => mergeSourcesByTitle(sources),
    [sources],
  );

  if (mergedSources.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        参照元（{mergedSources.length}件）
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        ▶ をクリックして詳細を表示
      </p>
      <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
        {mergedSources.map((source) => (
          <li key={source.title}>
            <details className="group py-2">
              <summary className="flex cursor-pointer list-none items-center gap-3 text-left marker:content-none">
                <span
                  aria-hidden
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-base text-zinc-600 transition group-open:rotate-90 group-open:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:group-open:bg-zinc-700"
                >
                  ▶
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {isBrowserLink(source.uri) ? (
                    <a
                      href={source.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline-offset-2 hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {source.title}
                    </a>
                  ) : (
                    source.title
                  )}
                </span>
              </summary>
              {source.snippet ? (
                <p className="mt-2 ml-12 whitespace-pre-wrap text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {source.snippet}
                </p>
              ) : (
                <p className="mt-2 ml-12 text-sm text-zinc-500">
                  本文スニペットはありません。
                </p>
              )}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DepartmentCards({
  departments,
  selectedDepartmentId,
  onSelect,
  disabled,
}: {
  departments: Department[];
  selectedDepartmentId: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {departments.map((department) => {
        const isSelected = selectedDepartmentId === department.id;

        return (
          <button
            key={department.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(department.id)}
            className={`rounded-xl border px-4 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isSelected
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-200 bg-white hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
            }`}
          >
            <p className="text-sm font-semibold">{department.label}</p>
            <p
              className={`mt-1 text-xs leading-5 ${
                isSelected
                  ? "text-zinc-200 dark:text-zinc-600"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {department.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}

export function ChatInterface() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingScrollId = useRef<string | null>(null);

  const selectedDepartment = useMemo(
    () => departments.find((department) => department.id === selectedDepartmentId),
    [departments, selectedDepartmentId],
  );

  useEffect(() => {
    async function loadDepartments() {
      try {
        const response = await fetch("/api/departments");
        const data = (await response.json()) as {
          departments?: Department[];
          error?: string;
        };

        if (!response.ok) {
          setError(data.error ?? "資料カテゴリの取得に失敗しました。");
          return;
        }

        setDepartments(data.departments ?? []);
      } catch {
        setError("資料カテゴリの取得に失敗しました。");
      } finally {
        setLoadingDepartments(false);
      }
    }

    void loadDepartments();
  }, []);

  useEffect(() => {
    if (!pendingScrollId.current) {
      return;
    }

    const element = messageRefs.current.get(pendingScrollId.current);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      pendingScrollId.current = null;
    }
  }, [messages, loading]);

  function setMessageRef(id: string, element: HTMLDivElement | null) {
    if (element) {
      messageRefs.current.set(id, element);
      return;
    }

    messageRefs.current.delete(id);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = input.trim();
    if (!query || loading || !selectedDepartmentId) {
      return;
    }

    setError("");
    setLoading(true);
    setInput("");

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: query,
    };
    setMessages((current) => [...current, userMessage]);
    pendingScrollId.current = userMessage.id;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, departmentId: selectedDepartmentId }),
      });

      const data = (await response.json()) as ChatResponse & { error?: string };

      if (!response.ok) {
        setError(data.error ?? "回答の取得に失敗しました。");
        return;
      }

      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content: data.answer,
        sources: data.sources,
      };
      setMessages((current) => [...current, assistantMessage]);
      pendingScrollId.current = assistantMessage.id;
    } catch {
      setError("回答の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  function handleNewConversation() {
    setMessages([]);
    setInput("");
    setError("");
    setSelectedDepartmentId(null);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col">
      <header className="shrink-0 border-b border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-800 dark:bg-black">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              社内マニュアル検索
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {selectedDepartment
                ? `検索対象: ${selectedDepartment.label}`
                : "資料カテゴリを選択してから質問してください。"}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={handleNewConversation}
              disabled={loading}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              検索をリセット
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && !loading ? (
          <div className="space-y-4">
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
              検索する資料カテゴリを選択してください。
            </p>
            {loadingDepartments ? (
              <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
                カテゴリを読み込み中...
              </p>
            ) : (
              <DepartmentCards
                departments={departments}
                selectedDepartmentId={selectedDepartmentId}
                onSelect={setSelectedDepartmentId}
                disabled={loading}
              />
            )}
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          {messages.map((message) =>
            message.role === "user" ? (
              <div
                key={message.id}
                ref={(element) => setMessageRef(message.id, element)}
                className="flex justify-end scroll-mt-4"
              >
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-900 px-4 py-3 text-sm leading-6 text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {message.content}
                </div>
              </div>
            ) : (
              <div
                key={message.id}
                ref={(element) => setMessageRef(message.id, element)}
                className="flex justify-start scroll-mt-4"
              >
                <div className="max-w-[95%] rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="mb-2 flex items-start justify-end">
                    <CopyAnswerButton
                      content={message.content}
                      sources={message.sources}
                    />
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-900 dark:text-zinc-100">
                    {message.content}
                  </p>
                  <SourceList sources={message.sources} />
                </div>
              </div>
            ),
          )}

          {loading ? (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
                回答を生成中...
              </div>
            </div>
          ) : null}
        </div>
      </main>

      <footer className="shrink-0 border-t border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-800 dark:bg-black">
        {error ? (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              selectedDepartment
                ? `${selectedDepartment.label}について質問してください...`
                : "先に資料カテゴリを選択してください..."
            }
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            disabled={loading || !selectedDepartmentId}
            required
          />
          <button
            type="submit"
            disabled={loading || !selectedDepartmentId}
            className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {loading ? "検索中..." : "送信"}
          </button>
        </form>
      </footer>
    </div>
  );
}
